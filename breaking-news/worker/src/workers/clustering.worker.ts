// @ts-nocheck
import { Worker, Queue, Job } from 'bullmq';
import { createChildLogger } from '../lib/logger.js';
import { getSharedConnection } from '../lib/redis.js';
import prisma from '../lib/prisma.js';
import { extractLocation } from '../utils/text.js';
import {
  getWordSet,
  calculateJaccardSimilarity,
  calculateTimeProximity,
} from '../utils/text.js';
import { getEmbedding, cosineSimilarity } from '../lib/embeddings-client.js';

const logger = createChildLogger('clustering');

interface ClusteringJob {
  sourcePostId: string;
  category: string;
  locationName?: string;
  neighborhoods: string[];
  entities: {
    locations: string[];
    organizations: string[];
    people: string[];
  };
}

const JACCARD_PREFILTER_THRESHOLD = 0.25;
const EMBEDDING_MERGE_THRESHOLD = 0.75;
const EMBEDDING_RELATED_THRESHOLD = 0.60;
const SIMILARITY_THRESHOLD = 0.4; // Legacy combined threshold (kept as final fallback)
const MAX_EMBEDDING_CANDIDATES = 5;

/**
 * Calculate entity overlap similarity between a new post and an existing story's sources
 */
function calculateEntitySimilarity(
  postEntities: ClusteringJob['entities'],
  postCategory: string,
  postNeighborhoods: string[],
  storyCategory: string | null,
  storyLocation: string | null,
  storyNeighborhood: string | null,
): number {
  let score = 0;
  let factors = 0;

  // Category match
  if (storyCategory && postCategory === storyCategory && postCategory !== 'OTHER') {
    score += 1.0;
  }
  factors++;

  // Location overlap
  if (storyLocation) {
    const allPostLocations = [
      ...postEntities.locations,
      ...postNeighborhoods,
    ].map((l) => l.toLowerCase());
    if (allPostLocations.includes(storyLocation.toLowerCase())) {
      score += 1.0;
    }
  }
  factors++;

  // Neighborhood match
  if (storyNeighborhood && postNeighborhoods.length > 0) {
    if (postNeighborhoods.map((n) => n.toLowerCase()).includes(storyNeighborhood.toLowerCase())) {
      score += 1.0;
    }
  }
  factors++;

  return factors > 0 ? score / factors : 0;
}

/**
 * Extract a short topic description from text for merge explanation
 */
function extractTopic(text: string): string {
  // Take the first meaningful chunk of text as a topic summary
  const cleaned = text.replace(/\s+/g, ' ').trim();
  const firstSentence = cleaned.split(/[.!?]/)[0]?.trim() || cleaned;
  return firstSentence.length > 80 ? firstSentence.substring(0, 77) + '...' : firstSentence;
}

interface CandidateStory {
  story: any;
  jaccardScore: number;
  maxTextSim: number;
  entitySim: number;
  timeProximity: number;
  combinedSimilarity: number;
  bestSourceText: string;
}

async function processCluster(job: Job<ClusteringJob>): Promise<void> {
  const { sourcePostId, category, locationName: enrichedLocation, neighborhoods, entities } = job.data;

  logger.info({ sourcePostId, category }, 'Clustering source post');

  // Fetch the source post
  const post = await prisma.sourcePost.findUnique({
    where: { id: sourcePostId },
  });

  if (!post) {
    logger.warn({ sourcePostId }, 'Source post not found, skipping clustering');
    return;
  }

  // Get the word set for the new post
  const postText = `${post.title || ''} ${post.content}`;
  const postWordSet = getWordSet(postText);

  // Find recent stories (last 24 hours, not archived)
  const recentCutoff = new Date(Date.now() - 24 * 60 * 60 * 1000);
  const recentStories = await prisma.story.findMany({
    where: {
      status: { not: 'ARCHIVED' },
      lastUpdatedAt: { gte: recentCutoff },
      mergedIntoId: null, // Don't match against merged stories
    },
    include: {
      storySources: {
        include: {
          sourcePost: true,
        },
        orderBy: { addedAt: 'desc' },
        take: 10, // Compare against up to 10 most recent posts in the story
      },
    },
  });

  logger.info({ sourcePostId, recentStories: recentStories.length }, 'Comparing against recent stories');

  // --- Stage 1: Jaccard pre-filter to find candidate stories ---
  const candidates: CandidateStory[] = [];

  for (const story of recentStories) {
    let maxTextSim = 0;
    let bestSourceText = '';
    for (const storySource of story.storySources) {
      const storyText = `${storySource.sourcePost.title || ''} ${storySource.sourcePost.content}`;
      const storyWordSet = getWordSet(storyText);
      const textSim = calculateJaccardSimilarity(postWordSet, storyWordSet);
      if (textSim > maxTextSim) {
        maxTextSim = textSim;
        bestSourceText = storyText;
      }
    }

    const entitySim = calculateEntitySimilarity(
      entities,
      category,
      neighborhoods,
      story.category,
      story.locationName,
      story.neighborhood,
    );

    const timeProximity = calculateTimeProximity(post.publishedAt, story.lastUpdatedAt, 2);

    const combinedSimilarity = 0.6 * maxTextSim + 0.2 * entitySim + 0.2 * timeProximity;

    logger.debug({
      sourcePostId,
      storyId: story.id,
      maxTextSim,
      entitySim,
      timeProximity,
      combinedSimilarity,
    }, 'Jaccard similarity scores');

    // Pre-filter: only consider stories with Jaccard above threshold
    if (maxTextSim >= JACCARD_PREFILTER_THRESHOLD || combinedSimilarity > SIMILARITY_THRESHOLD) {
      candidates.push({
        story,
        jaccardScore: maxTextSim,
        maxTextSim,
        entitySim,
        timeProximity,
        combinedSimilarity,
        bestSourceText,
      });
    }
  }

  // Sort candidates by combined similarity and take top N for embedding comparison
  candidates.sort((a, b) => b.combinedSimilarity - a.combinedSimilarity);
  const topCandidates = candidates.slice(0, MAX_EMBEDDING_CANDIDATES);

  logger.info({
    sourcePostId,
    totalCandidates: candidates.length,
    topCandidates: topCandidates.length,
  }, 'Jaccard pre-filter complete');

  // --- Stage 2: Embedding similarity for final decision ---
  let bestStory: typeof recentStories[number] | null = null;
  let bestSimilarity = 0;
  let bestEmbeddingSim = 0;
  let mergeReason = '';
  let relatedStoryId: string | null = null;

  if (topCandidates.length > 0) {
    // Get embedding for the new post
    let postEmbedding: number[] | null = null;
    try {
      const embeddingResult = await getEmbedding(postText);
      postEmbedding = embeddingResult.embedding;

      // Store embedding on the source post if embeddingJson field exists
      try {
        await prisma.sourcePost.update({
          where: { id: post.id },
          data: { embeddingJson: JSON.stringify(postEmbedding) },
        });
      } catch (updateErr) {
        // embeddingJson field may not exist in schema yet -- non-fatal
        logger.debug({ err: updateErr }, 'Could not store embedding on SourcePost (field may not exist)');
      }
    } catch (err) {
      logger.warn({ err }, 'Failed to get embedding for post, using Jaccard-only clustering');
    }

    for (const candidate of topCandidates) {
      let embeddingSim = 0;

      if (postEmbedding) {
        // Get embedding for the best matching source text in the story
        try {
          const storyEmbeddingResult = await getEmbedding(candidate.bestSourceText);
          embeddingSim = cosineSimilarity(postEmbedding, storyEmbeddingResult.embedding);
        } catch (err) {
          logger.warn({ err, storyId: candidate.story.id }, 'Failed to get story embedding');
        }
      }

      // Compute final score: blend of old combined similarity and embedding similarity
      // If we have embeddings, weight them heavily; otherwise fall back to Jaccard-based scoring
      let finalScore: number;
      if (postEmbedding && embeddingSim > 0) {
        finalScore = 0.35 * candidate.combinedSimilarity + 0.65 * embeddingSim;
      } else {
        finalScore = candidate.combinedSimilarity;
      }

      logger.debug({
        sourcePostId,
        storyId: candidate.story.id,
        jaccardScore: candidate.jaccardScore,
        embeddingSim,
        finalScore,
      }, 'Embedding similarity scores');

      // Check embedding thresholds
      if (postEmbedding && embeddingSim >= EMBEDDING_MERGE_THRESHOLD && finalScore > bestSimilarity) {
        bestSimilarity = finalScore;
        bestEmbeddingSim = embeddingSim;
        bestStory = candidate.story;
        const topic = extractTopic(postText);
        mergeReason = `Merged: ${Math.round(embeddingSim * 100)}% semantic similarity on topic '${topic}'`;
      } else if (postEmbedding && embeddingSim >= EMBEDDING_RELATED_THRESHOLD && embeddingSim < EMBEDDING_MERGE_THRESHOLD) {
        // Mark as related but don't merge
        if (!relatedStoryId) {
          relatedStoryId = candidate.story.id;
          logger.info({
            sourcePostId,
            relatedStoryId,
            embeddingSim,
          }, 'Found related story (below merge threshold)');
        }
      }

      // Fallback: if no embedding match found, use legacy combined threshold
      if (!bestStory && finalScore > bestSimilarity && finalScore > SIMILARITY_THRESHOLD) {
        bestSimilarity = finalScore;
        bestEmbeddingSim = embeddingSim;
        bestStory = candidate.story;
        const topic = extractTopic(postText);
        if (embeddingSim > 0) {
          mergeReason = `Merged: ${Math.round(embeddingSim * 100)}% semantic + ${Math.round(candidate.jaccardScore * 100)}% text overlap on '${topic}'`;
        } else {
          mergeReason = `Merged: ${Math.round(candidate.jaccardScore * 100)}% text overlap on '${topic}'`;
        }
      }
    }
  } else {
    // No candidates from Jaccard pre-filter -- check all stories with legacy method
    // (handles edge case where Jaccard is low but combined score is still decent)
    for (const story of recentStories) {
      let maxTextSim = 0;
      for (const storySource of story.storySources) {
        const storyText = `${storySource.sourcePost.title || ''} ${storySource.sourcePost.content}`;
        const storyWordSet = getWordSet(storyText);
        const textSim = calculateJaccardSimilarity(postWordSet, storyWordSet);
        maxTextSim = Math.max(maxTextSim, textSim);
      }

      const entitySim = calculateEntitySimilarity(
        entities,
        category,
        neighborhoods,
        story.category,
        story.locationName,
        story.neighborhood,
      );

      const timeProximity = calculateTimeProximity(post.publishedAt, story.lastUpdatedAt, 2);
      const combinedSimilarity = 0.6 * maxTextSim + 0.2 * entitySim + 0.2 * timeProximity;

      if (combinedSimilarity > bestSimilarity) {
        bestSimilarity = combinedSimilarity;
        bestStory = story;
        const topic = extractTopic(postText);
        mergeReason = `Merged: ${Math.round(maxTextSim * 100)}% text overlap on '${topic}'`;
      }
    }
  }

  let storyId: string;

  if (bestStory && bestSimilarity > SIMILARITY_THRESHOLD) {
    // Add to existing story cluster
    storyId = bestStory.id;

    logger.info({
      sourcePostId,
      storyId,
      similarity: bestSimilarity,
      embeddingSimilarity: bestEmbeddingSim,
      mergeReason,
    }, 'Adding post to existing story');

    // Content-hash dedup: skip if the story already has a source post with
    // identical content from the same news source. This prevents the same
    // article from inflating source counts when RSS guids vary between polls.
    const duplicateInStory = await prisma.storySource.findFirst({
      where: {
        storyId,
        sourcePost: {
          sourceId: post.sourceId,
          contentHash: post.contentHash,
        },
      },
    });

    if (duplicateInStory) {
      logger.info({ sourcePostId, storyId }, 'Skipping duplicate content already in story');
      // Enqueue scoring anyway (in case thresholds changed) but don't create a new link
      const scoringQueue = new Queue('scoring', { connection: getSharedConnection() });
      await scoringQueue.add('score', { storyId }, {
        attempts: 3,
        backoff: { type: 'exponential', delay: 2000 },
      });
      await scoringQueue.close();
      return;
    }

    // Create StorySource link
    await prisma.storySource.create({
      data: {
        storyId,
        sourcePostId: post.id,
        similarityScore: bestSimilarity,
        isPrimary: false,
      },
    });

    // Log the merge reason for traceability
    if (mergeReason) {
      logger.info({ sourcePostId, storyId, mergeReason }, 'Story merge reason');
    }

    // Update story metadata
    const sourceCount = await prisma.storySource.count({
      where: { storyId },
    });

    await prisma.story.update({
      where: { id: storyId },
      data: {
        sourceCount,
        lastUpdatedAt: new Date(),
        // Update category if the new post has a more specific category
        ...(category !== 'OTHER' && bestStory.category === 'OTHER'
          ? { category }
          : {}),
        // Update location if the story doesn't have one yet
        ...(!bestStory.locationName && (enrichedLocation || extractLocation(`${post.title || ''} ${post.content}`))
          ? { locationName: enrichedLocation || extractLocation(`${post.title || ''} ${post.content}`) }
          : {}),
        ...(!bestStory.neighborhood && neighborhoods.length > 0
          ? { neighborhood: neighborhoods[0] }
          : {}),
      },
    });
  } else {
    // Create a new story
    logger.info({
      sourcePostId,
      bestSimilarity,
    }, 'Creating new story');

    // Use enriched location, or extract from title/content as fallback
    const fullText = `${post.title || ''} ${post.content}`;
    const resolvedLocation = enrichedLocation || extractLocation(fullText) || undefined;

    const story = await prisma.story.create({
      data: {
        title: post.title || post.content.substring(0, 100),
        category: category !== 'OTHER' ? category : undefined,
        locationName: resolvedLocation,
        neighborhood: neighborhoods?.length > 0 ? neighborhoods[0] : undefined,
        sourceCount: 1,
        firstSeenAt: post.publishedAt,
        lastUpdatedAt: new Date(),
        storySources: {
          create: {
            sourcePostId: post.id,
            similarityScore: 1.0,
            isPrimary: true,
          },
        },
      },
    });

    storyId = story.id;

    // If we found a related story (embedding similarity between 0.60-0.75),
    // log it for future "related stories" feature
    if (relatedStoryId) {
      logger.info({
        newStoryId: storyId,
        relatedStoryId,
        sourcePostId,
      }, 'New story has a related story (not merged due to below-threshold embedding similarity)');
    }
  }

  // Enqueue to scoring queue
  const scoringQueue = new Queue('scoring', {
    connection: getSharedConnection(),
  });

  await scoringQueue.add('score', { storyId }, {
    attempts: 3,
    backoff: { type: 'exponential', delay: 2000 },
  });

  await scoringQueue.close();

  logger.info({ sourcePostId, storyId, mergeReason: mergeReason || 'new story' }, 'Clustering complete');
}

export function createClusteringWorker(): Worker {
  const connection = getSharedConnection();

  const worker = new Worker<ClusteringJob>(
    'clustering',
    async (job) => {
      await processCluster(job);
    },
    {
      connection,
      concurrency: 5,
    }
  );

  worker.on('completed', (job) => {
    logger.info({ jobId: job.id }, 'Clustering job completed');
  });

  worker.on('failed', (job, err) => {
    logger.error({ jobId: job?.id, err: err.message }, 'Clustering job failed');
  });

  return worker;
}
