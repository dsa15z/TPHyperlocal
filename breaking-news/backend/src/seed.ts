import { PrismaClient, Platform, SourceType } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  console.log('Seeding database...');

  // --- Clean existing sources to avoid duplicates (url is not unique) ---
  await prisma.source.deleteMany({});
  console.log('Cleared existing sources');

  // --- RSS Sources (News Organizations) ---
  const rssSources = [
    {
      platform: Platform.RSS,
      sourceType: SourceType.NEWS_ORG,
      name: 'Houston Chronicle',
      url: 'https://www.houstonchronicle.com/rss/feed/Houston-breaking-news-702.php',
      trustScore: 0.8,
      isActive: true,
      isGlobal: true,
      isGlobal: true,
      metadata: { feedUrl: 'https://www.houstonchronicle.com/rss/feed/Houston-breaking-news-702.php' },
    },
    {
      platform: Platform.RSS,
      sourceType: SourceType.NEWS_ORG,
      name: 'KHOU 11',
      url: 'https://www.khou.com/feeds/syndication/rss/news',
      trustScore: 0.8,
      isActive: true,
      isGlobal: true,
      metadata: { feedUrl: 'https://www.khou.com/feeds/syndication/rss/news' },
    },
    {
      platform: Platform.RSS,
      sourceType: SourceType.NEWS_ORG,
      name: 'KPRC / Click2Houston',
      url: 'https://www.click2houston.com/arcio/rss/category/news/',
      trustScore: 0.8,
      isActive: true,
      isGlobal: true,
      metadata: { feedUrl: 'https://www.click2houston.com/arcio/rss/category/news/' },
    },
    {
      platform: Platform.RSS,
      sourceType: SourceType.NEWS_ORG,
      name: 'ABC13 Houston',
      url: 'https://abc13.com/feed/',
      trustScore: 0.8,
      isActive: true,
      isGlobal: true,
      metadata: { feedUrl: 'https://abc13.com/feed/' },
    },
    {
      platform: Platform.RSS,
      sourceType: SourceType.NEWS_ORG,
      name: 'Houston Public Media',
      url: 'https://www.houstonpublicmedia.org/feed/',
      trustScore: 0.8,
      isActive: true,
      isGlobal: true,
      metadata: { feedUrl: 'https://www.houstonpublicmedia.org/feed/' },
    },
  ];

  // --- RSS Source (Government Agency) ---
  const govSources = [
    {
      platform: Platform.RSS,
      sourceType: SourceType.GOV_AGENCY,
      name: 'Harris County',
      url: 'https://www.harriscountytx.gov/rss',
      trustScore: 0.9,
      isActive: true,
      isGlobal: true,
      metadata: { feedUrl: 'https://www.harriscountytx.gov/rss' },
    },
  ];

  // --- NewsAPI Source ---
  const newsApiSources = [
    {
      platform: Platform.NEWSAPI,
      sourceType: SourceType.API_PROVIDER,
      name: 'NewsAPI - Houston',
      url: 'https://newsapi.org/v2/everything?q=Houston+Texas&sortBy=publishedAt',
      trustScore: 0.8,
      isActive: true,
      isGlobal: true,
      metadata: { query: 'Houston Texas', sortBy: 'publishedAt' },
    },
  ];

  // --- GDELT Source ---
  const gdeltSources = [
    {
      platform: Platform.NEWSAPI,
      sourceType: SourceType.API_PROVIDER,
      name: 'GDELT - Houston',
      url: 'https://api.gdeltproject.org/api/v2/doc/doc?query=Houston+Texas&mode=artlist&format=json',
      trustScore: 0.7,
      isActive: true,
      isGlobal: true,
      metadata: { query: 'Houston Texas', mode: 'artlist', format: 'json' },
    },
  ];

  // --- Facebook Page Sources ---
  const facebookSources = [
    {
      platform: Platform.FACEBOOK,
      sourceType: SourceType.GOV_AGENCY,
      name: 'City of Houston',
      url: 'https://www.facebook.com/cityofhouston',
      platformId: 'cityofhouston',
      trustScore: 0.6,
      isActive: true,
      isGlobal: true,
      metadata: { pageId: 'cityofhouston' },
    },
    {
      platform: Platform.FACEBOOK,
      sourceType: SourceType.GOV_AGENCY,
      name: 'Houston Police Department',
      url: 'https://www.facebook.com/houstonpolice',
      platformId: 'houstonpolice',
      trustScore: 0.6,
      isActive: true,
      isGlobal: true,
      metadata: { pageId: 'houstonpolice' },
    },
    {
      platform: Platform.FACEBOOK,
      sourceType: SourceType.GOV_AGENCY,
      name: 'Houston Fire Department',
      url: 'https://www.facebook.com/HoustonFireDept',
      platformId: 'HoustonFireDept',
      trustScore: 0.6,
      isActive: true,
      isGlobal: true,
      metadata: { pageId: 'HoustonFireDept' },
    },
  ];

  const allSources = [
    ...rssSources,
    ...govSources,
    ...newsApiSources,
    ...gdeltSources,
    ...facebookSources,
  ];

  for (const source of allSources) {
    await prisma.source.create({ data: source });
  }
  console.log(`Seeded ${allSources.length} sources`);

  // --- Default Public RSS Feed ---
  await prisma.rSSFeed.upsert({
    where: { slug: 'houston-breaking' },
    update: {},
    create: {
      name: 'Houston Breaking News',
      slug: 'houston-breaking',
      isPublic: true,
      filters: {
        minSeverity: 3,
        region: 'houston-metro',
      },
    },
  });
  console.log('Seeded default RSS feed definition');

  // --- Default Development API Key ---
  await prisma.aPIKey.upsert({
    where: { key: 'dev-key-do-not-use-in-production' },
    update: {},
    create: {
      key: 'dev-key-do-not-use-in-production',
      name: 'Development Key',
      ownerId: 'system',
      isActive: true,
      isGlobal: true,
      rateLimit: 1000,
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
