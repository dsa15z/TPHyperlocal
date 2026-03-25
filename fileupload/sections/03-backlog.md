## Recommended Product Backlog

### Priority Framework

The following backlog is organized into four priority tiers based on the current state of the FuturiData Platform as observed in the live UAT environment. Each item was identified through direct examination of the platform's dashboards, data products, pipelines, catalog, CRM connections, and quality monitoring.

- **P0 — Ship Blockers**: Features that are visibly incomplete (marked WIP in the UI), broken, or exhibiting failure rates that would prevent a customer from putting FDP into production. These must be resolved before any enterprise sales motion.
- **P1 — Competitive Parity**: Capabilities that Databricks, Snowflake, and dbt already offer. Without these, FDP will lose in head-to-head evaluations against horizontal data platforms, regardless of its media-vertical strengths.
- **P2 — Differentiators**: Features that would set FDP apart as the purpose-built data lakehouse for media companies. These turn FDP from "another data platform" into a defensible vertical product.
- **P3 — Future Vision**: Longer-horizon capabilities that extend the platform into adjacent value. These build the moat but are not required for initial market traction.

A separate **Debt and Fixes** section captures low-effort hygiene items that erode credibility during demos and evaluations.

---

### P0 — Ship Blockers (Complete These First)

**1. Data Lineage**

- **Description**: Implement column-level and table-level lineage tracking within the Catalog. The Lineage tab currently displays a WIP badge with no functional content. Lineage should map how data flows from raw ingestion sources through transformations to gold-tier data products, showing field-level provenance at each stage.
- **Rationale**: Enterprise data governance teams require lineage to satisfy regulatory obligations (GDPR Article 30, CCPA data mapping) and to perform impact analysis before schema changes. Without lineage, compliance-sensitive customers in regulated media markets (broadcast, political advertising) cannot adopt FDP. Lineage is also a prerequisite for meaningful data contracts (P1 item).
- **Estimated Effort**: L — Requires metadata extraction from pipeline definitions, a graph data model for lineage relationships, and a visualization layer integrated into the existing Catalog UI.
- **Impact**: High — Directly unblocks enterprise sales conversations and is a hard requirement for any customer with a data governance mandate.

**2. Permissions and Access Control**

- **Description**: Build role-based access control (RBAC), row-level security, and column masking within the Catalog. The Permissions tab is currently WIP. The system should support defining roles (admin, analyst, viewer), assigning them to users and groups, restricting access to specific schemas/tables/columns, and masking sensitive fields (PII, revenue data) based on role.
- **Rationale**: The platform currently runs with a Guest user (user-001), which signals that authentication and authorization are not fully implemented. Enterprise customers will not store advertiser revenue, listener PII, or CRM data in a platform without granular access controls. This is a non-negotiable requirement for SOC 2 readiness.
- **Estimated Effort**: XL — Touches every data access path (Catalog, Query Editor, Data Products, Pipelines). Requires an identity provider integration, a policy engine, and enforcement at the query execution layer.
- **Impact**: High — No enterprise deal closes without RBAC. This is the single highest-impact item on the backlog.

**3. Data Quality Coverage Expansion**

- **Description**: Extend automated data quality monitoring from the current 2 datasets (customers, orders) to all 23 datasets in the platform. Build an auto-generation engine that profiles each dataset and proposes an initial expectation suite based on column types, distributions, and null patterns. Provide a one-click accept-and-customize workflow for data stewards.
- **Rationale**: At 2 out of 23 datasets covered, quality monitoring protects less than 9% of the data estate. The 96% average quality score shown in the Data Journey is aspirational if it is not backed by validated expectations across the full pipeline. Media companies ingesting advertiser data, audience metrics, and CRM records need quality gates at every stage to prevent bad data from reaching gold tables.
- **Estimated Effort**: M — The Great Expectations framework is already integrated. The work is primarily in building the auto-profiling and suite-generation logic, plus wiring validation runs into pipeline execution.
- **Impact**: High — Moves quality from a demo feature to a production-grade capability. Directly supports data contract enforcement (P1 item).

**4. CRM Sync Reliability**

- **Description**: Investigate and resolve the 75% sync success rate for CRM connections. The Salesforce Production integration shows a last sync timestamp of approximately one year ago, which suggests the connection is stale or broken. Bring sync reliability to 99%+ with automatic retry logic, dead-letter queuing for failed records, and clear error reporting in the Sync History tab.
- **Rationale**: CRM integration is a core selling point of FDP for media companies — sales teams need advertiser and agency data flowing reliably between Salesforce/HubSpot and the data lake. A 75% success rate means one in four sync operations fails, which destroys trust. A year-old last-sync timestamp will raise immediate red flags in any live demo or proof-of-concept.
- **Estimated Effort**: M — Likely involves debugging the existing Salesforce connector, implementing retry/backoff logic, and adding monitoring. The 5 object mappings (Account, Opportunity, Contact, Lead, Campaign) need individual health checks.
- **Impact**: High — CRM sync is the most tangible value prop for sales-oriented buyers. Broken sync undermines the entire "data lake as system of record" narrative.

**5. Pipeline Error Handling and Observability**

- **Description**: Address the 5.4% pipeline failure rate (2 failed out of 37 runs) with structured error handling. The CRM Contacts pipeline has a 50% success rate (2 of 4 runs failed), which requires root-cause investigation. Implement: detailed error messages with stack traces in the Runs view, automatic retry with configurable backoff, dead-letter logging for records that fail transformation, and a pipeline health dashboard that surfaces degrading success rates before they become outages.
- **Rationale**: A 5.4% overall failure rate is acceptable for a UAT environment but unacceptable for production. More critically, the CRM Contacts pipeline's 50% success rate indicates a systemic issue — likely a schema mismatch or API rate limit — that needs diagnosis. Media companies running daily audience ingestion pipelines cannot tolerate silent failures that result in incomplete datasets.
- **Estimated Effort**: M — Error handling infrastructure is largely a framework concern. The CRM Contacts investigation is a targeted debugging effort. The health dashboard extends the existing Runs KPI cards.
- **Impact**: High — Pipeline reliability is the foundation of platform trust. Every failed run that goes undiagnosed erodes confidence.

---

### P1 — Competitive Parity (Next Quarter)

**1. Scheduling and Orchestration**

- **Description**: Add cron-based scheduling, event-driven triggers (file arrival, webhook, upstream pipeline completion), and dependency chain management. All 37 observed runs were triggered manually. Implement a visual schedule builder in the pipeline detail view, with support for complex DAGs where downstream pipelines wait for upstream completion.
- **Rationale**: Manual triggering is viable for development but completely impractical for production workloads. Databricks Workflows and Airflow both offer sophisticated scheduling out of the box. Media companies ingesting daily audience metrics, weekly advertiser reports, and real-time ad impression data need automated execution without human intervention.
- **Estimated Effort**: L — Requires a scheduler service, a trigger framework, a DAG execution engine, and UI for schedule configuration. This is foundational infrastructure.
- **Impact**: High — Without scheduling, FDP cannot run production workloads. This is the most important P1 item.

**2. Delta Lake and Table Format Enablement**

- **Description**: Enable Delta Lake features (ACID transactions, time travel, schema evolution, versioning) across data products. The Data Products view shows 0 Delta Lake Enabled despite the CRM section explicitly referencing Delta Lake time travel as a capability. Activate Delta Lake on all gold-tier tables and provide a UI for time travel queries (point-in-time restore, audit history).
- **Rationale**: Delta Lake is already referenced in the platform's marketing ("All historical data preserved with Delta Lake time travel") but is not enabled on any data product. This gap between promise and implementation will surface immediately during technical evaluation. Delta Lake is table stakes for any lakehouse platform.
- **Estimated Effort**: M — If the underlying storage is already Parquet on object storage, enabling Delta Lake is primarily a metadata and configuration task. The time travel UI in the Query Editor is additional work.
- **Impact**: High — Closes a credibility gap where the platform describes a capability it does not deliver.

**3. Alerting and Notifications**

- **Description**: Build an alerting framework that triggers notifications on pipeline failures, data quality violations, SLA breaches, and sync errors. Integrate with PagerDuty, Slack, email, and webhook endpoints. Provide configurable alert rules (threshold-based, anomaly-based) and an incident management view to track open alerts through resolution.
- **Rationale**: The dashboard shows 0 Open Incidents, but there is no visible alerting configuration, which suggests incidents are not being detected rather than not occurring. The 2 failed pipeline runs and 75% CRM sync rate should have generated alerts. Without alerting, failures are discovered by humans checking dashboards, which does not scale.
- **Estimated Effort**: M — Alerting is a well-understood pattern. The core work is in the rules engine and integration connectors. The incident management UI extends the existing dashboard.
- **Impact**: High — Alerting converts FDP from a tool that requires active monitoring into a platform that proactively surfaces problems.

**4. Data Contracts**

- **Description**: Implement data contracts that define SLAs between data producers (pipeline owners) and consumers (analysts, data products, downstream systems). Contracts should specify: schema guarantees, freshness requirements, quality thresholds, and availability targets. Display contract status on Data Product cards and enforce contracts during pipeline execution.
- **Rationale**: The Data Products view shows 0 With Contracts. Data contracts are the mechanism that transforms a collection of datasets into a governed data product with reliability guarantees. dbt and Atlan have popularized contracts as a core governance pattern, and enterprise buyers now expect them.
- **Estimated Effort**: M — Requires a contract definition schema, enforcement hooks in the pipeline execution engine, and a contract status display in the Data Products UI. Depends on data quality coverage (P0) being in place.
- **Impact**: Medium — Differentiates FDP's data product approach from raw table access. Important for enterprise governance narratives.

**5. Version Control for Pipelines**

- **Description**: Integrate pipeline definitions with Git so that changes are tracked, reviewed, and auditable. Support branching for development/staging/production promotion workflows. Display version history in the pipeline detail view.
- **Rationale**: Infrastructure-as-code is an industry standard. Without version control, pipeline changes are opaque — there is no way to determine who changed what, when, or why. This creates operational risk and compliance gaps.
- **Estimated Effort**: M — Requires Git integration, a serialization format for pipeline definitions, and a promotion workflow UI.
- **Impact**: Medium — Important for operational maturity and audit compliance. Becomes critical as the number of pipelines grows beyond the current 23.

**6. Audit Logging**

- **Description**: Capture and store immutable audit logs for all platform actions: data access (who queried what), configuration changes (pipeline edits, permission grants), and administrative operations (user creation, connector configuration). Provide a searchable audit log viewer with export capabilities.
- **Rationale**: Audit logging is a hard compliance requirement for SOC 2, GDPR, and CCPA. Media companies handling advertiser data and listener PII will be asked by their own compliance teams for audit evidence. The current Guest user access model (user-001) makes audit logging even more urgent.
- **Estimated Effort**: S — Event capture can be implemented as middleware across API endpoints. Storage is append-only. The viewer UI is straightforward.
- **Impact**: Medium — Required for compliance certifications. Low effort relative to its importance in enterprise sales conversations.

---

### P2 — Differentiators (This Half)

**1. AI-Powered Data Quality**

- **Description**: Extend the Great Expectations foundation with AI capabilities: auto-suggest quality rules by analyzing column distributions and historical patterns, detect anomalies that fall outside learned baselines, and predict data drift before it causes downstream failures. Surface AI-generated quality insights in the Data Quality dashboard.
- **Rationale**: Every lakehouse platform offers rule-based quality checks. AI-powered quality is a genuine differentiator that reduces the burden on data engineers and catches issues that static rules miss. This aligns with FDP's "Future Intelligence" branding and the existing AI Assist button in the Query Editor.
- **Estimated Effort**: L — Requires a profiling engine, ML models for anomaly detection and drift prediction, and integration with the existing quality framework.
- **Impact**: High — Positions FDP as the AI-native data platform rather than another Great Expectations wrapper.

**2. Expanded MCP Tool Registry**

- **Description**: Add MCP tools for: data profiling (column statistics, distribution analysis), anomaly detection (trigger investigations from AI agents), pipeline triggering (allow AI agents to kick off pipeline runs), and data product discovery (semantic search across the catalog). Expose these tools with clear permissions and rate limits.
- **Rationale**: The MCP Tool Registry with 3 published tools and 27,600 invocations is one of FDP's most unique features. No competing lakehouse platform has an AI agent tool registry. Expanding the tool set deepens this advantage and makes FDP the data platform that AI agents interact with natively.
- **Estimated Effort**: M — Each tool is a discrete unit of work. The registry infrastructure already exists. The primary effort is in building reliable tool implementations with proper error handling.
- **Impact**: High — Extends a unique competitive advantage. The AI agent ecosystem is growing rapidly, and FDP's early position in MCP tooling is valuable.

**3. Additional CRM Connectors**

- **Description**: Add connectors for Microsoft Dynamics 365, Zoho CRM, and Pipedrive. Follow the same bidirectional sync pattern established for Salesforce and HubSpot, with object mapping configuration, sync history, and success rate monitoring.
- **Rationale**: Media companies use a diverse range of CRMs. Mid-market radio groups and digital media companies are more likely to use Zoho or Pipedrive than Salesforce. Expanding connector coverage increases the addressable market without changing the core product.
- **Estimated Effort**: M per connector — Each requires API integration, object mapping logic, sync orchestration, and testing. The existing CRM framework provides a template.
- **Impact**: Medium — Expands addressable market. Each connector unlocks a segment of media companies that cannot currently adopt FDP.

**4. Audience Intelligence Layer**

- **Description**: Build media-specific analytics modules: listener and viewer audience segmentation, content performance scoring, ad inventory optimization, and advertiser propensity modeling. These modules sit on top of the gold-tier enterprise tables and provide pre-built dashboards and reports tailored to media workflows.
- **Rationale**: This is the vertical differentiation that justifies FDP's existence as a separate product from Databricks or Snowflake. The platform already ingests media-relevant data (Canes audience metrics, device counts, personas, fast food advertising data). The Audience Intelligence Layer transforms raw data into media-specific insights that a general-purpose lakehouse cannot offer out of the box.
- **Estimated Effort**: XL — Requires domain modeling, pre-built analytical queries, a visualization layer, and deep collaboration with media industry experts to ensure the output matches how media companies actually make decisions.
- **Impact**: High — This is the feature that makes FDP a category rather than a product. It is the primary reason a media company would choose FDP over a horizontal platform.

**5. Embedded Analytics and BI**

- **Description**: Allow users to build dashboards, charts, and reports directly from gold-tier tables within FDP, without exporting to Tableau, Looker, or Power BI. Provide a drag-and-drop dashboard builder, scheduled report delivery, and embeddable iframe widgets for external sharing.
- **Rationale**: Every data export to a third-party BI tool is a point of friction and a potential security gap. Embedded analytics keeps users inside FDP and increases platform stickiness. For smaller media companies that do not have Tableau licenses, this removes a barrier to deriving value from their data.
- **Estimated Effort**: XL — Building a BI layer is a significant undertaking. Consider integrating an open-source framework (Apache Superset, Metabase) rather than building from scratch.
- **Impact**: Medium — Increases platform stickiness and value for customers without existing BI tools. Less critical for enterprises that already have Tableau or Looker.

**6. Reverse ETL**

- **Description**: Write enriched and transformed data from gold-tier tables back to operational systems beyond CRM. Support targets including: email marketing platforms (Mailchimp, Constant Contact), ad platforms (Google Ads, Meta Ads), customer data platforms, and custom webhooks.
- **Rationale**: The current CRM sync is a limited form of reverse ETL. Expanding write-back capabilities to advertising and marketing platforms makes FDP the central hub for media companies' data-driven operations — not just a warehouse they query, but a system that actively powers downstream tools.
- **Estimated Effort**: L — Each destination requires a connector. The orchestration and conflict resolution logic for write-back is more complex than read-only ingestion.
- **Impact**: Medium — Completes the bidirectional data flow story and increases the operational value of the platform.

**7. Data Marketplace**

- **Description**: Allow FDP customers to publish, discover, and subscribe to data products from other organizations. A media group could share anonymized audience data, a data vendor could list enrichment datasets, and advertisers could provide campaign performance data — all governed by access policies and usage tracking within FDP.
- **Rationale**: Data marketplaces create network effects that entrench a platform. Snowflake's Marketplace is a significant competitive moat. For media companies, a marketplace for audience data, advertiser intelligence, and market benchmarks would be uniquely valuable.
- **Estimated Effort**: XL — Requires multi-tenant data isolation, a subscription and licensing model, usage metering, and a discovery UI. This is a product in itself.
- **Impact**: Medium — High strategic value for long-term platform lock-in, but not required for initial adoption.

---

### P3 — Future Vision (Next Year)

**1. ML Model Registry**

- **Description**: Allow data teams to train, version, deploy, and monitor machine learning models using lakehouse data. Integrate with MLflow or a similar framework. Support model serving for real-time scoring and batch inference.
- **Rationale**: Audience prediction, churn modeling, and ad yield optimization are natural ML use cases for media companies. A model registry keeps ML workflows inside FDP rather than requiring a separate MLOps tool.
- **Estimated Effort**: XL
- **Impact**: Medium — Important for advanced customers but not a requirement for initial platform adoption.

**2. Real-Time Streaming Pipelines**

- **Description**: Add support for streaming data ingestion and processing via Kafka, Kinesis, or Flink. Enable real-time audience metrics, live ad impression tracking, and streaming quality monitoring.
- **Rationale**: The current platform is batch-oriented. Media companies with live broadcast or digital streaming operations need real-time data for programmatic ad decisioning and live audience measurement.
- **Estimated Effort**: XL
- **Impact**: Medium — Opens new use cases but is not required for the batch-analytics customers FDP currently targets.

**3. Multi-Tenant and White-Label Support**

- **Description**: Allow large media groups to run separate, isolated FDP instances per brand, station group, or business unit, all managed from a single administrative control plane. Support white-labeling for resellers and agency partners.
- **Rationale**: Large media conglomerates operate multiple brands with distinct data governance requirements. Multi-tenancy enables a single enterprise contract to serve an entire portfolio of brands.
- **Estimated Effort**: XL
- **Impact**: Low — Relevant only for the largest enterprise deals. Not a factor in initial market entry.

**4. Natural Language Query Interface**

- **Description**: Allow users to ask questions in plain English ("Show me top advertisers by revenue this quarter") and receive SQL queries, executed results, and visualizations. Build on the existing AI Assist button in the Query Editor.
- **Rationale**: Lowers the barrier to data access for non-technical users (sales reps, account managers, program directors) who need insights but cannot write SQL.
- **Estimated Effort**: L
- **Impact**: Medium — High value for user adoption but depends on reliable AI query generation, which remains imprecise for complex schemas.

**5. API Gateway for Data Products**

- **Description**: Expose data products as REST and GraphQL APIs with authentication, rate limiting, and usage metering. Allow external systems to query FDP data products programmatically without direct database access.
- **Rationale**: API access transforms data products from internal assets into platform capabilities that power external applications, partner integrations, and customer-facing analytics.
- **Estimated Effort**: L
- **Impact**: Medium — Extends the reach of data products beyond FDP's own UI.

**6. Compliance Templates**

- **Description**: Provide pre-built compliance frameworks for GDPR, CCPA, SOC 2, and media-specific regulations (FCC data retention, political advertising transparency). Templates auto-configure data retention policies, access controls, audit logging, and consent management based on the selected framework.
- **Rationale**: Compliance configuration is time-consuming and error-prone. Pre-built templates reduce time-to-compliance and differentiate FDP as a platform that understands media-industry regulatory requirements.
- **Estimated Effort**: L
- **Impact**: Low — Valuable as a sales accelerator but dependent on P0 and P1 infrastructure (RBAC, audit logging, lineage) being in place first.

---

### Debt and Fixes

**1. Pipeline Documentation Enforcement**

- **Description**: Most pipelines display "No description" in their cards. Enforce a minimum description requirement when creating or editing pipelines. Backfill descriptions for all 23 existing pipelines.
- **Rationale**: Missing descriptions make the platform look unfinished during demos and make it impossible for new team members to understand pipeline purposes without reading source code.
- **Estimated Effort**: S
- **Impact**: Low — Cosmetic but affects first impressions during evaluations.

**2. Data Product Consumer Onboarding**

- **Description**: The Data Products view shows 0 Active Consumers despite 2 published products. Create onboarding documentation, example queries, and a "Connect to this product" workflow that guides analysts to start consuming data products via the Query Editor or external BI tools.
- **Rationale**: Zero consumers on published products signals an adoption gap. The products exist but nobody is using them, which suggests either discoverability or usability barriers.
- **Estimated Effort**: S
- **Impact**: Medium — Active consumers validate the data product model. Without consumption, data products are just labeled tables.

**3. Medallion Architecture Completion**

- **Description**: The Catalog shows 0 tables in both the analytics and curated schemas, while raw holds 18 tables and processed holds 4. Implement transformation pipelines that promote data from raw through processed, curated, and into analytics, populating all four layers of the medallion architecture.
- **Rationale**: An empty curated and analytics layer means the medallion architecture is aspirational rather than functional. The gold-tier data products cannot be properly governed if the intermediate layers are missing.
- **Estimated Effort**: M
- **Impact**: Medium — Completing the medallion architecture is necessary for the Data Journey visualization to reflect reality and for quality gates to operate at each tier.

**4. Guest User Access Remediation**

- **Description**: The current session runs as user-001 (Guest), which suggests that authentication and role assignment are not fully implemented. Replace guest access with proper user provisioning, SSO integration, and role assignment as part of the Permissions and Access Control work (P0 item 2).
- **Rationale**: Guest access in a data platform is a security finding that will appear in any vendor security assessment. It signals that the platform is not production-ready for environments handling sensitive data.
- **Estimated Effort**: S (as part of the larger RBAC implementation)
- **Impact**: High — Directly affects security posture and enterprise readiness.
