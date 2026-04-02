/**
 * RAG Knowledge: End-User Help Guide
 * Comprehensive help documentation the chatbot uses to answer user questions.
 */

export function generateUserHelpKnowledge(): string {
  return `
# TopicPulse — End-User Help Guide

## What is TopicPulse?
TopicPulse is a broadcast newsroom intelligence platform that monitors 700+ news sources across 50 US metro markets, clusters related reports into stories, scores them for breaking/trending potential, and helps newsroom editors decide what to cover. It replaces manual monitoring of dozens of feeds and social media accounts with a single, prioritized dashboard.

## Getting Started

### Logging In
1. Go to the TopicPulse URL provided by your administrator
2. Enter your email and password
3. You'll see the Stories dashboard with your market's stories
4. Your role (Viewer, Editor, Admin, Owner) determines what actions you can take

### Understanding the Dashboard
The main Stories page shows:
- **News Pipeline** (top) — real-time progress of story ingestion and processing
- **View Selector** — save and switch between different filter configurations
- **Filter Bar** — search, filter by category/status/source/market/time/trend
- **Story Table** — sortable, customizable columns showing all matching stories
- **Story Cards** — alternative card layout (toggle with the grid icon)

## Stories

### Finding Stories
**Text search**: Type keywords in the search bar for exact text matching
**NLP search**: Type a natural language query like "breaking crime in Houston last hour" — the AI parses it into structured filters automatically (indicated by the blue "AI" badge)
**Filters**: Use the dropdown menus to filter by category, status, source, market, time range, or trend direction
**Min Score slider**: Set a minimum composite score to see only high-scoring stories

### Understanding Story Status
| Status | Meaning | Visual |
|--------|---------|--------|
| ALERT | Critical emergency requiring immediate attention | Red |
| BREAKING | High-velocity story, multiple sources confirming | Orange |
| DEVELOPING | New story, still gathering sources | Blue |
| TOP_STORY | Popular story with strong audience interest | Purple |
| ONGOING | Established story, no longer growing rapidly | Gray |
| FOLLOW_UP | Related to a previous breaking story | Teal |
| STALE | No new activity for 48+ hours | Dim |
| ARCHIVED | Older than 72 hours, no longer active | Hidden by default |

### Understanding Scores
Each story gets five scores from 0 to 100:
- **Breaking Score** — How fast is this story developing? Based on how many sources are reporting it and how quickly.
- **Trending Score** — Is this story gaining momentum? Compares current activity to past activity.
- **Confidence Score** — How trustworthy is this story? Based on source diversity and trust ratings.
- **Locality Score** — How relevant is this to your local market? Exact location matches score highest.
- **Social Score** — How much social engagement does this story have? Likes, shares, comments.
- **Composite Score** — The overall weighted blend of all five scores.

### Story Details
Click any story row to open the detail page:
- **Summary** — AI-generated and human-edited summaries
- **Source Posts** — All individual source reports that make up this story
- **Score Breakdown** — Visual breakdown of each score component
- **Your Workspace** — Account-private area for editing, assigning, and generating content

### Working with Stories (Editors & Admins)
When you take any action on a story, a private copy (derivative) is created for your account:
- **Edit** title or summary — your edits are private to your account
- **Assign** to a reporter — set assignedTo and change status to ASSIGNED
- **Add notes** — private editorial notes
- **Generate AI content** — TV scripts, web articles, social posts, radio scripts
- **Track coverage** — mark as covered, link to your published piece

## Views & Saved Filters

### Saving a View
1. Set up your preferred filters (market, categories, time range, etc.)
2. Click the "Save" button next to the view name
3. Give it a descriptive name like "Houston Crime Watch" or "National Breaking"
4. The view saves all filter settings including NLP prompts

### Switching Views
- Click the view dropdown to see all saved views
- Select a view to instantly apply its saved filters
- The dot indicator shows if current filters differ from the saved view

### Managing Views
- **Duplicate** a view to create variations
- **Rename** views to keep them organized
- **Delete** views you no longer need
- The "Default" view always exists as a fallback

## Column Customization

### Changing Columns
1. Click the "Columns (N)" button in the toolbar
2. Toggle columns on/off with checkboxes
3. Drag columns to reorder them
4. Changes are saved per-view

### Available Columns
Title, Status, Category, Composite Score, Breaking Score, Trending Score, Confidence Score, Locality Score, Social Score, Sources, Location, First Seen, Last Updated, Trend

### Resizing Columns
Drag the right edge of any column header to resize it. Changes save to your current view.

## Email Alerts & Subscriptions

### Setting Up Email Alerts
1. Go to your profile (click avatar top-right) → Email Alerts tab
2. Click "Subscribe"
3. Select a saved view — alerts will use that view's filters
4. Enter your email address
5. Choose frequency: hourly, daily, or weekly
6. Set max stories per email
7. You'll receive emails with stories matching your saved view

## Data Sources

### Source Types
- **RSS Feeds** — Standard news website feeds, polled every 5 minutes
- **Event Registry** — Global news API with 200K+ sources
- **Newscatcher** — News search API with category classification
- **HyperLocal Intel** — Geo-scored local news aggregation
- **X/Twitter** — Social media monitoring via API
- **LLM Sources** — AI models (OpenAI, Grok, Gemini) scanning for breaking news
- **Web Scrapers** — Direct website monitoring for sites without RSS
- **GDELT** — Global event validation database

### Managing Sources (Admins)
Go to Sources & Data → Data Feeds:
- **Add Source** — Click "+ Add Source", choose type, enter URL, assign to markets
- **Test Feed** — Click the play button to test-poll a source immediately
- **Bulk Actions** — Select multiple sources to activate, deactivate, or delete
- **Health Status** — Green = healthy, Yellow = slow, Red = failing

## Markets

### What is a Market?
A market represents a geographic area (usually a TV market/MSA). TopicPulse comes pre-configured with 50 US metro markets. Each market has:
- Geographic center (lat/long) and radius
- Keywords for location matching (county names, neighborhoods)
- Linked sources that are polled for that market
- TV and radio stations in the area

### The National Market
"National" is a special market for stories that aren't location-specific. National stories are only shown when you explicitly select the National market filter.

### Market Management (Admins)
Go to Sources & Data → Markets:
- **Sync All 50 Markets** — Import all pre-configured US MSA markets
- **Activate/Deactivate** — Only active markets get their sources polled
- **Edit** — Modify keywords, neighborhoods, radius for better matching

## AI Assistant (Chatbot)

### Opening the Assistant
- Click the blue bot icon in the bottom-right corner
- Or press Cmd+K (Mac) / Ctrl+K (Windows)

### What You Can Ask
- "What's breaking?" — Get current breaking stories
- "Show me Houston crime" — Search with filters
- "Tell me about this story" — Get details on the story you're viewing
- "Why is this trending?" — Explain a story's scores
- "Assign this to John" — Workflow action on current story
- "How many sources are active?" — System statistics
- "Clear failed jobs" — Pipeline maintenance
- "Generate a TV script for this story" — Content generation

### Tips
- The assistant knows what page you're on and what story you're viewing
- It can navigate you to any page: "go to sources", "open markets"
- It remembers your conversation context (last 10 messages)
- It uses the same scoring and filtering as the main dashboard

## News Pipeline

### Understanding the Pipeline
The pipeline panel (top of dashboard) shows real-time processing status:
- **Ingestion** — Fetching new content from sources
- **Enrichment** — Classifying category, extracting entities and location
- **Clustering** — Grouping related posts into stories
- **Scoring** — Calculating scores and updating story status

### Pipeline Controls
- **Pull Now** — Force immediate ingestion (1h, 6h, or 24h lookback)
- **Clear Pending** — Remove all waiting jobs from all queues
- **Clear Failed** — Remove all failed jobs from all queues
- **Per-queue controls** — Expand any queue to see jobs, clear failures, or force-run

### Why Might the Pipeline Stall?
- No users active for 6+ minutes (polling pauses to save costs)
- API rate limits hit on source providers
- Redis connection issues
- Source configuration errors (bad URLs, expired tokens)

## User Roles

| Role | Can View | Can Edit | Can Manage Sources | Can Manage Users | Can Tune Algorithm |
|------|----------|----------|--------------------|------------------|--------------------|
| VIEWER | Stories in their markets | No | No | No | No |
| EDITOR | Stories in their markets | Yes (assign, draft, notes) | No | No | No |
| ADMIN | All stories | Yes | Yes | Yes | No |
| OWNER | All stories | Yes | Yes | Yes | Yes |

## Account Settings

### Profile
Click your avatar (top-right) → My Profile:
- **Profile tab** — Update name, phone, timezone
- **Password tab** — Change your password
- **Access tab** — See your accounts, roles, and markets
- **Views tab** — Manage saved dashboard views
- **Email Alerts tab** — Manage email subscriptions

## Keyboard Shortcuts
- **Cmd/Ctrl + K** — Open AI Assistant
- **Escape** — Close modals and drawers

## Troubleshooting

### "I see 0 stories"
1. Click the "Clear" button to reset all filters
2. Expand the time range to 24h or 7d
3. Check that the pipeline is running (should show "jobs in progress")
4. If pipeline is idle, click "Pull Now" to trigger fresh ingestion
5. If there are many failed jobs, use "Clear Failed" and re-trigger

### "Stories aren't updating"
1. Check if anyone has been active in the last 6 minutes (polling pauses when idle)
2. Open the pipeline panel — are jobs processing?
3. Check for failed jobs in the pipeline — they may indicate source issues
4. Ask your admin to check source health in Data Feeds

### "Scores seem wrong"
1. Scores are relative and recalculated every 10 minutes
2. Breaking scores decay over time — this is by design
3. Local stories have lower thresholds than national stories
4. Social engagement boosts both breaking and trending scores
5. Ask the AI assistant "explain the score for this story" for a detailed breakdown

### "I can't see a story someone else mentioned"
1. You may not have access to that market — check your Access settings
2. The story may have been archived (older than 72 hours)
3. Try expanding your time range to 30 days
4. National stories only show when National market is selected

### "Email alerts aren't arriving"
1. Check your spam/junk folder
2. Verify your email in Profile → Email Alerts
3. Make sure the saved view has matching stories (test by loading the view)
4. Alerts only send when there are new stories matching the view's filters
`.trim();
}
