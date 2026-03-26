export interface FeedConfig {
  title: string;
  description: string;
  link: string;
  language?: string;
  copyright?: string;
  managingEditor?: string;
  ttl?: number;
}

export interface FeedStory {
  id: string;
  title: string;
  description: string;
  link: string;
  publishedAt: Date | string;
  category?: string;
  author?: string;
}

function escapeXml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function formatRFC822(date: Date | string): string {
  const d = typeof date === 'string' ? new Date(date) : date;
  return d.toUTCString();
}

function buildItem(story: FeedStory): string {
  const lines: string[] = [
    '    <item>',
    `      <title>${escapeXml(story.title)}</title>`,
    `      <link>${escapeXml(story.link)}</link>`,
    `      <description>${escapeXml(story.description)}</description>`,
    `      <pubDate>${formatRFC822(story.publishedAt)}</pubDate>`,
    `      <guid isPermaLink="false">${escapeXml(story.id)}</guid>`,
  ];

  if (story.category) {
    lines.push(`      <category>${escapeXml(story.category)}</category>`);
  }

  if (story.author) {
    lines.push(`      <dc:creator>${escapeXml(story.author)}</dc:creator>`);
  }

  lines.push('    </item>');
  return lines.join('\n');
}

export function generateRSSFeed(feedConfig: FeedConfig, stories: FeedStory[]): string {
  const {
    title,
    description,
    link,
    language = 'en-us',
    copyright,
    managingEditor,
    ttl = 15,
  } = feedConfig;

  const channelMeta: string[] = [
    `      <title>${escapeXml(title)}</title>`,
    `      <link>${escapeXml(link)}</link>`,
    `      <description>${escapeXml(description)}</description>`,
    `      <language>${escapeXml(language)}</language>`,
    `      <ttl>${ttl}</ttl>`,
    `      <lastBuildDate>${formatRFC822(new Date())}</lastBuildDate>`,
    `      <generator>Breaking News Intelligence Platform</generator>`,
  ];

  if (copyright) {
    channelMeta.push(`      <copyright>${escapeXml(copyright)}</copyright>`);
  }

  if (managingEditor) {
    channelMeta.push(`      <managingEditor>${escapeXml(managingEditor)}</managingEditor>`);
  }

  const items = stories.map(buildItem).join('\n');

  return `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:atom="http://www.w3.org/2005/Atom">
  <channel>
${channelMeta.join('\n')}
${items}
  </channel>
</rss>`;
}
