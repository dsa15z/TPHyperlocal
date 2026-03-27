# Section 10 — Frontend Product Design

## Stack

- **Next.js 14** (App Router) on Vercel
- **TanStack Table** for sortable/filterable data table
- **TanStack React Query** for data fetching with 30-second auto-refresh
- **Tailwind CSS** with dark theme
- **Lucide React** for icons
- **SWR** or React Query for admin pages

## Pages

### Main Dashboard (`/`)
- Header: "Breaking News Intelligence" + live pulse indicator + market selector
- Filter bar: keyword search (debounced 300ms), category dropdown, status dropdown, time range buttons (1h/6h/24h/7d), min score slider, clear button
- Ranked table with columns:
  - `#` (rank)
  - Status (colored badge: red=BREAKING, orange=TRENDING, blue=ACTIVE, gray=STALE)
  - Title (linked to detail page)
  - Category
  - Location
  - Breaking Score (colored bar)
  - Trending Score (colored bar)
  - Sources (count)
  - First Seen (relative time)
  - Updated (relative time)
- Sortable by clicking any column header
- Pagination at bottom
- Auto-refresh every 30 seconds

### Story Detail (`/stories/[id]`)
- Story title, summary, AI summary, status badge, category, location
- Score cards: breaking, trending, confidence, locality (each with colored bar)
- Composite score highlight with gradient bar
- Source Posts section: platform icon, author, content snippet, engagement metrics, time, link to original
- Timeline showing chronological source post arrival

### RSS Feed Manager (`/feeds`)
- List saved feeds with name, filters, RSS URL (copyable)
- Create feed form: name, category filter, status filter, min score, keywords
- Delete feed button

### Login / Register (`/login`, `/register`)
- Email + password form
- Account name on register
- Redirect to dashboard on success

### Admin: Account Settings (`/admin/account`)
- Account name, slug, plan
- User management: list users, invite by email, change roles, remove

### Admin: Markets (`/admin/markets`)
- List markets with source counts
- Create/edit market: name, state, lat/lon, radius, timezone, keywords, neighborhoods
- Enable/disable toggle

### Admin: Sources (`/admin/sources`)
- Table of all available sources grouped by type
- Enable/disable toggle per source
- Create new source for a market
- Filter by platform, sourceType, market

### Admin: Credentials (`/admin/credentials`)
- List credentials with masked keys
- Create/edit credential forms per platform
- Test button that validates the credential
- Status indicator (green=working, red=last error shown)

## Component Structure

```
src/
├── app/
│   ├── layout.tsx              # Root layout, dark theme, auth provider
│   ├── globals.css             # Tailwind + custom dark styles
│   ├── providers.tsx           # React Query + auth context
│   ├── page.tsx                # Main dashboard
│   ├── login/page.tsx          # Login form
│   ├── register/page.tsx       # Register form
│   ├── stories/[id]/page.tsx   # Story detail with timeline
│   ├── feeds/page.tsx          # RSS feed management
│   └── admin/
│       ├── account/page.tsx    # Account + user management
│       ├── markets/page.tsx    # Market CRUD
│       ├── sources/page.tsx    # Source management
│       └── credentials/page.tsx # Credential vault
├── components/
│   ├── StoryTable.tsx          # TanStack Table
│   ├── FilterBar.tsx           # Filter controls
│   ├── ScoreBadge.tsx          # Score visualization
│   ├── StatusBadge.tsx         # Status badges
│   ├── MarketSelector.tsx      # Multi-market dropdown
│   └── CredentialForm.tsx      # Platform-specific credential forms
└── lib/
    ├── api.ts                  # Typed API client
    ├── auth.ts                 # JWT token management
    └── utils.ts                # Formatting utilities
```
