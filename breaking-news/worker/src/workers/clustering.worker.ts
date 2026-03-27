// @ts-nocheck
import { Worker, Queue, Job } from 'bullmq';
import { createChildLogger } from '../lib/logger.js';
import { getSharedConnection } from '../lib/redis.js';
import prisma from '../lib/prisma.js';
import {
  getWordSet,
  calculateJaccardSimilarity,
  calculateTimeProximity,
} from '../utils/text.js';

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

const SIMILARITY_THRESHOLD = 0.4;

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

async function processCluster(job: Job<ClusteringJob>): Promise<void> {
  const { sourcePostId, category, locationName, neighborhoods, entities } = job.data;

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

  let bestStory: typeof recentStories[number] | null = null;
  let bestSimilarity = 0;

  for (const story of recentStories) {
    // Calculate text similarity against the story's posts
    let maxTextSim = 0;
    for (const storySource of story.storySources) {
      const storyText = `${storySource.sourcePost.title || ''} ${storySource.sourcePost.content}`;
      const storyWordSet = getWordSet(storyText);
      const textSim = calculateJaccardSimilarity(postWordSet, storyWordSet);
      maxTextSim = Math.max(maxTextSim, textSim);
    }

    // Calculate entity similarity
    const entitySim = calculateEntitySimilarity(
      entities,
      category,
      neighborhoods,
      story.category,
      story.locationName,
      story.neighborhood,
    );

    // Calculate time proximity (compare against the story's most recent activity)
    const timeProximity = calculateTimeProximity(post.publishedAt, story.lastUpdatedAt, 2);

    // Combined similarity
    const combinedSimilarity = 0.6 * maxTextSim + 0.2 * entitySim + 0.2 * timeProximity;

    logger.debug({
      sourcePostId,
      storyId: story.id,
      maxTextSim,
      entitySim,
      timeProximity,
      combinedSimilarity,
    }, 'Similarity scores');

    if (combinedSimilarity > bestSimilarity) {
      bestSimilarity = combinedSimilarity;
      bestStory = story;
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
    }, 'Adding post to existing story');

    // Create StorySource link
    await prisma.storySource.create({
      data: {
        storyId,
        sourcePostId: post.id,
        similarityScore: bestSimilarity,
        isPrimary: false,
      },
    });

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
        ...(!bestStory.locationName && locationName
          ? { locationName }
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

    const story = await prisma.story.create({
      data: {
        title: post.title || post.content.substring(0, 100),
        category: category !== 'OTHER' ? category : undefined,
        locationName: locationName || undefined,
        neighborhood: neighborhoods.length > 0 ? neighborhoods[0] : undefined,
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

  logger.info({ sourcePostId, storyId }, 'Clustering complete');
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
