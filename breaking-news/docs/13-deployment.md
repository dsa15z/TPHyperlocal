# Section 13 — Deployment Plan

## Service Map

| Service | Platform | Plan | Project ID |
|---|---|---|---|
| Next.js Frontend | Vercel | Free → Pro ($20/mo) | prj_ZA8AlXP3Gh5RPyyFeGw4NgLMOh1i |
| Fastify API | Railway | Starter ($5/mo) → Pro | d361f9bc-3960-42f0-8936-981891df4193 |
| Worker Service | Railway | Starter → Pro | Same project |
| LLM Worker | Railway | Starter → Pro | Same project |
| MCP Server | Railway | Starter | Same project |
| PostgreSQL | Railway | Managed ($5/mo base) | Same project |
| Redis | Railway | Managed ($5/mo base) | Same project |

## Environments

| Environment | Frontend | Backend | DB |
|---|---|---|---|
| Development | localhost:3000 | localhost:3001 | Docker Compose (local PG + Redis) |
| Staging | Vercel preview (PR branches) | Railway dev environment | Separate staging DB |
| Production | Vercel production | Railway production | Production DB with backups |

## CI/CD

- **GitHub Actions**: lint + typecheck + build on every PR (matrix: frontend, backend, worker, mcp-server)
- **Vercel**: auto-deploy frontend on push to main, preview deploys on PRs
- **Railway**: auto-deploy backend/worker/mcp on push to main
- **Database**: `prisma migrate deploy` runs in Railway deploy command

## Secrets (Environment Variables)

### Railway (Backend + Worker + MCP)
```
DATABASE_URL          # Railway-managed PostgreSQL connection string
REDIS_URL             # Railway-managed Redis connection string
JWT_SECRET            # Minimum 32 chars
API_SECRET_KEY        # Internal service auth
NODE_ENV=production
PORT=3001
LOG_LEVEL=info
```

### Vercel (Frontend)
```
NEXT_PUBLIC_API_URL   # Points to Railway backend URL
```

### Per-Account (stored in DB, not env vars)
```
NEWSAPI_KEY, FACEBOOK_ACCESS_TOKEN, OPENAI_API_KEY,
ANTHROPIC_API_KEY, XAI_API_KEY, GOOGLE_AI_KEY
```

## Cost Estimates

| Stage | Monthly Cost | What's Included |
|---|---|---|
| **Prototype** | $30–50 | Railway Starter (API + worker + DB + Redis) + Vercel free |
| **Early Production** | $150–300 | Railway Pro + NewsAPI ($449) + Twitter ($100) + LLM costs (~$50) |
| **Houston Market** | $400–800 | Larger DB, more workers, higher API tiers, all LLM providers |
| **Multi-Metro (3 cities)** | $1,000–2,000 | Per-metro workers, larger DB, CDN, monitoring |
| **Enterprise (10+ tenants)** | $2,000–5,000 | Dedicated resources, HA, support contracts |

LLM costs scale with poll frequency × markets × providers:
- 4 LLMs × 6 polls/hr × 24h × $0.01/call = ~$5.76/day/market
- With 3 markets: ~$520/mo for LLM polling alone
