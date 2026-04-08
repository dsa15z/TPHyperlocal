/**
 * RAG Knowledge: End-User Help Guide
 * Comprehensive help documentation the chatbot uses to answer user questions.
 */

export function generateUserHelpKnowledge(): string {
  return `
# TopicPulse — End-User Help Guide

## What is TopicPulse?
TopicPulse is a broadcast newsroom intelligence platform that monitors 700+ news sources across 50 US metro markets, clusters related reports into stories (called "leads"), scores them for breaking/trending potential, and helps newsroom editors decide what to cover. It serves TV stations, radio stations, and digital newsrooms.

## Getting Started

### First Login
1. Go to the TopicPulse URL provided by your administrator
2. Click "Sign In" (top right) and enter your email/password
3. You'll see the Leads dashboard with the latest stories from your markets
4. If you're not logged in, you see a "teaser" view with the 10 most recent stories

### Navigation
The left sidebar has these sections:
- **Leads**: Main dashboard — all detected stories with scores, trends, and filters
- **Newsroom**: Assignments, Reporters, Deadlines, Shift Briefings
- **Production**: Show Production, Audio Studio, Video Studio
- **Publish**: Publishing queue and multi-platform distribution
- **Intelligence**: Analytics, Market Movers, Bookmarks
- **Admin** (Sources & Data, AI & Content, System): Configuration for administrators

## The Leads Dashboard

### Table Columns
- **#**: Row number
- **⭐** (Star): Yellow star = story mentions a famous person. Hover to see names.
- **Sources** (✓/⚠ + number): Source count with verification status.
  - Blue ✓ + number = VERIFIED (3+ sources, high confidence)
  - Orange ⚠ + 1 = SINGLE SOURCE (only 1 source, not corroborated)
  - Gray number = unverified but multiple sources
  - Hover to see the list of reporting sources
- **☑** (Covered): Green checkbox = your newsroom has covered this. Empty square = not yet covered.
- **Status**: BREAKING (red), TOP STORY (purple), DEVELOPING (blue), ONGOING (gray), etc.
- **Title**: Story headline. Click to open the detail page.
- **Category**: CRIME, WEATHER, TRAFFIC, POLITICS, BUSINESS, SPORTS, etc.
- **Location**: City, neighborhood, or "National"
- **Score**: Composite score 0-100, color-coded: Red (60+)=hot, Orange (40-60)=significant, Yellow (20-40)=moderate, Gray (<20)=low. Hover for full breakdown.
- **Trend**: Sparkline chart showing recent score trajectory. Green=rising, Red=declining.

### Column Customization
- Click **Columns** button (top right) to show/hide columns
- Drag column headers to reorder them in the table
- Drag the edge of any column header to resize
- Click **Save** on your view to persist column changes
- Additional columns available: Breaking, Trending, Confidence, Locality (hidden by default)

### Saved Views
- **Default**: Shows all leads, 24-hour window
- Click the view dropdown to switch between saved views
- Click **Save** to save current filters and columns to the active view
- Create new views, duplicate, rename, or delete via the dropdown menu
- Views persist across sessions — your setup survives page refresh

### Filtering
**Primary filters** (always visible):
- **Search bar**: Type keywords or natural language queries like "breaking crime in Houston last hour" (AI-parsed)
- **Statuses**: Filter by BREAKING, DEVELOPING, TOP_STORY, etc.
- **Categories**: Filter by CRIME, WEATHER, POLITICS, etc.
- **Time range**: 1h, 6h, 24h, 7d, 30d

**Advanced filters** (click "More"):
- **Sources**: Filter by specific news sources
- **Markets**: Filter by geographic market (Houston, Dallas, etc.)
- **Trends**: Rising or declining stories only
- **Min Score**: Slider to filter by minimum composite score
- **Gaps Only**: Show only stories your competitors covered but you haven't

Click **Clear** to reset all filters. Click **Save** to persist filters with your view.

### Sorting
Click any column header to sort. Click again to reverse. Arrow icons show sort direction.
You can sort by: Status, Title, Category, Location, Score, Sources, Trend, First Seen, Updated.
Icon columns (Famous, Sources/Verified, Covered) are also sortable.

## Story Detail Page
Click any lead title to open its detail page.

### What You See
- **Title & Summary**: AI-generated summary from multiple sources (auto-generated on first view for multi-source stories). Shows model name and generation time.
- **Score Cards**: Breaking, Trending, Confidence, Locality scores with hover tooltips explaining the exact calculation.
- **Verification Badge**: Blue ✓ VERIFIED, Orange ⚠ SINGLE SOURCE
- **Famous Person Badge**: Yellow ⭐ with person names
- **Source Articles**: List of all source posts with links to originals
- **Related Stories**: Stories sharing 2+ entities (people, organizations, locations)
- **Workflow Panel**: Accept as Lead → manage through editorial stages
- **AI Tools**: Regenerate summary, generate first draft, research, fact-check

### Editorial Workflow
1. Click "Accept as Lead" to create your private editorial copy
2. Use the Workflow tab to move between stages: Lead → Assigned → In Progress → Draft Ready → Editor Review → Approved → Published
3. Add editorial comments at each stage transition
4. Assign to reporters, set deadlines

### Audio Production
In the Audio tab of the Workflow Panel:
1. Enter a script (or use AI-generated text)
2. Select a voice: alloy (neutral), echo (male), fable (storyteller), onyx (deep male), nova (female), shimmer (warm female)
3. Click "Generate Audio" — OpenAI TTS produces an MP3
4. Play inline or download

### Publishing
In the Publish tab:
1. Select platform: Twitter, Facebook, LinkedIn, YouTube, TikTok, WordPress, Custom Webhook, RSS
2. Click Publish — content is sent to the selected platform
3. Track publish status: PENDING, PUBLISHED, FAILED, SCHEDULED
4. For scheduled publishing, set a future date/time

### One-Click Broadcast Package
POST /broadcast-package/generate with a story ID generates ALL formats in parallel:
- TV anchor read (30s and 60s)
- Radio news brief (30s and 60s)
- Web article (200 words, SEO-friendly)
- Social media post (280 chars with hashtags)
- Social media thread (4 tweets)
- Push notification (title + body)

### CSV Export
You can export selected stories to CSV for use in spreadsheets or other tools.
1. On the Leads dashboard, select stories using the checkboxes on each row
2. A selection bar appears showing the count of selected stories
3. Click **Export CSV** in the selection bar
4. The export uses your current view's visible columns — if you hide a column, it won't appear in the CSV
5. The file downloads as \`topicpulse-leads-YYYY-MM-DD.csv\` with proper escaping for Excel compatibility (BOM prefix, quoted fields with commas/newlines)

### View Persistence (Server-Synced)
Saved views are stored on the server, not just in your browser.
- When you save a view, it syncs to the backend via the \`/api/v1/user/views\` API
- Views survive across sessions, devices, and browsers — log in anywhere and your views are there
- localStorage is used as a fast cache, but the server is the source of truth
- Create, rename, duplicate, and delete views from the view dropdown menu
- Each view stores: name, visible columns (with order and widths), and all filter settings

## Breaking News Ticker
The orange/red bar at the bottom of every page shows BREAKING stories.
- Orange = BREAKING status stories
- Red = ALERT status stories (emergencies)
- Stories scroll left-to-right like a news ticker
- Hover to pause scrolling
- Click any story title to open its detail page
- Auto-refreshes every 15 seconds
- Only appears when there are BREAKING/ALERT stories

### Ticker Settings
Click the **gear icon** (⚙) on the ticker bar to open settings:
- **Speed slider (1-10)**: Controls scroll speed. 1 = slow (120 px/sec), 7 = default (440 px/sec), 10 = fastest (1000 px/sec). Old 1-5 scale settings are auto-migrated.
- **View-based filter**: By default the ticker shows ALERT + BREAKING stories. You can select any of your saved views to use its filters instead — for example, a view filtered to "Crime + Breaking" will only show breaking crime stories in the ticker.
- Settings are saved to the server (persists across devices) with localStorage as fallback.

## AI Chatbot
Click the blue chat icon (bottom-right) or press Cmd+K to open.

### What It Can Do
- Search stories: "what's breaking in Houston?"
- Explain scores: "why is this story trending?"
- Manage sources: "add this RSS feed", "show inactive sources"
- Pipeline operations: "pull new stories", "clear failed jobs"
- Generate content: "write a TV script for this story"
- Navigate: "go to markets page"
- Answer questions: "how many sources do we have?"

### Example Prompts
- "Show me breaking crime stories from the last hour"
- "Why isn't the Tiger Woods story marked as breaking?"
- "Assign this story to John and move it to in-progress"
- "What markets do we cover?"
- "Generate a radio script for this story"
- "Is the pipeline healthy?"

## Admin Features

### Sources & Data → Data Feeds
- View all 700+ news sources with health status, trust scores, story counts
- Click any source to edit: name, URL, platform, trust score, market assignments
- **Test Feed**: Validates the RSS URL and shows item count
- **Self-Heal**: Attempts automatic recovery for failing sources (tries browser UA, alternate URLs, proxy-to-direct mapping)
- **Failure & Healing Log**: Shows timestamped history of failures and self-heal attempts
- Bulk actions: activate, deactivate, delete, assign markets

### Sources & Data → Markets
- 50 US metro markets + National
- Click any market to edit: name, state, coordinates, radius, timezone, keywords, neighborhoods
- Sources tab shows TV stations, radio stations, and other sources linked to that market
- Auto-fill: AI generates keywords, neighborhoods, and coordinates from market name

### AI & Content → Knowledge Base
- Documents injected into all AI prompts (chatbot, NLP search, content generation)
- Click "Auto-Generate Schema Docs" to regenerate from code
- Add custom knowledge documents (editorial guidelines, market context, etc.)

### System → Team & Roles
- Manage users and role assignments
- Roles: VIEWER (read-only), EDITOR (assign/edit), ADMIN (configure), OWNER (full access)
- Role determines which workflow stages a user can access

## Scoring Explained (Detailed)

### How Composite Score Works
The score (0-100) shown on the dashboard blends 5 sub-scores:
- Breaking (25%): How fast are new sources picking this up?
- Trending (20%): Is the story accelerating or decaying?
- Confidence (15%): How trustworthy are the sources?
- Locality (15%): How relevant is this to your local market?
- Social (25%): What's the social media engagement?

Plus bonus scoring:
- Stories spreading across 2+ markets get a propagation boost (+5-15%)
- Stories matching your newsroom's most-covered categories get an audience affinity boost (+10%)
- New stories (< 60 min) with accelerating source velocity get a pre-break boost (+15%)

### What the Icons Mean
- ⭐ Yellow star = Famous person mentioned (hover for names)
- ✓ Blue checkmark = VERIFIED by 3+ independent sources
- ⚠ Orange warning = Only 1 source (SINGLE SOURCE)
- ☑ Green checkbox = Your newsroom has covered this story
- □ Empty square = Not yet covered

## Troubleshooting

### No stories showing
1. Click Clear to reset all filters
2. Expand time range to 24h or 7d
3. Check pipeline status (expand the "News Pipeline" panel at top)
4. If many failed jobs, expand the pipeline panel and click "Clear Failed"
5. Ask the chatbot: "is the pipeline healthy?"

### Source showing as INACTIVE
1. Click the source to open edit modal
2. Click "Self-Heal" to attempt automatic recovery
3. Review the Failure & Healing Log for details
4. If the URL is a proxy (rsshub.app), the self-healer will try the direct source URL
5. Toggle the Active switch to reactivate manually

### Filters seem stuck
1. Click Clear to reset all filters
2. If still showing old data, save the view (click Save) to persist the clean state
3. Refresh the page — filters load from the saved view, not from stale localStorage

### Stories not scoring properly
1. Check if the scoring queue has failed jobs (pipeline panel)
2. Stories need to be scored to get verification badges and proper status
3. Admin can force re-score: pipeline panel → Scoring → Run Now
`.trim();
}
