# Product Review: FuturiData Platform (FDP)

## Executive Summary

FuturiData Platform (FDP) is a purpose-built data lakehouse platform designed for media companies seeking to consolidate audience data into predictive intelligence and revenue-driving insights. Developed by Futuri and branded as "FUTURIDATA -- Future Intelligence," the platform is accessible via a modern, dark-themed React single-page application (reviewed at admin.uat.futuridata.com). FDP targets a specific vertical -- media organizations -- and orients its entire feature set around the challenge these companies face: ingesting disparate audience and advertiser data from CRMs, third-party enrichment providers, and web sources, then resolving, cleaning, and surfacing that data as enterprise-grade assets.

The platform is built on a Delta Lake foundation and implements a medallion architecture (raw, processed, curated, analytics) as its core organizational principle. What distinguishes FDP from general-purpose lakehouse platforms such as Databricks or Snowflake is its opinionated, media-vertical focus and the degree to which it has productized the end-to-end data journey -- from CRM ingestion through entity resolution to enterprise gold tables -- as a first-class visual experience rather than a configuration exercise. The inclusion of an MCP (Model Context Protocol) Tool Registry for AI agent integration is a forward-looking differentiator that few competitors in this market segment have attempted.

At the time of review, the platform is in an active development phase with several features marked as work-in-progress (WIP), including the MCP Tools interface, CRM connections, data quality modules, catalog lineage, and permissions management. The core processing backbone -- pipelines, runs, data journey visualization, catalog exploration, and query editor -- is functional and demonstrates meaningful production usage with 23 active pipelines, 37 tracked runs, and real customer data flowing through the system.

## Platform Architecture

FDP implements a four-tier medallion lakehouse architecture organized as: raw, processed, curated, and analytics. This is reflected directly in the catalog schema structure, where the `datalake` database exposes five schemas: `datalake_raw` (18 tables), `datalake_processed` (4 tables), `datalake_curated` (0 tables), `datalake_analytics` (0 tables), and `default` (0 tables). The heavy concentration of tables in the raw tier (18 of 22 total) indicates the platform is in an early-to-mid production phase, with substantial ingestion activity but limited downstream materialization into curated and analytics layers.

The underlying storage layer is Delta Lake, which provides ACID transactions, time travel for historical data preservation, and schema evolution. This is particularly relevant for the CRM integration module, which explicitly leverages Delta Lake time travel to preserve all historical CRM data even as records are updated or overwritten in source systems. The catalog layer integrates with both Unity Catalog and AWS Glue, both showing green/connected status during review. This dual-catalog approach provides flexibility for organizations operating in AWS-native environments while maintaining compatibility with the Databricks ecosystem.

## Feature Deep-Dive

### 1. Dashboard and Platform Health Monitoring

The dashboard serves as the operational command center, providing an at-a-glance view of platform health through four primary KPI cards: 23 Total Datasets, 35 of 37 Pipeline Runs successful (94.6% success rate), Average Quality Score, and 0 Open Incidents. A weekly bar chart tracks pipeline activity across Monday through Sunday, showing approximately 40 to 60 runs per day, indicating consistent automated pipeline execution throughout the week.

The Recent Runs panel surfaces the most recent pipeline executions, including the "prospect" transformation pipeline, "Canes Weekly Personas 2025," and "Canes Daily Device Counts 2025" -- all real customer workloads. Quick actions include a Refresh button and a prominent "+ New Pipeline" call-to-action. The dashboard is functional but relatively straightforward; it lacks the anomaly alerting, trend analysis, or customizable widget capabilities found in more mature observability platforms. The zero open incidents metric, combined with the 94.6% success rate, suggests either effective pipeline reliability or that the incident tracking system is not yet fully instrumented.

**Maturity Assessment:** Functional and production-ready for basic operational monitoring. Would benefit from configurable alerting thresholds, historical trend lines, and drill-down capabilities from KPI cards to filtered views.

### 2. Data Journey -- Visual Pipeline Orchestration

The Data Journey is unambiguously the platform's signature feature and its most compelling differentiator. It presents an end-to-end visual pipeline orchestration view that traces data from five distinct sources through ten processing stages across 28 nodes, culminating in enterprise-grade gold tables. The top-level KPI bar summarizes the entire journey: 5 Sources, 2.9M Input Records, 1.4M Output Records, 51% Compression, and 96% Average Quality.

The visualization supports three view modes -- Flow, Fit, and Full -- allowing users to toggle between a simplified logical view, a fitted view optimized for screen real estate, and a fully expanded node-level view. Search functionality spans nodes, stages, and pipelines. An Export button enables offline sharing of the journey map.

The pipeline stages, rendered left-to-right with color-coded nodes, proceed as follows:

**Source (red):** Five ingestion sources feed the pipeline -- Salesforce CRM (245.0K records), Dun & Bradstreet (1.2M records), LinkedIn (890.0K records), Web Crawlers (520.0K records), and SEC Filings. This mix of first-party CRM data, third-party commercial data, professional network data, unstructured web data, and regulatory filings represents a comprehensive company-intelligence ingestion strategy.

**Transform (orange):** Each source has a dedicated transformation node. Schema Normalization handles CRM, Dun & Bradstreet, and LinkedIn data. Parse & Extract processes web crawler output. Filing Parser handles SEC filings. This stage standardizes heterogeneous source schemas into a common format.

**Quality (green):** Validation nodes apply data quality checks per source with visible quality scores: Validate CRM (97%), Validate D&B (98%), Validate LinkedIn (92%), Validate Crawl (88%), and Validate Filings. The variance in quality scores is realistic and informative -- web-crawled data expectedly scores lowest, while structured commercial data scores highest.

**Cleanup (teal):** Dedup & Clean nodes for each source handle deduplication and data cleansing before records enter the common model.

**Common Data Model (purple):** The Company CDM node serves as the convergence point, taking 2.5M input records and producing 2.5M output records at 96% quality. This is where the five distinct source schemas are unified into a single canonical company representation.

**Enrichment (blue):** Three enrichment nodes operate in sequence: Industry Classification, Geocoding & Geo, and Revenue Estimation. Each processes the full 2.5M record set, adding derived attributes to the common data model.

**Entity Resolution (pink):** The Match & Merge node is where the most significant data compression occurs, reducing 2.5M input records to 1.4M output records at 94% quality. This 44% reduction represents the deduplication of company entities across the five source systems -- a critical step for producing a single, authoritative company record.

**Trust & Survivorship (green):** Survivorship Rules process 1.4M records with 97% quality, applying business rules to determine which source values "win" when multiple sources provide conflicting data for the same entity.

**Enterprise Gold (cyan):** The Enterprise Company node represents the final output -- 1.4M golden records at 99% quality, ready for consumption by downstream analytics and data products.

**Maturity Assessment:** This is a mature, well-designed feature that effectively communicates an inherently complex multi-source data integration process. The per-node metrics (input records, output records, quality scores) provide genuine operational value. The 51% compression ratio from 2.9M input to 1.4M output tells a clear data story. This feature alone would justify evaluation of FDP for any media company dealing with multi-source company or audience data integration.

### 3. Data Catalog and Governance

The catalog module is branded as providing "unified data and AI governance across your data lake" and integrates with two catalog backends: Unity Catalog and AWS Glue, both confirmed connected during review. The Catalog Explorer presents a hierarchical tree browser rooted at the `datalake` database with five schemas following the medallion pattern.

The current table distribution reveals the platform's maturity trajectory: `datalake_raw` holds 18 tables (including `crm_companies` with 17 columns, `crm_contacts_new` with 16 columns, multiple `fast_food` yearly tables with 15 columns each, and various client-specific tables), while `datalake_processed` holds 4 tables. The `datalake_curated` and `datalake_analytics` schemas remain empty, suggesting that downstream materialization workflows are either in development or handled outside the catalog.

Additional tabs include Crawlers (0 running at time of review), Volumes, Lineage (marked WIP), and Permissions (marked WIP). The absence of lineage and permissions functionality represents a significant gap for enterprise governance requirements, though the WIP designation indicates these are on the roadmap.

**Maturity Assessment:** The dual-catalog integration (Unity + Glue) is architecturally sound and provides flexibility. The schema browser is functional for exploration. However, the WIP status on lineage and permissions means the platform cannot yet serve as a complete governance solution. Organizations with strict data governance requirements would need to supplement with external tooling until these features are delivered.

### 4. Data Quality Engine

The data quality module integrates Great Expectations as its validation engine, providing a structured approach to data quality management. The module is organized across four tabs: Expectation Suites, Validation Runs, Anomalies, and Legacy Checks.

At the time of review, 2 expectation suites are configured covering 2 datasets with 11 total expectations. The `customers_quality_suite` contains 6 active expectations against the "customers" dataset, while the `orders_quality_suite` contains 5 active expectations against the "orders" dataset. Each suite can be executed on-demand via a Run button, and new suites can be created through the "+ New Suite" action.

The choice of Great Expectations as the underlying engine is pragmatic -- it is an established open-source framework with a large expectation library and community support. However, the current deployment appears nascent with only 2 datasets under quality monitoring out of 23 total datasets in the platform.

**Maturity Assessment:** Early-stage. The Great Expectations integration provides a solid foundation, but coverage is minimal (2 of 23 datasets). The Anomalies and Legacy Checks tabs suggest planned capabilities for automated anomaly detection and backward compatibility with existing quality checks. The entire module carries a WIP badge, and expanding expectation coverage to match the platform's ingestion footprint should be a near-term priority.

### 5. Query Editor with AI Assist

The Query Editor provides a SQL IDE experience with syntax-highlighted code editing, a schema browser panel, and an integrated results viewer. The schema browser exposes the `datalake_raw` tables with column-level detail, including tables such as `crm_companies` (17 columns), `crm_contacts_new` (16 columns), `canes_daily_device_counts_2025`, `canes_weekly_personas_2025`, and multiple `fast_food` tables spanning 2023 through 2025.

The editor supports three tabs: Editor (active workspace), Saved Queries (persistent query library), and History (execution audit trail). Results can be copied, downloaded, or published as a view -- the last option being particularly valuable for democratizing derived datasets without requiring pipeline creation. A schema dropdown allows targeting queries against specific schemas.

The AI Assist button is present in the interface, offering AI-powered query generation or optimization assistance. This aligns with the broader industry trend of embedding LLM-driven SQL copilots within data platforms.

**Maturity Assessment:** The core SQL editing and execution workflow is production-ready. The "Publish as View" feature is a thoughtful addition that bridges the gap between ad-hoc analysis and governed data assets. The AI Assist capability, while not deeply evaluated in this review, represents table-stakes functionality in 2026 data platforms. The schema browser provides adequate navigability for the current catalog size but may need enhanced search and filtering as the table count grows.

### 6. Pipeline Management

The Pipelines module manages 23 active pipelines across two types: ingestion (the majority) and transformation (notably the "prospect" pipeline). Each pipeline card displays operational metrics including Total Runs, Success Rate, and Average Duration, providing immediate visibility into pipeline health.

Pipeline performance varies considerably. High-reliability pipelines include "Canes Weekly Personas 2025" (4 runs, 100% success, 1-second average), "Fast Food 2023/2024/2025" (100% success across all years), and "IQP Data" (2 runs, 100%, 5 seconds). Lower-reliability pipelines include "Canes Daily Device Counts 2025" (7 runs, 85.7% success) and "CRM Contacts" (4 runs, 50% success, 2 seconds) -- the latter warranting investigation given the critical nature of CRM data.

Available actions include Import (for bringing in externally defined pipeline configurations), "+ Create Pipeline" (for building new pipelines within the platform), and "Run Now" (for on-demand execution of individual pipelines). The inclusion of both LeadGen-specific pipelines ("LeadGen Account Mapping Raw," "LeadGen AdAnalytics Enriched") and client-specific pipelines indicates the platform serves both internal data operations and client-facing data delivery.

**Maturity Assessment:** Solid operational foundation with 23 active pipelines demonstrating real production workloads. The 50% success rate on CRM Contacts and 85.7% on Canes Daily Device Counts indicate areas requiring attention. The absence of visible scheduling configuration, dependency management, or retry policies in the card-level view suggests these may be configured at a deeper level or are pending development.

### 7. Run Monitoring and Observability

The Runs module tracks 37 total pipeline executions with a detailed breakdown: 35 successful, 2 failed, and 0 currently running. Each run record captures a comprehensive set of execution metadata including Run ID, completion status (completed or failed), trigger type (Manual observed in reviewed runs), associated pipeline name, execution timestamp, rows processed, bytes written, and duration.

For example, Run 34dd2722 executed the "prospect" transformation pipeline, processing 58 rows and writing 5.75 KB in 1.9 seconds. The Compare Runs feature enables side-by-side analysis of multiple pipeline executions, which is valuable for identifying performance regressions or data volume anomalies between runs. Filtering is available by both Status and Pipeline, supporting targeted investigation.

**Maturity Assessment:** The run monitoring provides adequate operational visibility for the current scale. Row counts, byte volumes, and duration metrics offer the essential observability triad. The Compare Runs feature is a genuinely useful analytical tool. As the platform scales, this module would benefit from automated alerting on anomalous runs, duration trend analysis, and cost attribution per pipeline execution.

### 8. Data Products Marketplace

The Data Products module enables self-service data consumption through a marketplace paradigm. Two data products are currently published: "TopLine Enterprise" (silver tier, 3 datasets, Sales domain, v1.0.0, published February 2, 2026) and "LeadGen" (bronze tier, 2 datasets, Sales domain, v1.0.0, published February 16, 2026). KPI cards show 2 Total Products, 2 Published, 0 With Contracts, 0 Active Consumers, and 0 Delta Lake Enabled.

The medallion tier badges (bronze, silver, gold) applied to data products create a quality signaling mechanism that helps consumers understand the level of curation and trustworthiness of each product. Products are versioned (both currently at v1.0.0), tagged by domain (Sales), and support contract-based governance (though no contracts are currently active). The zero active consumers metric suggests the marketplace is recently launched and has not yet achieved adoption.

**Maturity Assessment:** The data products framework is architecturally promising, implementing modern data mesh concepts including domain ownership, versioning, and contract-based consumption. However, with zero active consumers and zero contracts, the feature has not yet demonstrated product-market fit within the organization. The absence of Delta Lake enablement on existing products is also notable given the platform's Delta Lake foundation. This module requires investment in consumer onboarding and contract workflows to realize its potential.

### 9. MCP Tool Registry -- AI Agent Integration

The MCP Tool Registry is the platform's most forward-looking and innovative feature. It enables the publication and management of tools that AI agents can invoke via the Model Context Protocol, effectively making data lakehouse capabilities programmatically accessible to large language models and autonomous agent systems.

Three tools are currently published and actively invoked:

**query_dataset** (v1.2.0, Data category): The highest-traffic tool with 15,420 invocations, 245ms average latency, and a 2.0% error rate. Scoped with `datasets:read` and `query:execute` permissions, this tool allows AI agents to execute queries against platform datasets. Published by the Data Platform Team on December 1, 2025.

**search_knowledge** (v2.0.0, Knowledge category): With 8,930 invocations, 180ms average latency, and a 1.0% error rate, this tool enables knowledge retrieval operations. It holds `knowledge:read` permissions and is maintained by the AI Team. Published November 15, 2025, and already at v2.0.0, indicating active iteration.

**get_data_lineage** (v1.0.0, Governance category): The newest and lowest-traffic tool with 3,250 invocations, 320ms average latency, and a notably low 0.5% error rate. Scoped with `lineage:read` permissions, this tool exposes data lineage information to AI agents. Published by the Data Platform Team on October 20, 2025.

The aggregate metrics -- 27,600 total invocations and 248ms average latency -- demonstrate meaningful production usage. The permission scoping model (distinct read/execute permissions per tool) provides security governance over what AI agents can access. The category taxonomy (Data, Knowledge, Governance) provides organizational clarity.

**Maturity Assessment:** This feature is genuinely differentiated and positions FDP ahead of most competitors in the lakehouse space. The MCP protocol is emerging as a standard for AI agent tool integration, and having a first-class tool registry within a data platform is forward-thinking. The 27,600 invocations demonstrate real AI agent consumption. The error rates (0.5% to 2.0%) are acceptable for an early-stage integration layer. The WIP badge suggests additional tools and capabilities are planned. Organizations exploring AI agent architectures should pay close attention to this capability.

### 10. CRM Connections

The CRM module provides bidirectional synchronization between CRM systems and the data lake, with an explicit architectural stance: "Data Lake is the System of Record -- CRMs are ingestion sources and optional write-back targets. All historical data preserved with Delta Lake time travel." This positioning is consequential -- it inverts the traditional CRM-as-source-of-truth model and places the lakehouse at the center of the data architecture.

Two CRM connections are active: Salesforce Production (bidirectional, 5 objects mapped: Account, Opportunity, Contact, Lead, Campaign) and HubSpot Marketing (connected). The module reports 5 active Object Mappings, 6.7K records synced in the last 24 hours, and a 75% Sync Success Rate. The interface is organized across three tabs: Connections, Object Mappings, and Sync History.

A visual flow diagram illustrates the data movement pattern: CRMs flow into the Data Lake, which feeds Analytics. The bidirectional sync with Salesforce, covering five core sales objects, indicates the platform is designed to serve as the master data layer for sales operations -- receiving CRM data, enriching it through the data journey pipeline, and optionally writing enhanced records back to the CRM.

The 75% sync success rate is below production expectations and warrants investigation. The "last sync approximately 1 year ago" note on the Salesforce connection raises questions about whether the bidirectional sync is actively maintained or if the integration has experienced operational drift.

**Maturity Assessment:** The CRM integration architecture -- lakehouse-as-system-of-record with bidirectional CRM sync -- is strategically sound and reflects modern data architecture best practices. The Delta Lake time travel integration for historical preservation is a strong technical decision. However, operational indicators (75% sync success rate, stale sync timestamps) suggest the implementation needs stabilization. The 50% pipeline success rate observed for CRM Contacts in the Pipelines module corroborates reliability concerns in the CRM data flow. This module carries a WIP badge, and the gap between architectural vision and operational maturity is the widest of any feature reviewed.
