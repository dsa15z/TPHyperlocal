// @ts-nocheck
import { Worker, Job } from 'bullmq';
import { createChildLogger } from '../lib/logger.js';
import { getSharedConnection } from '../lib/redis.js';
import prisma from '../lib/prisma.js';
import { generate } from '../lib/llm-factory.js';
import { createWibbitzVideo, checkWibbitzStatus, uploadToVimeo, getVideoServiceStatus } from '../lib/video-services.js';

const logger = createChildLogger('video-generation');

// ─── Types ──────────────────────────────────────────────────────────────────

interface VideoGenerationJob {
  projectId: string;
  storyId: string;
  accountId: string;
  format: 'SOCIAL_CLIP' | 'WEB_PACKAGE' | 'BROADCAST_BROLL';
  duration: number; // seconds
}

interface VideoScene {
  sceneNumber: number;
  duration: number;
  visual: string;
  voiceover: string;
  graphicPrompt: string;
  lowerThird: string;
}

interface VideoOutput {
  title: string;
  script: string;
  scenes: VideoScene[];
  musicSuggestion: string;
  titleCard: { headline: string; subhead: string };
  hashtags: string[];
  totalDuration: number;
  format: string;
}

// ─── Format → FirstDraft type mapping ───────────────────────────────────────

const FORMAT_TO_DRAFT_TYPE: Record<string, string> = {
  SOCIAL_CLIP: 'video_social',
  WEB_PACKAGE: 'video_web',
  BROADCAST_BROLL: 'video_broadcast',
};

// ─── Format-specific prompts ────────────────────────────────────────────────

const FORMAT_PROMPTS: Record<string, { system: string; user: string }> = {
  SOCIAL_CLIP: {
    system: `You are a social media video producer for a local news station. You create punchy, attention-grabbing short-form video content optimized for Instagram Reels, TikTok, and YouTube Shorts. Keep it fast-paced with bold visuals.`,
    user: `Create a social media video clip ({{duration}} seconds) for this breaking news story.

Title: {{title}}
Summary: {{summary}}
Sources: {{sources}}
Location: {{location}}
Category: {{category}}

Requirements:
- Hook line in the first 2 seconds to stop scrolling
- 3-4 quick scenes (each 3-8 seconds)
- Bold, direct voiceover — conversational tone
- End with a call-to-action (follow, share, comment)
- Include relevant Houston/local hashtags

Respond ONLY with valid JSON in this exact format:
{
  "title": "Short punchy title for the video",
  "script": "Full narration script as one continuous text",
  "scenes": [
    {
      "sceneNumber": 1,
      "duration": 3,
      "visual": "Description of what to show visually",
      "voiceover": "Text to speak during this scene",
      "graphicPrompt": "AI image generation prompt for this scene's visual",
      "lowerThird": "Text overlay for this scene"
    }
  ],
  "musicSuggestion": "Genre, tempo, mood description",
  "titleCard": { "headline": "Main headline", "subhead": "Supporting text" },
  "hashtags": ["#Houston", "#BreakingNews"]
}`,
  },

  WEB_PACKAGE: {
    system: `You are a digital news video producer creating polished web packages for a local news station's website and app. Your videos are informative, well-sourced, and follow broadcast journalism standards. Include proper attribution and multiple perspectives.`,
    user: `Create a web video package ({{duration}} seconds) for this news story.

Title: {{title}}
Summary: {{summary}}
Sources: {{sources}}
Location: {{location}}
Category: {{category}}

Requirements:
- Professional intro with station branding hook
- 5-6 scenes with clear voiceover narration
- Source attribution in lower thirds
- Multiple angles/perspectives on the story
- Proper outro with reporter sign-off

Respond ONLY with valid JSON in this exact format:
{
  "title": "Professional video title",
  "script": "Full narration script as one continuous text",
  "scenes": [
    {
      "sceneNumber": 1,
      "duration": 8,
      "visual": "Description of what to show visually",
      "voiceover": "Text to speak during this scene",
      "graphicPrompt": "AI image generation prompt for this scene's visual",
      "lowerThird": "Source attribution or key fact text"
    }
  ],
  "musicSuggestion": "Genre, tempo, mood description",
  "titleCard": { "headline": "Main headline", "subhead": "Supporting context line" },
  "hashtags": ["#Houston", "#LocalNews"]
}`,
  },

  BROADCAST_BROLL: {
    system: `You are a broadcast news producer creating B-roll packages for on-air use. Your descriptions must be practical for a camera crew or stock footage search. Include specific anchor intro copy and lower third suggestions that match broadcast standards.`,
    user: `Create a broadcast B-roll package ({{duration}} seconds) for this news story.

Title: {{title}}
Summary: {{summary}}
Sources: {{sources}}
Location: {{location}}
Category: {{category}}

Requirements:
- Anchor intro copy (10-15 seconds of reading)
- 4-5 B-roll scene descriptions (specific enough for camera crew or stock footage)
- Lower third suggestions for each scene
- Natural sound (nat-sound) suggestions where relevant
- Keep it factual and attribution-heavy

Respond ONLY with valid JSON in this exact format:
{
  "title": "Broadcast package title",
  "script": "Full anchor read + voiceover narration as one continuous text",
  "scenes": [
    {
      "sceneNumber": 1,
      "duration": 6,
      "visual": "Specific B-roll description for camera crew",
      "voiceover": "Anchor/reporter voiceover for this scene",
      "graphicPrompt": "AI image generation prompt matching this B-roll",
      "lowerThird": "Lower third text overlay (name, title, or key fact)"
    }
  ],
  "musicSuggestion": "News bed description, tempo, urgency level",
  "titleCard": { "headline": "Breaking news headline", "subhead": "Location and time context" },
  "hashtags": ["#HoustonNews", "#Breaking"]
}`,
  },
};

// ─── Worker logic ───────────────────────────────────────────────────────────

async function processVideoGeneration(job: Job<VideoGenerationJob>): Promise<void> {
  const { projectId, storyId, accountId, format, duration } = job.data;

  logger.info({ projectId, storyId, format, duration }, 'Starting video generation');

  // 1. Fetch story + sources + AI summary
  const story = await prisma.story.findUnique({
    where: { id: storyId },
    include: {
      storySources: {
        include: {
          sourcePost: {
            include: { source: { select: { name: true, platform: true } } },
          },
        },
        take: 5,
        orderBy: { similarityScore: 'desc' },
      },
    },
  });

  if (!story) {
    logger.warn({ storyId }, 'Story not found for video generation');
    return;
  }

  // 2. Build context from story data
  const sourcesList = story.storySources
    .map((ss) => {
      const post = ss.sourcePost;
      const sourceName = post.source?.name || post.authorName || 'Unknown';
      const platform = post.source?.platform || 'Unknown';
      return `- ${sourceName} (${platform}): ${(post.content || post.title || '').substring(0, 200)}`;
    })
    .join('\n');

  const summary = story.aiSummary || story.summary || story.title;
  const location = story.locationName || story.neighborhood || 'Houston, TX';
  const category = story.category || 'General';

  // 3. Get format-specific prompt
  const promptDef = FORMAT_PROMPTS[format];
  if (!promptDef) {
    logger.error({ format }, 'Unknown video format');
    return;
  }

  const userPrompt = promptDef.user
    .replace('{{duration}}', String(duration))
    .replace('{{title}}', story.title)
    .replace('{{summary}}', summary.substring(0, 2000))
    .replace('{{sources}}', sourcesList.substring(0, 1500))
    .replace('{{location}}', location)
    .replace('{{category}}', category);

  // 4. Call LLM
  logger.info({ storyId, format }, 'Calling LLM for video script generation');

  const result = await generate(userPrompt, {
    systemPrompt: promptDef.system,
    maxTokens: 2000,
    temperature: 0.7,
  });

  // 5. Parse LLM output into structured format
  let videoOutput: VideoOutput;
  try {
    // Extract JSON from response (handle markdown code blocks)
    let jsonText = result.text.trim();
    const jsonMatch = jsonText.match(/```(?:json)?\s*([\s\S]*?)```/);
    if (jsonMatch) {
      jsonText = jsonMatch[1].trim();
    }

    const parsed = JSON.parse(jsonText);

    // Validate and normalize
    videoOutput = {
      title: parsed.title || story.title,
      script: parsed.script || '',
      scenes: (parsed.scenes || []).map((s: any, i: number) => ({
        sceneNumber: s.sceneNumber || i + 1,
        duration: s.duration || Math.floor(duration / (parsed.scenes?.length || 4)),
        visual: s.visual || '',
        voiceover: s.voiceover || '',
        graphicPrompt: s.graphicPrompt || '',
        lowerThird: s.lowerThird || '',
      })),
      musicSuggestion: parsed.musicSuggestion || 'Standard news bed',
      titleCard: {
        headline: parsed.titleCard?.headline || story.title,
        subhead: parsed.titleCard?.subhead || location,
      },
      hashtags: Array.isArray(parsed.hashtags) ? parsed.hashtags : ['#Houston', '#News'],
      totalDuration: duration,
      format,
    };
  } catch (parseError) {
    logger.warn({ storyId, error: (parseError as Error).message }, 'Failed to parse LLM JSON, building fallback');

    // Fallback: create structured output from raw text
    const sceneCount = format === 'SOCIAL_CLIP' ? 4 : format === 'WEB_PACKAGE' ? 6 : 5;
    const sceneDuration = Math.floor(duration / sceneCount);

    videoOutput = {
      title: story.title,
      script: result.text,
      scenes: Array.from({ length: sceneCount }, (_, i) => ({
        sceneNumber: i + 1,
        duration: sceneDuration,
        visual: `Scene ${i + 1} visual for: ${story.title}`,
        voiceover: '',
        graphicPrompt: `News graphic: ${story.title}, ${location}, ${category}`,
        lowerThird: i === 0 ? 'BREAKING NEWS' : `Source: ${story.storySources[i]?.sourcePost?.source?.name || 'Staff'}`,
      })),
      musicSuggestion: 'Urgent news bed, 120 BPM',
      titleCard: { headline: story.title, subhead: location },
      hashtags: ['#Houston', '#BreakingNews'],
      totalDuration: duration,
      format,
    };
  }

  // 6. Attempt Wibbitz video rendering if keys are available
  const serviceStatus = getVideoServiceStatus();
  let wibbitzVideoId: string | null = null;
  let wibbitzVideoUrl: string | null = null;
  let vimeoUrl: string | null = null;

  if (serviceStatus.wibbitz) {
    logger.info({ storyId, format }, 'Wibbitz keys available, submitting video for rendering');

    const wibbitzResult = await createWibbitzVideo({
      title: videoOutput.title,
      scenes: videoOutput.scenes.map((s) => ({
        text: s.voiceover || s.lowerThird,
        duration: s.duration,
        imagePrompt: s.graphicPrompt || undefined,
      })),
      music: videoOutput.musicSuggestion || undefined,
      format: format === 'SOCIAL_CLIP' ? 'portrait' : 'landscape',
    });

    if (wibbitzResult) {
      wibbitzVideoId = wibbitzResult.videoId;
      logger.info({ storyId, wibbitzVideoId }, 'Wibbitz video submitted for rendering');

      // Poll for completion (up to 5 attempts, 10s apart)
      for (let attempt = 0; attempt < 5; attempt++) {
        await new Promise((resolve) => setTimeout(resolve, 10000));
        const status = await checkWibbitzStatus(wibbitzResult.videoId);
        if (status?.status === 'ready' && status.url) {
          wibbitzVideoUrl = status.url;
          logger.info({ storyId, wibbitzVideoId, url: wibbitzVideoUrl }, 'Wibbitz video ready');
          break;
        } else if (status?.status === 'failed') {
          logger.warn({ storyId, wibbitzVideoId }, 'Wibbitz video rendering failed');
          break;
        }
        logger.info({ storyId, wibbitzVideoId, attempt: attempt + 1 }, 'Wibbitz video still processing');
      }

      // 7. Upload to Vimeo if video is ready and Vimeo token is available
      if (wibbitzVideoUrl && serviceStatus.vimeo) {
        logger.info({ storyId, wibbitzVideoUrl }, 'Uploading rendered video to Vimeo');
        const vimeoResult = await uploadToVimeo(wibbitzVideoUrl, videoOutput.title);
        if (vimeoResult) {
          vimeoUrl = vimeoResult.vimeoUrl;
          logger.info({ storyId, vimeoUrl, vimeoId: vimeoResult.vimeoId }, 'Video uploaded to Vimeo');
        }
      }
    } else {
      logger.warn({ storyId }, 'Wibbitz video creation returned null (auth or API error)');
    }
  } else {
    logger.info({ storyId }, 'Wibbitz not configured, storing storyboard only');
  }

  // 8. Attach rendering results to the video output
  const enrichedOutput = {
    ...videoOutput,
    ...(wibbitzVideoId && { wibbitzVideoId }),
    ...(wibbitzVideoUrl && { wibbitzVideoUrl }),
    ...(vimeoUrl && { vimeoUrl }),
  };

  // 9. Store result in FirstDraft table
  const draftType = FORMAT_TO_DRAFT_TYPE[format] || 'video_social';

  await prisma.firstDraft.create({
    data: {
      storyId,
      type: draftType,
      userId: accountId,
      content: JSON.stringify(enrichedOutput),
      model: result.model,
      tokens: result.tokens,
    },
  });

  logger.info({
    projectId,
    storyId,
    format,
    sceneCount: videoOutput.scenes.length,
    model: result.model,
    tokens: result.tokens,
    wibbitzVideoId,
    vimeoUrl,
  }, 'Video generation completed');
}

// ─── Worker export ──────────────────────────────────────────────────────────

export function createVideoGenerationWorker(): Worker {
  const connection = getSharedConnection();

  const worker = new Worker<VideoGenerationJob>(
    'video-generation',
    async (job) => {
      await processVideoGeneration(job);
    },
    {
      connection,
      concurrency: 2,
    },
  );

  worker.on('completed', (job) => {
    logger.info({ jobId: job.id, projectId: job.data.projectId }, 'Video generation job completed');
  });

  worker.on('failed', (job, err) => {
    logger.error({ jobId: job?.id, projectId: job?.data?.projectId, err: err.message }, 'Video generation job failed');
  });

  return worker;
}
