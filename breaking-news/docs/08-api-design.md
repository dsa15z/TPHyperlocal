# Section 8 — API Design

## Base URL
```
https://api.{domain}/api/v1
```

## Authentication

Two auth methods supported simultaneously:

| Method | Header | Use Case |
|---|---|---|
| API Key | `x-api-key: {key}` | Third-party API consumers |
| JWT Bearer | `Authorization: Bearer {token}` | Frontend users, admin UI |

Public endpoints (no auth): `/api/v1/health`, `/docs`, `/api/v1/feeds/:slug/rss`, `/api/v1/auth/*`

## Rate Limiting

- Default: 100 requests/minute per API key
- Configurable per key via `APIKey.rateLimit`
- Returns `429 Too Many Requests` with `Retry-After` header
- Frontend JWT users: 200 req/min

## Auth Endpoints

```
POST /api/v1/auth/register
  Body: { email, password, displayName?, accountName }
  Response: { token, user, account }

POST /api/v1/auth/login
  Body: { email, password }
  Response: { token, user, accounts[] }

POST /api/v1/auth/refresh
  Headers: Authorization: Bearer {token}
  Response: { token }

GET /api/v1/auth/me
  Response: { user, accounts[{ id, name, role }] }

POST /api/v1/auth/switch-account
  Body: { accountId }
  Response: { token }
```

## Story Endpoints

### List Stories
```
GET /api/v1/stories?status=BREAKING&category=CRIME&minScore=0.5&limit=20&offset=0&sort=compositeScore&order=desc
```

Response:
```json
{
  "data": [{
    "id": "clx1abc...",
    "title": "Major fire reported at Galleria-area apartment complex",
    "category": "EMERGENCY",
    "status": "BREAKING",
    "locationName": "Galleria, Houston",
    "neighborhood": "Galleria",
    "breakingScore": 0.89,
    "trendingScore": 0.45,
    "confidenceScore": 0.76,
    "localityScore": 0.95,
    "compositeScore": 0.78,
    "sourceCount": 4,
    "firstSeenAt": "2026-03-26T14:23:00Z",
    "lastUpdatedAt": "2026-03-26T14:41:00Z"
  }],
  "pagination": { "total": 142, "limit": 20, "offset": 0, "hasMore": true }
}
```

### Get Story Detail
```
GET /api/v1/stories/:id
```
Returns story + all source posts with engagement metrics, similarity scores, and score snapshots.

### Breaking Stories
```
GET /api/v1/stories/breaking?limit=10
```

### Trending Stories
```
GET /api/v1/stories/trending?limit=10
```

### Search
```
GET /api/v1/search?q=fire+galleria&category=EMERGENCY&from=2026-03-25&to=2026-03-26&limit=20
```

## RSS Feed Endpoints

```
GET  /api/v1/feeds              — list saved feed definitions
POST /api/v1/feeds              — create feed { name, filters }
GET  /api/v1/feeds/:slug/rss    — get RSS XML (public, no auth)
DELETE /api/v1/feeds/:id        — delete feed
```

## Admin Endpoints (JWT + role check)

### Account Management (OWNER)
```
GET    /api/v1/admin/account              — account details
PATCH  /api/v1/admin/account              — update name/slug
GET    /api/v1/admin/account/users        — list users + roles
POST   /api/v1/admin/account/users/invite — invite user
PATCH  /api/v1/admin/account/users/:id    — change role
DELETE /api/v1/admin/account/users/:id    — remove user
```

### Market Management (ADMIN+)
```
GET    /api/v1/admin/markets              — list markets
POST   /api/v1/admin/markets              — create market
GET    /api/v1/admin/markets/:id          — market detail
PATCH  /api/v1/admin/markets/:id          — update market
DELETE /api/v1/admin/markets/:id          — deactivate market
```

### Source Management (ADMIN+)
```
GET    /api/v1/admin/sources              — list all available sources
POST   /api/v1/admin/sources              — create source for market
PATCH  /api/v1/admin/sources/:id          — update source
POST   /api/v1/admin/sources/:id/enable   — enable for account
POST   /api/v1/admin/sources/:id/disable  — disable for account
GET    /api/v1/admin/sources/by-type      — group by sourceType
```

### Credential Management (ADMIN+)
```
GET    /api/v1/admin/credentials          — list (secrets masked)
POST   /api/v1/admin/credentials          — create credential
PATCH  /api/v1/admin/credentials/:id      — update credential
DELETE /api/v1/admin/credentials/:id      — delete credential
POST   /api/v1/admin/credentials/:id/test — test credential validity
```

## Health Endpoint
```
GET /api/v1/health
Response: {
  "status": "healthy",
  "database": { "status": "connected", "latencyMs": 2 },
  "redis": { "status": "connected", "latencyMs": 1 },
  "uptime": 3600,
  "version": "1.0.0"
}
```

## Versioning

URL-based: `/api/v1/`. Breaking changes get `/api/v2/`. Non-breaking additions (new fields) don't require version bump.

## Pagination

Offset-based for v1. All list endpoints accept:
- `limit` (default 20, max 100)
- `offset` (default 0)

Response includes `pagination` object with `total`, `limit`, `offset`, `hasMore`.

## Error Format

```json
{
  "error": "Validation Error",
  "message": "Invalid email address",
  "details": [{ "field": "email", "message": "must be a valid email" }]
}
```

HTTP status codes: 200 (ok), 201 (created), 204 (deleted), 400 (validation), 401 (unauthorized), 403 (forbidden), 404 (not found), 409 (conflict), 429 (rate limited), 500 (server error).
