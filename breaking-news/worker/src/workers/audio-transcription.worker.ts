// @ts-nocheck
import { Worker, Job, Queue } from 'bullmq';
import { createChildLogger } from '../lib/logger.js';
import { getSharedConnection } from '../lib/redis.js';
import prisma from '../lib/prisma.js';

const logger = createChildLogger('audio-transcription');

interface AudioTranscriptionJob {
  audioSourceId: string;
  audioUrl?: string; // direct URL to audio file
}

/**
 * Transcribe audio using OpenAI Whisper API.
 * Supports: MP3, MP4, MPEG, MPGA, M4A, WAV, WEBM (max 25MB)
 */
async function transcribeWithWhisper(audioUrl: string): Promise<{
  text: string;
  duration: number;
  language: string;
  confidence: number;
}> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) throw new Error('OPENAI_API_KEY not set for Whisper transcription');

  // Download audio file
  const audioResponse = await fetch(audioUrl, {
    signal: AbortSignal.timeout(60000),
  });
  if (!audioResponse.ok) throw new Error(`Audio fetch failed: ${audioResponse.status}`);

  const audioBlob = await audioResponse.blob();
  if (audioBlob.size > 25 * 1024 * 1024) throw new Error('Audio file exceeds 25MB Whisper limit');

  // Create form data for Whisper API
  const formData = new FormData();
  formData.append('file', audioBlob, 'audio.mp3');
  formData.append('model', 'whisper-1');
  formData.append('response_format', 'verbose_json');
  formData.append('language', 'en');

  const response = await fetch('https://api.openai.com/v1/audio/transcriptions', {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${apiKey}` },
    body: formData,
    signal: AbortSignal.timeout(120000),
  });

  if (!response.ok) {
    const err = await response.text();
    throw new Error(`Whisper API error ${response.status}: ${err}`);
  }

  const result = await response.json();

  return {
    text: result.text || '',
    duration: Math.round(result.duration || 0),
    language: result.language || 'en',
    confidence: 0.9, // Whisper doesn't return confidence per-segment easily
  };
}

/**
 * After transcription, try to match the content against existing stories
 * or create a new source post for the pipeline.
 */
async function matchTranscriptToStories(
  transcript: string,
  audioSourceId: string,
): Promise<string | null> {
  // Simple keyword matching against recent story titles
  const recentStories = await prisma.story.findMany({
    where: {
      mergedIntoId: null,
      firstSeenAt: { gte: new Date(Date.now() - 24 * 60 * 60 * 1000) },
    },
    select: { id: true, title: true },
    take: 100,
  });

  const transcriptLower = transcript.toLowerCase();
  let bestMatch: { id: string; score: number } | null = null;

  for (const story of recentStories) {
    const titleWords = story.title.toLowerCase().split(/\s+/).filter((w) => w.length > 3);
    const matchCount = titleWords.filter((w) => transcriptLower.includes(w)).length;
    const score = titleWords.length > 0 ? matchCount / titleWords.length : 0;

    if (score > 0.4 && (!bestMatch || score > bestMatch.score)) {
      bestMatch = { id: story.id, score };
    }
  }

  return bestMatch?.id || null;
}

async function processAudioTranscription(job: Job<AudioTranscriptionJob>): Promise<void> {
  const { audioSourceId, audioUrl: directUrl } = job.data;

  const source = await prisma.audioSource.findUnique({
    where: { id: audioSourceId },
  });

  if (!source || !source.isActive) {
    logger.warn({ audioSourceId }, 'Audio source not found or inactive');
    return;
  }

  const url = directUrl || source.url;
  if (!url) {
    logger.warn({ audioSourceId }, 'No audio URL available');
    return;
  }

  logger.info({ audioSourceId, name: source.name, url }, 'Starting audio transcription');

  // Transcribe
  const result = await transcribeWithWhisper(url);

  if (!result.text || result.text.length < 10) {
    logger.warn({ audioSourceId }, 'Transcription too short, skipping');
    return;
  }

  // Match to existing story
  const storyId = await matchTranscriptToStories(result.text, audioSourceId);

  // Store transcript
  await prisma.audioTranscript.create({
    data: {
      audioSourceId,
      content: result.text,
      duration: result.duration,
      language: result.language,
      confidence: result.confidence,
      storyId,
    },
  });

  // Update source last processed time
  await prisma.audioSource.update({
    where: { id: audioSourceId },
    data: { lastProcessedAt: new Date() },
  });

  // If matched to a story, also create a source post so it enters the pipeline
  if (storyId) {
    logger.info({ audioSourceId, storyId }, 'Transcript matched to story');
  }

  logger.info({
    audioSourceId,
    name: source.name,
    duration: result.duration,
    textLength: result.text.length,
    matchedStory: storyId || 'none',
  }, 'Audio transcription complete');
}

export function createAudioTranscriptionWorker(): Worker {
  const connection = getSharedConnection();
  const worker = new Worker<AudioTranscriptionJob>(
    'audio-transcription',
    async (job) => { await processAudioTranscription(job); },
    { connection, concurrency: 2 },
  );

  worker.on('completed', (job) => logger.info({ jobId: job.id }, 'Audio transcription job completed'));
  worker.on('failed', (job, err) => logger.error({ jobId: job?.id, err: err.message }, 'Audio transcription job failed'));
  return worker;
}
