# Section 9 — MCP Server Design

## Overview

The MCP (Model Context Protocol) server exposes the story dataset as tools for AI assistants. Built with `@modelcontextprotocol/sdk`, deployed on Railway as a standalone service using stdio transport.

## Tools (7 total)

### `query_stories`
Search and filter stories with flexible parameters.
```json
{
  "name": "query_stories",
  "inputSchema": {
    "properties": {
      "query": { "type": "string", "description": "Text search" },
      "status": { "type": "string", "enum": ["EMERGING","BREAKING","TRENDING","ACTIVE","STALE"] },
      "category": { "type": "string" },
      "minScore": { "type": "number", "min": 0, "max": 1 },
      "sortBy": { "type": "string", "enum": ["compositeScore","breakingScore","trendingScore","firstSeenAt"] },
      "order": { "type": "string", "enum": ["asc","desc"] },
      "limit": { "type": "number", "max": 100 }
    }
  }
}
```

### `get_story`
Get a single story with full details and all source posts.

### `get_breaking_stories`
Get current breaking stories sorted by breaking score. Default limit: 10.

### `get_trending_stories`
Get current trending stories sorted by trending score.

### `search_stories`
Full-text search with date range and category filters. Requires `query` parameter.

### `get_story_cluster`
Get all supporting source posts for a story with similarity scores and platform breakdown.

### `get_source_stats`
Source health dashboard — post counts, last poll times, health status per source.

## Implementation

- Each tool queries PostgreSQL via Prisma
- Results serialized with `serializeDates()` to convert Date objects to ISO strings
- Zod validation on all input parameters
- JSON text content responses

## Deployment

- Runs as a long-lived process on Railway
- Same PostgreSQL connection as API and workers
- Stdio transport (`StdioServerTransport`) for local/pipe connections
- v2: SSE transport for remote HTTP access

## Example Usage

```
User: "What are the top breaking stories in Houston right now?"
→ Tool: get_breaking_stories { limit: 5 }
→ Returns: 5 stories with scores, sources, and locations

User: "Tell me about the fire in Galleria"
→ Tool: search_stories { query: "fire Galleria", limit: 5 }
→ Returns: matching stories with source counts

User: "Show me all the sources for that story"
→ Tool: get_story_cluster { storyId: "clx1abc..." }
→ Returns: story with all source posts, similarity scores, platform breakdown
```
