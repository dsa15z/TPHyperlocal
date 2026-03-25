# FDP (FuturiData Platform) — Research Notes from Live Platform Review

## Platform Overview
FDP is a data lakehouse platform by Futuri, branded as "FUTURIDATA — Future Intelligence". URL: admin.uat.futuridata.com. Dark-themed UI, modern React SPA. Tagline: enabling media companies to turn audience data into predictive intelligence and revenue growth.

## Navigation Structure
- **PRODUCTS**: Data Products, MCP Tools (WIP), CRM (WIP)
- **DATA**: Catalog, Data Quality (WIP), Query Editor
- **PROCESSING**: Pipelines, Runs, Data Journey

---

## 1. DASHBOARD
- Monitor data platform health and activity
- KPI cards: 23 Total Datasets, 35/37 Pipeline Runs (94.6% success rate), Avg Quality Score, 0 Open Incidents
- Pipeline Activity chart (weekly bar chart Mon-Sun, showing ~40-60 runs/day)
- Recent Runs panel: prospect, Canes Weekly Personas 2025, Canes Daily Device Counts 2025
- Actions: Refresh, + New Pipeline button

## 2. DATA PRODUCTS
- "Publish and manage data products for self-service consumption"
- KPI cards: 2 Total Products, 2 Published, 0 With Contracts, 0 Active Consumers, 0 Delta Lake Enabled
- Product cards with medallion tier badges:
  - **TopLine Enterprise** (silver tier, 3 datasets, Sales domain, v1.0.0, published 2/2/2026, tag: "topline")
  - **LeadGen** (bronze tier, 2 datasets, Sales domain, v1.0.0, published 2/16/2026)
- Search, filter by Status and Domains
- + Create Product button

## 3. MCP TOOL REGISTRY
- "Publish and manage tools for AI agents"
- KPI cards: 3 Total Tools, 3 Published, 27,600 Total Invocations, 248ms Avg Latency
- Three published tools:
  - **query_dataset** (v1.2.0, Data category, 15,420 invocations, 245ms latency, 2.0% error rate, permissions: datasets:read, query:execute, by Data Platform Team, 12/1/2025)
  - **search_knowledge** (v2.0.0, Knowledge category, 8,930 invocations, 180ms latency, 1.0% error rate, permissions: knowledge:read, by AI Team, 11/15/2025)
  - **get_data_lineage** (v1.0.0, Governance category, 3,250 invocations, 320ms latency, 0.5% error rate, permissions: lineage:read, by Data Platform Team, 10/20/2025)
- Search, filter by Categories and Status
- + Create Tool button

## 4. CRM CONNECTIONS
- "Manage CRM integrations with bidirectional sync capabilities"
- KPI cards: 2 of 2 Connected CRMs, 5 active Object Mappings, 6.7K Records Synced (24h), 75% Sync Success Rate
- Banner: "Data Lake is the System of Record — CRMs are ingestion sources and optional write-back targets. All historical data preserved with Delta Lake time travel."
- Flow diagram: CRMs → Data Lake → Analytics
- Tabs: Connections, Object Mappings, Sync History
- Connected CRMs:
  - **Salesforce Production** (connected, bidirectional, 5 objects mapped: Account, Opportunity, Contact, Lead, Campaign, last sync ~1 year ago)
  - **HubSpot Marketing** (connected)
- Actions: Trigger Sync, + Add Connection

## 5. CATALOG
- "Unified data and AI governance across your data lake"
- Connectors: Unity (green/connected), Glue (green/connected)
- Tabs: Explorer, Crawlers (0 running), Volumes, Lineage (WIP), Permissions (WIP)
- Catalog Explorer tree:
  - datalake (5 schemas)
    - datalake_analytics (0 tables)
    - datalake_curated (0 tables)
    - datalake_processed (4 tables)
    - datalake_raw (18 tables)
    - default (0 tables)
- Medallion architecture: raw → processed → curated → analytics
- Actions: Sync Catalog, + New Table

## 6. DATA QUALITY
- "Monitor and validate data quality with Great Expectations"
- Tabs: Expectation Suites, Validation Runs, Anomalies, Legacy Checks
- KPI cards: 2 Expectation Suites, 11 Total Expectations, 2 Datasets Covered
- Suites:
  - **customers_quality_suite** (6 expectations, 6 active, for "customers" dataset)
  - **orders_quality_suite** (5 expectations, 5 active, for "orders" dataset)
- Actions: + New Suite, Run button per suite

## 7. QUERY EDITOR
- "Write and execute SQL queries with AI assistance"
- Schema Browser: datalake_raw with tables including:
  - canes_daily_device_counts_2025, canes_weekly_personas_2025 (x2), crm_companies (17 cols), crm_contacts_new (16 cols), farmers_dog_2025_weekly_vi, fast_food_2023/2024/2025 (15 cols each), jag_pt_weekly (3 cols)
- SQL code editor with syntax highlighting
- Tabs: Editor, Saved Queries, History
- Results panel with copy, download, and "Publish as View" options
- AI Assist button, Save Query button
- Run Query button with schema dropdown

## 8. PIPELINES
- "Manage and monitor your data pipelines"
- 23 pipelines total, all active
- Pipeline types: ingestion (most), transformation (prospect)
- Each card shows: name, type, description, Total Runs, Success Rate, Avg Duration
- Example pipelines:
  - Canes Daily Device Counts 2025 (7 runs, 85.7%, 0s)
  - Canes Weekly Personas 2025 (4 runs, 100%, 1s)
  - CRM Contacts (4 runs, 50%, 2s)
  - CRM Pipeline (2 runs, 100%, 1s)
  - Farmers Dog 2025 Weekly Visits (6 runs, 100%, 1s)
  - Fast Food 2023/2024/2025 (various, 100%)
  - IQP Data (2 runs, 100%, 5s)
  - JAG PT 2025 Weekly Traffic (2 runs, 100%, 0s)
  - Kayal Ortho 2025 Weekly Traffic (2 runs, 100%, 0s)
  - LeadGen Account Mapping Raw, LeadGen AdAnalytics Enriched
  - prospect (transformation type)
  - RR Company Data
- Actions: Import, + Create Pipeline, Run Now per pipeline

## 9. RUNS
- "View and monitor pipeline execution runs"
- KPI cards: 37 Total Runs, 35 Successful, 2 Failed, 0 Running
- Each run shows: Run ID, status (completed/failed), trigger (Manual), pipeline name, time ago, Rows processed, Written (KB), Duration
- Example: Run 34dd2722 — prospect pipeline, 58 rows, 5.75 KB written, 1.9s duration
- Compare Runs feature
- Filter by Status and Pipeline

## 10. DATA JOURNEY
- "End-to-end pipeline visualization showing how datasets flow from sources to enterprise-grade gold tables"
- KPI bar: 5 Sources, 2.9M Input Records, 1.4M Output, 51% Compression, 96% Avg Quality
- Companies dropdown: 5 sources, 28 nodes
- View toggles: Flow, Fit, Full
- Search: nodes, stages, pipeline
- Export button

### Pipeline Stages (left to right):
1. **Source** (red): Salesforce CRM (245.0K), Dun & Bradstreet (1.2M), LinkedIn (890.0K), Web Crawlers (520.0K), SEC Filings
2. **Transform** (orange): Schema Normalization (for CRM/D&B/LinkedIn), Parse & Extract (for Web), Filing Parser (for SEC)
3. **Quality** (green): Validate CRM (97%), Validate D&B (98%), Validate LinkedIn (92%), Validate Crawl (88%), Validate Filings
4. **Cleanup** (teal): Dedup & Clean for each source
5. **Common Data Model** (purple): Company CDM (In: 2.5M, Out: 2.5M, 96%)
6. **Enrichment** (blue): Industry Classification (2.5M→2.5M), Geocoding & Geo (2.5M→2.5M), Revenue Estimation (2.5M→2.5M)
7. **Entity Resolution** (pink): Match & Merge (In: 2.5M, Out: 1.4M, 94%)
8. **Trust & Survivorship** (green): Survivorship Rules (In: 1.4M, Out: 1.4M, 97%)
9. **Enterprise Gold** (cyan): Enterprise Company (In: 1.4M, Out: 1.4M, 99%)

### Legend (color-coded):
Source, Transform, Quality, Cleanup, Common Data Model, Enrichment, Entity Resolution, Trust & Survivorship, Relationship, Enterprise (Gold)

---

## UI/UX Notes
- Dark theme throughout (navy/charcoal backgrounds)
- Cyan-to-purple gradient on logo
- Consistent card-based UI with KPI summary bars at top of each page
- WIP badges on features still in development (MCP Tools, CRM, Data Quality, Lineage, Permissions)
- Global search: "Search datasets, pipelines, docs..."
- Notification bell with badge (3 notifications)
- Light/dark mode toggle icon visible
- User: user-001 (Guest)
- + New Pipeline button always visible in sidebar
