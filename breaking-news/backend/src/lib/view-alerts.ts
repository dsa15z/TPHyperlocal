// @ts-nocheck
/**
 * Proactive View Alerts — checks saved views for new stories
 * and surfaces counts via the chatbot/notification system.
 *
 * Called by the heartbeat response or a periodic check.
 */
import { prisma } from './prisma.js';

export interface ViewAlert {
  viewId: string;
  viewName: string;
  newStoryCount: number;
  topStory?: { id: string; title: string; status: string; compositeScore: number };
}

/**
 * Check all saved views for a user and return which ones have new stories
 * since the user last looked at them (based on view's updatedAt).
 */
export async function checkViewsForNewStories(userId: string): Promise<ViewAlert[]> {
  const alerts: ViewAlert[] = [];

  try {
    const views = await prisma.$queryRaw<Array<{
      id: string;
      name: string;
      filters: any;
      updatedAt: Date;
    }>>`
      SELECT id, name, filters, "updatedAt"
      FROM "UserView"
      WHERE "userId" = ${userId}
    `;

    if (!views || views.length === 0) return [];

    for (const view of views) {
      const filters = typeof view.filters === 'string' ? JSON.parse(view.filters) : (view.filters || {});
      const since = view.updatedAt || new Date(Date.now() - 60 * 60 * 1000);

      // Build a simple where clause from the view's saved filters
      const where: any = {
        mergedIntoId: null,
        firstSeenAt: { gte: since },
      };

      if (filters.categories?.length > 0) {
        where.category = { in: filters.categories };
      }
      if (filters.statuses?.length > 0) {
        where.status = { in: filters.statuses };
      }

      try {
        const count = await prisma.story.count({ where });
        if (count > 0) {
          const topStory = await prisma.story.findFirst({
            where,
            orderBy: { compositeScore: 'desc' },
            select: { id: true, title: true, status: true, compositeScore: true },
          });

          alerts.push({
            viewId: view.id,
            viewName: view.name,
            newStoryCount: count,
            topStory: topStory || undefined,
          });
        }
      } catch {
        // Skip views with invalid filters
      }
    }
  } catch {
    // Table might not exist yet
  }

  return alerts;
}

/**
 * Get a proactive suggestion message for the chatbot.
 */
export async function getProactiveSuggestion(userId: string): Promise<string | null> {
  const alerts = await checkViewsForNewStories(userId);
  if (alerts.length === 0) return null;

  const parts: string[] = [];
  for (const alert of alerts.slice(0, 3)) {
    parts.push(`**${alert.viewName}**: ${alert.newStoryCount} new ${alert.newStoryCount === 1 ? 'story' : 'stories'}${alert.topStory ? ` (top: "${alert.topStory.title.substring(0, 50)}...")` : ''}`);
  }

  return `I noticed new stories in your views:\n${parts.join('\n')}\n\nWant me to show you any of these?`;
}
