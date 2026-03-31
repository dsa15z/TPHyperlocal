// @ts-nocheck
/**
 * Websites to scrape for news when no RSS feed is available.
 * Each entry specifies the news listing page URL and optional CSS selector.
 * The web-scraper worker will extract article links and titles from these pages.
 */

export interface ScrapeSeed {
  name: string;
  url: string;
  sourceType: string;
  trustScore: number;
  category?: string;
  /** Optional CSS selector for article links. If not provided, heuristic extraction is used. */
  selector?: string;
}

export const SCRAPE_SOURCES: ScrapeSeed[] = [
  // ─── Houston Local News (no RSS) ─────────────────────────────────────────
  {
    name: 'Houston Press',
    url: 'https://www.houstonpress.com/news',
    sourceType: 'LOCAL_NEWS',
    trustScore: 0.75,
  },
  {
    name: 'KTRH NewsRadio 740',
    url: 'https://ktrh.iheart.com/content/',
    sourceType: 'LOCAL_NEWS',
    trustScore: 0.80,
  },
  {
    name: 'CBS News Houston',
    url: 'https://www.cbsnews.com/texas/',
    sourceType: 'LOCAL_NEWS',
    trustScore: 0.85,
  },
  {
    name: 'Texas Monthly - Houston',
    url: 'https://www.texasmonthly.com/news-politics/',
    sourceType: 'LOCAL_NEWS',
    trustScore: 0.82,
  },
  {
    name: 'La Voz de Houston',
    url: 'https://www.lavozdehouston.com/',
    sourceType: 'LOCAL_NEWS',
    trustScore: 0.78,
    category: 'COMMUNITY',
  },

  // ─── Government & Public Safety ──────────────────────────────────────────
  {
    name: 'TxDOT Newsroom',
    url: 'https://www.txdot.gov/about/newsroom/statewide.html',
    sourceType: 'GOVERNMENT',
    trustScore: 0.90,
    category: 'TRAFFIC',
  },
  {
    name: 'Harris County News',
    url: 'https://oca.harriscountytx.gov/Media',
    sourceType: 'GOVERNMENT',
    trustScore: 0.90,
  },
  {
    name: 'Harris County Public Health',
    url: 'https://publichealth.harriscountytx.gov/Resources/News-Releases',
    sourceType: 'GOVERNMENT',
    trustScore: 0.88,
    category: 'HEALTH',
  },

  // ─── Business & Real Estate ──────────────────────────────────────────────
  {
    name: 'HAR Newsroom',
    url: 'https://www.har.com/content/newsroom/?pid=640',
    sourceType: 'BUSINESS',
    trustScore: 0.80,
    category: 'BUSINESS',
  },

  // ─── Community / Hyperlocal ──────────────────────────────────────────────
  {
    name: 'My Neighborhood News',
    url: 'https://myneighborhoodnews.com/',
    sourceType: 'LOCAL_NEWS',
    trustScore: 0.68,
    category: 'COMMUNITY',
  },
];
