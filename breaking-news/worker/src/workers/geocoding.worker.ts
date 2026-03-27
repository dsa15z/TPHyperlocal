// @ts-nocheck
import { Worker, Job } from 'bullmq';
import { createChildLogger } from '../lib/logger.js';
import { getSharedConnection } from '../lib/redis.js';
import prisma from '../lib/prisma.js';

const logger = createChildLogger('geocoding');

interface GeocodingJob {
  storyId: string;
}

async function processGeocoding(job: Job<GeocodingJob>): Promise<void> {
  const { storyId } = job.data;

  logger.info({ storyId }, 'Geocoding story location');

  const story = await prisma.story.findUnique({
    where: { id: storyId },
  });

  if (!story) {
    logger.warn({ storyId }, 'Story not found, skipping geocoding');
    return;
  }

  // Check it has a location but no coordinates yet
  if (!story.locationName && !story.neighborhood) {
    logger.info({ storyId }, 'Story has no location name or neighborhood, skipping');
    return;
  }

  if (story.latitude && story.longitude) {
    logger.info({ storyId }, 'Story already has coordinates, skipping');
    return;
  }

  // Build search query
  const locationPart = story.neighborhood || story.locationName;
  const query = `${locationPart}, Houston, TX`;

  // Call Nominatim
  const url = `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(query)}&format=json&limit=1`;

  let results: any[];
  try {
    const response = await fetch(url, {
      headers: {
        'User-Agent': 'BreakingNewsBot/1.0 (contact@example.com)',
      },
    });

    if (!response.ok) {
      logger.warn({ storyId, status: response.status }, 'Nominatim request failed');
      return;
    }

    results = await response.json();
  } catch (err: any) {
    logger.warn({ storyId, err: err.message }, 'Failed to call Nominatim');
    return;
  }

  if (!results || results.length === 0) {
    logger.info({ storyId, query }, 'No geocoding results found');
    return;
  }

  const { lat, lon } = results[0];
  const latitude = parseFloat(lat);
  const longitude = parseFloat(lon);

  if (isNaN(latitude) || isNaN(longitude)) {
    logger.warn({ storyId, lat, lon }, 'Invalid coordinates from Nominatim');
    return;
  }

  // Update Story with coordinates
  await prisma.story.update({
    where: { id: storyId },
    data: {
      latitude,
      longitude,
      geocodedAt: new Date(),
    },
  });

  logger.info({
    storyId,
    query,
    latitude,
    longitude,
  }, 'Geocoding complete');
}

export function createGeocodingWorker(): Worker {
  const connection = getSharedConnection();

  const worker = new Worker<GeocodingJob>(
    'geocoding',
    async (job) => {
      await processGeocoding(job);
    },
    {
      connection,
      concurrency: 1,
      limiter: {
        max: 1,
        duration: 1000,
      },
    }
  );

  worker.on('completed', (job) => {
    logger.info({ jobId: job.id }, 'Geocoding job completed');
  });

  worker.on('failed', (job, err) => {
    logger.error({ jobId: job?.id, err: err.message }, 'Geocoding job failed');
  });

  return worker;
}
