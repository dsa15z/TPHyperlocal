// @ts-nocheck
import { Worker, Job } from 'bullmq';
import { createChildLogger } from '../lib/logger.js';
import { getSharedConnection } from '../lib/redis.js';
import prisma from '../lib/prisma.js';

const logger = createChildLogger('prediction');

// ─── Types ─────────────────────────────────────────────────────────────────

interface PredictionJob {
  storyId: string;
}

interface PredictionModel {
  weights: number[];  // 13 weights
  bias: number;
  trainedOn: number;  // count of training examples
  lastTrainedAt: string;
  accuracy: { correct: number; total: number };
}

const MODEL_KEY = 'bn:prediction:model';
const FEATURE_COUNT = 13;
const BASE_LEARNING_RATE = 0.01;
const TRAINING_AGE_THRESHOLD_MS = 6 * 60 * 60 * 1000; // 6 hours
const TRAINING_BATCH_LIMIT = 20; // max stories to train on per job

// ─── Math helpers ──────────────────────────────────────────────────────────

function sigmoid(x: number): number {
  // Clamp to avoid overflow
  const clamped = Math.max(-500, Math.min(500, x));
  return 1 / (1 + Math.exp(-clamped));
}

function dot(a: number[], b: number[]): number {
  let sum = 0;
  for (let i = 0; i < a.length; i++) {
    sum += a[i] * b[i];
  }
  return sum;
}

// ─── Default model (initialized from existing heuristic weights) ───────────

function createDefaultModel(): PredictionModel {
  // Map original 6 heuristic weights to 13-feature positions, zero-init new ones
  // Original: velocityTrend=0.25, diversity=0.20, engagement=0.15, category=0.10, earlyVelocity=0.20, trust=0.10
  return {
    weights: [
      0.25,  // 0: velocityTrend
      0.20,  // 1: sourceDiversity
      0.15,  // 2: engagementMomentum
      0.10,  // 3: categoryFactor
      0.20,  // 4: earlyVelocity
      0.10,  // 5: avgTrust
      0.05,  // 6: hourOfDay (new)
      0.03,  // 7: dayOfWeek (new)
      0.08,  // 8: sentimentIntensity (new)
      0.05,  // 9: entityCount (new)
      0.04,  // 10: hasLocation (new)
      0.07,  // 11: crossPlatformCount (new)
      -0.05, // 12: ageMinutes (new, negative = newer is better)
    ],
    bias: -0.3,
    trainedOn: 0,
    lastTrainedAt: new Date().toISOString(),
    accuracy: { correct: 0, total: 0 },
  };
}

// ─── Model persistence (Redis) ─────────────────────────────────────────────

async function loadModel(): Promise<PredictionModel> {
  try {
    const conn = getSharedConnection();
    const raw = await conn.get(MODEL_KEY);
    if (raw) {
      const model = JSON.parse(raw) as PredictionModel;
      // Validate model integrity
      if (model.weights && model.weights.length === FEATURE_COUNT) {
        return model;
      }
      logger.warn('Model weights length mismatch, reinitializing');
    }
  } catch (err) {
    logger.warn({ err }, 'Failed to load model from Redis, using defaults');
  }
  return createDefaultModel();
}

async function saveModel(model: PredictionModel): Promise<void> {
  try {
    const conn = getSharedConnection();
    await conn.set(MODEL_KEY, JSON.stringify(model));
  } catch (err) {
    logger.error({ err }, 'Failed to save model to Redis');
  }
}

// ─── Feature extraction ────────────────────────────────────────────────────

function extractFeatures(
  story: any,
  sources: any[],
  snapshots: any[],
): number[] {
  const now = Date.now();
  const ageMinutes = (now - new Date(story.firstSeenAt).getTime()) / (1000 * 60);

  // Feature 0: Velocity trend (are scores increasing?)
  let velocityTrend = 0;
  if (snapshots.length >= 3) {
    const recent = snapshots.slice(0, 3).map((s) => s.compositeScore);
    const avgRecent = recent.reduce((a, b) => a + b, 0) / recent.length;
    const oldest = snapshots[snapshots.length - 1]?.compositeScore || 0;
    velocityTrend = oldest > 0
      ? Math.min(1, (avgRecent / oldest - 1) * 2)
      : avgRecent > 0.3 ? 0.5 : 0;
  }

  // Feature 1: Source diversity
  const uniqueSources = new Set(sources.map((s) => s.sourcePost.sourceId));
  const sourceDiversity = Math.min(1, uniqueSources.size / 5);

  // Feature 2: Engagement momentum
  const totalEngagement = sources.reduce((sum, s) => {
    return sum + s.sourcePost.engagementLikes + s.sourcePost.engagementShares * 2 + s.sourcePost.engagementComments;
  }, 0);
  const engagementPerMinute = ageMinutes > 0 ? totalEngagement / ageMinutes : 0;
  const engagementMomentum = Math.min(1, engagementPerMinute / 10);

  // Feature 3: Category virality factor
  const categoryViralityMap: Record<string, number> = {
    CRIME: 0.7, WEATHER: 0.8, TRAFFIC: 0.5, POLITICS: 0.6,
    SPORTS: 0.5, COMMUNITY: 0.4, HEALTH: 0.5, BUSINESS: 0.3,
    TECHNOLOGY: 0.4, ENTERTAINMENT: 0.6, ENVIRONMENT: 0.4, EDUCATION: 0.3,
  };
  const categoryFactor = categoryViralityMap[story.category || ''] || 0.3;

  // Feature 4: Early velocity (posts in first 30 min)
  const thirtyMinAgo = new Date(now - 30 * 60 * 1000);
  const earlyPosts = sources.filter((s) => new Date(s.addedAt) >= thirtyMinAgo).length;
  const earlyVelocity = Math.min(1, earlyPosts / 5);

  // Feature 5: Average trust score
  const avgTrust = sources.length > 0
    ? sources.reduce((sum, s) => sum + (s.sourcePost.source?.trustScore || 0), 0) / sources.length
    : 0;

  // Feature 6: Hour of day (normalized)
  const currentHour = new Date().getHours();
  const hourOfDay = currentHour / 24;

  // Feature 7: Day of week (normalized)
  const currentDay = new Date().getDay();
  const dayOfWeek = currentDay / 7;

  // Feature 8: Sentiment intensity (abs of sentiment from source posts)
  let sentimentSum = 0;
  let sentimentCount = 0;
  for (const s of sources) {
    const raw = s.sourcePost.rawData;
    if (raw && typeof raw === 'object') {
      const sentiment = raw.sentimentScore ?? raw.sentiment;
      if (typeof sentiment === 'number') {
        sentimentSum += Math.abs(sentiment);
        sentimentCount++;
      }
    }
    // Also check enrichment metadata
    const enrichment = s.sourcePost.enrichmentMeta;
    if (enrichment && typeof enrichment === 'object') {
      const sentiment = enrichment.sentimentScore ?? enrichment.sentiment;
      if (typeof sentiment === 'number') {
        sentimentSum += Math.abs(sentiment);
        sentimentCount++;
      }
    }
  }
  const sentimentIntensity = sentimentCount > 0
    ? Math.min(1, sentimentSum / sentimentCount)
    : 0.5; // neutral default

  // Feature 9: Entity count (unique entities across all sources)
  const allEntities = new Set<string>();
  // Story-level entities
  if (story.entities && typeof story.entities === 'object') {
    const entityObj = story.entities;
    for (const category of ['people', 'organizations', 'locations', 'persons', 'orgs']) {
      if (Array.isArray(entityObj[category])) {
        entityObj[category].forEach((e: string) => allEntities.add(e));
      }
    }
  }
  // Source-level entities
  for (const s of sources) {
    const enrichment = s.sourcePost.enrichmentMeta;
    if (enrichment && typeof enrichment === 'object' && enrichment.entities) {
      const ents = enrichment.entities;
      if (Array.isArray(ents)) {
        ents.forEach((e: any) => allEntities.add(typeof e === 'string' ? e : e.name || ''));
      } else if (typeof ents === 'object') {
        for (const cat of Object.values(ents)) {
          if (Array.isArray(cat)) {
            (cat as string[]).forEach((e) => allEntities.add(e));
          }
        }
      }
    }
  }
  const entityCount = Math.min(1, allEntities.size / 10); // normalize: 10+ entities = 1.0

  // Feature 10: Has location
  const hasLocation = (story.locationName || story.neighborhood || story.latitude) ? 1.0 : 0.0;

  // Feature 11: Cross-platform count
  const platforms = new Set<string>();
  for (const s of sources) {
    const platform = s.sourcePost.source?.platform || s.sourcePost.platform;
    if (platform) platforms.add(platform);
  }
  const crossPlatformCount = Math.min(1, platforms.size / 4); // 4+ platforms = 1.0

  // Feature 12: Age (normalized, newer = higher potential)
  const ageNormalized = Math.min(ageMinutes, 360) / 360;

  return [
    velocityTrend,
    sourceDiversity,
    engagementMomentum,
    categoryFactor,
    earlyVelocity,
    avgTrust,
    hourOfDay,
    dayOfWeek,
    sentimentIntensity,
    entityCount,
    hasLocation,
    crossPlatformCount,
    ageNormalized,
  ];
}

// ─── Prediction ────────────────────────────────────────────────────────────

function predict(features: number[], model: PredictionModel): number {
  const z = dot(features, model.weights) + model.bias;
  return sigmoid(z);
}

// ─── Training (online gradient descent) ────────────────────────────────────

function train(
  model: PredictionModel,
  features: number[],
  actual: number,  // 1.0 = reached BREAKING/TOP_STORY, 0.0 = didn't
  lr: number,
): PredictionModel {
  const predicted = predict(features, model);
  const error = predicted - actual; // gradient of binary cross-entropy

  // Update weights: w_i -= lr * error * x_i
  const newWeights = model.weights.map((w, i) => w - lr * error * features[i]);
  const newBias = model.bias - lr * error;

  // Track accuracy
  const predictedLabel = predicted >= 0.5 ? 1 : 0;
  const isCorrect = predictedLabel === actual ? 1 : 0;

  return {
    weights: newWeights,
    bias: newBias,
    trainedOn: model.trainedOn + 1,
    lastTrainedAt: new Date().toISOString(),
    accuracy: {
      correct: model.accuracy.correct + isCorrect,
      total: model.accuracy.total + 1,
    },
  };
}

function getLearningRate(model: PredictionModel): number {
  // Decay learning rate as we see more examples
  // Start at 0.01, decay towards 0.001
  const decayFactor = Math.max(0.1, 1 / (1 + model.trainedOn / 500));
  return BASE_LEARNING_RATE * decayFactor;
}

// ─── Determine actual outcome for training ─────────────────────────────────

async function getActualOutcome(storyId: string): Promise<number | null> {
  // Check if the story ever reached BREAKING or TOP_STORY via state transitions
  const transitions = await prisma.storyStateTransition.findMany({
    where: { storyId },
    select: { toStatus: true },
  });

  if (transitions.length === 0) return null;

  const reachedBreaking = transitions.some(
    (t) => t.toStatus === 'BREAKING' || t.toStatus === 'TOP_STORY',
  );

  return reachedBreaking ? 1.0 : 0.0;
}

// ─── Training pass: update model on old stories ────────────────────────────

async function runTrainingPass(model: PredictionModel): Promise<PredictionModel> {
  const cutoff = new Date(Date.now() - TRAINING_AGE_THRESHOLD_MS);

  // Find stories older than 6h that have predictions but haven't been used for training
  // We use a simple approach: find recent predictions on old stories
  const trainablePredictions = await prisma.storyPrediction.findMany({
    where: {
      story: {
        firstSeenAt: { lte: cutoff },
      },
      // Only train on predictions made in the last 24h to avoid retraining on ancient data
      createdAt: { gte: new Date(Date.now() - 24 * 60 * 60 * 1000) },
    },
    include: {
      story: {
        include: {
          storySources: {
            include: { sourcePost: { include: { source: true } } },
            orderBy: { addedAt: 'desc' },
          },
          scoreSnapshots: {
            orderBy: { snapshotAt: 'desc' },
            take: 10,
          },
        },
      },
    },
    orderBy: { createdAt: 'desc' },
    distinct: ['storyId'],
    take: TRAINING_BATCH_LIMIT,
  });

  let updatedModel = { ...model };
  let trained = 0;

  for (const pred of trainablePredictions) {
    const actual = await getActualOutcome(pred.storyId);
    if (actual === null) continue;

    const features = extractFeatures(
      pred.story,
      pred.story.storySources,
      pred.story.scoreSnapshots,
    );

    const lr = getLearningRate(updatedModel);
    updatedModel = train(updatedModel, features, actual, lr);
    trained++;
  }

  if (trained > 0) {
    const accuracy = updatedModel.accuracy.total > 0
      ? ((updatedModel.accuracy.correct / updatedModel.accuracy.total) * 100).toFixed(1)
      : 'N/A';

    logger.info({
      trainedThisBatch: trained,
      totalTrainedOn: updatedModel.trainedOn,
      accuracy: accuracy + '%',
      lr: getLearningRate(updatedModel).toFixed(5),
    }, 'Training pass complete');
  }

  return updatedModel;
}

// ─── Main prediction flow ──────────────────────────────────────────────────

async function processPrediction(job: Job<PredictionJob>): Promise<void> {
  const { storyId } = job.data;

  // Fetch story with sources and snapshots
  const story = await prisma.story.findUnique({
    where: { id: storyId },
    include: {
      storySources: {
        include: { sourcePost: { include: { source: true } } },
        orderBy: { addedAt: 'desc' },
      },
      scoreSnapshots: {
        orderBy: { snapshotAt: 'desc' },
        take: 10,
      },
    },
  });

  if (!story) {
    logger.warn({ storyId }, 'Story not found for prediction');
    return;
  }

  // Step 1: Extract features
  const features = extractFeatures(story, story.storySources, story.scoreSnapshots);

  // Step 2: Load model
  let model = await loadModel();

  // Step 3: Predict
  const probability = predict(features, model);

  // Predict peak score based on current trajectory
  const currentScore = story.compositeScore;
  const peakPrediction = Math.min(1, currentScore * (1 + probability));

  // Predict final status
  let predictedStatus = 'ONGOING';
  if (probability > 0.7) predictedStatus = 'BREAKING';
  else if (probability > 0.5) predictedStatus = 'TOP_STORY';
  else if (probability > 0.3) predictedStatus = 'DEVELOPING';
  else if (probability < 0.1) predictedStatus = 'STALE';

  // Build factors map for transparency
  const featureNames = [
    'velocityTrend', 'sourceDiversity', 'engagementMomentum', 'categoryFactor',
    'earlyVelocity', 'avgTrust', 'hourOfDay', 'dayOfWeek', 'sentimentIntensity',
    'entityCount', 'hasLocation', 'crossPlatformCount', 'ageMinutes',
  ];
  const factors: Record<string, number> = {};
  for (let i = 0; i < features.length; i++) {
    factors[featureNames[i]] = parseFloat(features[i].toFixed(4));
  }
  // Also include weight contributions for interpretability
  for (let i = 0; i < features.length; i++) {
    factors[`w_${featureNames[i]}`] = parseFloat((model.weights[i] * features[i]).toFixed(4));
  }

  // Step 4: Store prediction
  await prisma.storyPrediction.create({
    data: {
      storyId,
      viralProbability: probability,
      peakScorePrediction: peakPrediction,
      predictedStatus,
      factors,
    },
  });

  logger.info({
    storyId,
    probability: (probability * 100).toFixed(1) + '%',
    predicted: predictedStatus,
    modelTrainedOn: model.trainedOn,
  }, 'Prediction complete');

  // Step 5: Training pass (run on subset of old stories)
  // Only train every 5th job to avoid excessive Redis writes
  const shouldTrain = Math.random() < 0.2;
  if (shouldTrain) {
    try {
      model = await runTrainingPass(model);
      await saveModel(model);
    } catch (err) {
      logger.error({ err }, 'Training pass failed (non-fatal)');
    }
  }
}

// ─── Worker factory ────────────────────────────────────────────────────────

export function createPredictionWorker(): Worker {
  const connection = getSharedConnection();
  const worker = new Worker<PredictionJob>(
    'prediction',
    async (job) => { await processPrediction(job); },
    { connection, concurrency: 5 },
  );

  worker.on('completed', (job) => logger.info({ jobId: job.id }, 'Prediction job completed'));
  worker.on('failed', (job, err) => logger.error({ jobId: job?.id, err: err.message }, 'Prediction job failed'));
  return worker;
}
