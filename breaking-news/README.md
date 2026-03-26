# Houston Breaking News Intelligence Platform

Real-time breaking news aggregation, AI-powered classification, and multi-channel distribution for the Houston metro area. Ingests stories from RSS feeds, NewsAPI, and Facebook pages, scores them by severity and locality, and serves them via API, auto-generated RSS feeds, and an MCP server for AI assistants.

## Architecture

```
Vercel (Frontend)          Railway (Backend Services)
+-----------------+        +---------------------------+
| Next.js App     |------->| Express API  (port 3001)  |
| /api/* proxied  |        +---------------------------+
+-----------------+        | Worker (cron ingest jobs)  |
                           +---------------------------+
                           | MCP Server (AI tool iface) |
                           +---------------------------+
                           | PostgreSQL 16 | Redis 7    |
                           +---------------------------+
```

- **Frontend** -- Next.js dashboard deployed to Vercel. API calls are proxied to the Railway backend via rewrites.
- **Backend** -- Express REST API handling stories, feeds, sources, and RSS generation.
- **Worker** -- Scheduled jobs that poll RSS, NewsAPI, and Facebook for new stories, run AI classification, and update scores.
- **MCP Server** -- Model Context Protocol server exposing story data to AI assistants and agents.

## Quick Start

```bash
# 1. Copy environment variables
cp .env.example .env
# Fill in API keys (OPENAI_API_KEY, NEWSAPI_KEY, etc.)

# 2. Start infrastructure and services
docker-compose up -d

# 3. Run database migrations
cd backend && npx prisma migrate dev && cd ..

# 4. Seed the database with sample Houston sources
cd backend && npx ts-node src/seed.ts && cd ..

# 5. Start the frontend dev server
cd frontend && npm run dev
```

The frontend runs at `http://localhost:3000` and the API at `http://localhost:3001`.

## Services

| Service      | Directory    | Port | Description                                    |
|------------- |------------- |----- |------------------------------------------------|
| Frontend     | `frontend/`  | 3000 | Next.js dashboard and public feed pages        |
| Backend API  | `backend/`   | 3001 | REST API for stories, sources, feeds           |
| Worker       | `worker/`    | --   | Cron-based ingest, classification, scoring     |
| MCP Server   | `mcp-server/`| --   | AI assistant tool interface                    |
| PostgreSQL   | (docker)     | 5432 | Primary data store                             |
| Redis        | (docker)     | 6379 | Job queues, caching, pub/sub                   |

## Environment Variables

See `.env.example` for the full list. Key variables:

| Variable               | Required | Description                          |
|----------------------- |--------- |--------------------------------------|
| `DATABASE_URL`         | Yes      | PostgreSQL connection string         |
| `REDIS_URL`            | Yes      | Redis connection string              |
| `OPENAI_API_KEY`       | Yes      | OpenAI API key for AI classification |
| `NEWSAPI_KEY`          | Yes      | NewsAPI key for news ingestion       |
| `FACEBOOK_APP_ID`      | No       | Facebook Graph API app ID            |
| `FACEBOOK_APP_SECRET`  | No       | Facebook Graph API app secret        |
| `FACEBOOK_ACCESS_TOKEN`| No       | Facebook page access token           |
| `API_SECRET_KEY`       | Yes      | Secret for internal service auth     |
| `NEXT_PUBLIC_API_URL`  | Yes      | Backend URL the frontend calls       |

## API Endpoints

| Method | Path                        | Description                        |
|------- |---------------------------- |------------------------------------|
| GET    | `/api/stories`              | List stories (filtered, paginated) |
| GET    | `/api/stories/:id`          | Get single story by ID             |
| GET    | `/api/sources`              | List configured sources            |
| POST   | `/api/sources`              | Add a new source                   |
| GET    | `/api/feeds`                | List RSS feed definitions          |
| GET    | `/api/feeds/:slug/rss`      | Serve generated RSS XML            |
| GET    | `/api/health`               | Health check                       |

## Deployment

### Vercel (Frontend)

1. Connect the `breaking-news/frontend` directory to a Vercel project.
2. Set `NEXT_PUBLIC_API_URL` and `BACKEND_URL` environment variables to the Railway backend URL.
3. Vercel rewrites in `vercel.json` proxy `/api/*` requests to the backend.

### Railway (Backend Services)

1. Create separate Railway services for `backend`, `worker`, and `mcp-server`.
2. Provision a PostgreSQL 16 and Redis instance on Railway.
3. Set the environment variables listed above on each service.
4. Run `npx prisma migrate deploy` on the backend service after first deploy.
