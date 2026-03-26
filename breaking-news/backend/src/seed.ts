import { PrismaClient } from '@prisma/client';
import crypto from 'crypto';

const prisma = new PrismaClient();

async function main() {
  console.log('Seeding database...');

  // --- RSS Sources ---
  const rssSources = [
    {
      name: 'Houston Chronicle',
      type: 'rss' as const,
      url: 'https://www.houstonchronicle.com/rss/feed/Houston-breaking-news-702.php',
      active: true,
    },
    {
      name: 'KHOU 11',
      type: 'rss' as const,
      url: 'https://www.khou.com/feeds/syndication/rss/news',
      active: true,
    },
    {
      name: 'KPRC / Click2Houston',
      type: 'rss' as const,
      url: 'https://www.click2houston.com/arcio/rss/category/news/',
      active: true,
    },
    {
      name: 'ABC13 Houston',
      type: 'rss' as const,
      url: 'https://abc13.com/feed/',
      active: true,
    },
    {
      name: 'Houston Public Media',
      type: 'rss' as const,
      url: 'https://www.houstonpublicmedia.org/feed/',
      active: true,
    },
    {
      name: 'Harris County',
      type: 'rss' as const,
      url: 'https://www.harriscountytx.gov/rss',
      active: true,
    },
  ];

  for (const source of rssSources) {
    await prisma.source.upsert({
      where: { url: source.url },
      update: {},
      create: source,
    });
  }
  console.log(`Seeded ${rssSources.length} RSS sources`);

  // --- NewsAPI Source ---
  const newsApiSource = {
    name: 'NewsAPI - Houston',
    type: 'newsapi' as const,
    url: 'https://newsapi.org/v2/everything?q=Houston+Texas&sortBy=publishedAt',
    active: true,
  };

  await prisma.source.upsert({
    where: { url: newsApiSource.url },
    update: {},
    create: newsApiSource,
  });
  console.log('Seeded NewsAPI source');

  // --- Facebook Page Sources ---
  const facebookSources = [
    {
      name: 'City of Houston',
      type: 'facebook' as const,
      url: 'https://www.facebook.com/cityofhouston',
      config: { pageId: 'cityofhouston' },
      active: true,
    },
    {
      name: 'Houston Police Department',
      type: 'facebook' as const,
      url: 'https://www.facebook.com/houstonpolice',
      config: { pageId: 'houstonpolice' },
      active: true,
    },
    {
      name: 'Houston Fire Department',
      type: 'facebook' as const,
      url: 'https://www.facebook.com/HoustonFireDept',
      config: { pageId: 'HoustonFireDept' },
      active: true,
    },
  ];

  for (const source of facebookSources) {
    await prisma.source.upsert({
      where: { url: source.url },
      update: {},
      create: {
        name: source.name,
        type: source.type,
        url: source.url,
        active: source.active,
        config: source.config,
      },
    });
  }
  console.log(`Seeded ${facebookSources.length} Facebook sources`);

  // --- Default Public RSS Feed ---
  await prisma.feed.upsert({
    where: { slug: 'houston-breaking' },
    update: {},
    create: {
      title: 'Houston Breaking News',
      slug: 'houston-breaking',
      description: 'Real-time breaking news from the Houston metro area',
      public: true,
      filters: {
        minSeverity: 3,
        region: 'houston-metro',
      },
    },
  });
  console.log('Seeded default RSS feed definition');

  // --- Default Development API Key ---
  const devKey = crypto.randomBytes(32).toString('hex');
  await prisma.apiKey.upsert({
    where: { key: 'dev-key-do-not-use-in-production' },
    update: {},
    create: {
      key: 'dev-key-do-not-use-in-production',
      name: 'Development Key',
      active: true,
    },
  });
  console.log('Seeded development API key: dev-key-do-not-use-in-production');

  console.log('Seeding complete.');
}

main()
  .catch((e) => {
    console.error('Seed failed:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
