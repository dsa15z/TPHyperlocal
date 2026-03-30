# Breaking News Intelligence Platform — Product Summary & Competitive Analysis

## Executive Summary

Breaking News Intelligence is a comprehensive newsroom intelligence platform purpose-built for broadcast television news operations. It is the only product in the market that covers the entire editorial workflow — from story detection through scoring, assignment, production, publishing, and performance analysis — in a single integrated system.

The platform replaces what typically requires three to five separate vendor subscriptions (Dataminr for detection, NewsWhip for prediction, Chartbeat for analytics, TopicPulse for show prep, TVEyes for broadcast monitoring) with one unified system built on modern architecture: Next.js frontend, Fastify API backend, BullMQ worker pipeline, PostgreSQL with pgvector, Redis caching, and a four-provider LLM chain.

As of March 2026, the system comprises 46,500 lines of TypeScript across 261 API endpoints, 44 frontend pages, 35 background workers, and 56 database models. It processes stories through a strict pipeline — ingestion, enrichment, clustering, scoring — and surfaces them through customizable dashboards, AI-generated content packages, and real-time alerts.

---

## How It Works

A story enters the system when one of the platform's data sources detects new content. The system currently supports seven ingestion channels: RSS feeds (200+ pre-configured sources spanning local TV, newspapers, government, police, courts, weather, traffic, universities, sports, business, and Spanish-language media), the Newscatcher news search API, Twitter/X via both direct API polling and Grok's real-time social intelligence, Facebook page monitoring via the Graph API, YouTube channel and search monitoring, GDELT global event detection, and four LLM providers (OpenAI, Grok, Gemini, and optionally Claude) that actively scan for breaking events by analyzing real-time social media posts.

Once ingested, each source post flows through a four-stage pipeline. The enrichment stage classifies the story by category using keyword matching with LLM fallback, extracts entities (people, organizations, locations), detects Houston-area neighborhoods with contextual disambiguation, and analyzes sentiment. The article extraction stage simultaneously fetches the full article text from the original URL, replacing the often-truncated RSS description with complete reporting. The clustering stage groups related posts into unified stories using a two-tier approach: Jaccard similarity serves as a fast pre-filter, then OpenAI embeddings (with local TF-IDF fallback) provide semantic similarity scoring for the final merge decision. A content-hash deduplication guard at both the ingestion and clustering layers prevents the same article from appearing multiple times when RSS feeds change their GUIDs between polls. The scoring stage calculates five independent scores — breaking, trending, confidence, locality, and composite — using category-specific decay curves, source diversity weighting, and engagement velocity. These scores drive an eight-state editorial lifecycle (ALERT, BREAKING, DEVELOPING, TOP_STORY, ONGOING, FOLLOW_UP, STALE, ARCHIVED) with tiered status transitions calibrated for thirty-minute breaking news windows, roughly four times faster than the industry standard two-hour detection cycle.

The platform then makes this intelligence available through a rich set of tools designed for the specific roles in a broadcast newsroom.

---

## The Producer's Workflow

A television news producer preparing for a five o'clock broadcast opens the dashboard to find a customizable story grid with sortable, resizable columns, saved view presets, and multi-faceted filtering by category, status, source, time range, trend direction, minimum score, and coverage gaps. The view system lets producers save and switch between configurations like "Breaking Compact" (just status, title, score, and sources for a dense scan), "Coverage Gaps" (highlighting stories competitors have covered that their station has not), and "Trending Focus" (rising stories sorted by momentum).

For the show itself, the A-block lineup recommendation engine scores the top thirty active stories using a weighted formula of composite score, source velocity, coverage gap status, trend direction, and recency — then presents a ranked list of recommended stories with a lead recommendation and AI-generated rationale explaining why each story deserves its position. The drag-and-drop rundown editor lets the producer build the actual show, dragging stories from a search panel into a visual timeline with item types (package, VO, VOSOT, live shot, reader, break, tease, weather, sports), adjustable durations, running time accumulation, and a show timing bar that turns red when the block runs over. When the rundown is ready, a single button pushes it directly into ENPS or iNews via the MOS protocol over TCP, eliminating the manual copy-paste that typically consumes fifteen to twenty minutes per show.

The deadline tracker displays countdown timers for each configured show, pulsing red when scripts are due or air time is imminent. The system tracks which stories in each rundown have breaking packages generated and which reporters have filed, surfacing "47 minutes to air, 3 stories with no script, Reporter Johnson hasn't checked in" alerts via Server-Sent Events.

---

## The Assignment Editor's Workflow

The assignment desk operates from a Kanban board with columns for each stage of the field reporting process: assigned, en route, on scene, filed, and aired. When a story breaks, the AI reporter suggestion engine recommends which reporter to assign based on a scoring algorithm that combines beat expertise (does the reporter's beat match the story category) with geographic proximity (how close is the reporter's current GPS position to the story location). The editor taps to assign, and the reporter's status automatically transitions through the workflow as they update from the field.

Reporter performance dashboards track completion rate, average turnaround time from assignment to filing, exclusive story count, on-time rate against deadlines, beat distribution, and weekly trends — giving assignment editors and news directors the data they need for staffing decisions and annual reviews.

---

## The Digital Editor's Workflow

When a story needs to reach audiences across platforms, the one-click breaking news package generates seven outputs from a single LLM call: a thirty-second broadcast script, a tweet-length social post with hashtags, a push notification title and body, a three-sentence web summary, bullet points of key facts, and an AI image generation prompt for graphics. The publish queue lets editors review and edit each output before publishing to selected channels — broadcast, social media (directly to X, Facebook, and Instagram), push notification via Firebase Cloud Messaging, and web via direct CMS publishing to WordPress, Arc, or any custom REST endpoint.

The headline A/B testing system lets editors create two to four variant headlines for any story, tracks impressions and clicks through lightweight embed analytics, calculates statistical significance using z-tests, and auto-selects the winning headline at ninety-five percent confidence — the same capability that Chartbeat charges thirteen thousand dollars per year to provide.

For video, the AI video generation pipeline produces structured storyboards in three formats: social clips (fifteen to thirty seconds with hook, quick scenes, and call to action), web packages (forty-five to ninety seconds with voiceover narration and source attribution), and broadcast B-roll packages (twenty to forty-five seconds with anchor intro and lower third suggestions). Each storyboard includes scene-by-scene visual descriptions, voiceover scripts, graphic generation prompts, music suggestions, and title card text.

---

## The Story Intelligence Layer

Every story in the system is enriched with multiple layers of AI analysis. The AI source summary automatically generates a consolidated analysis of all source articles when a story detail page is opened, polling every five seconds until the background worker completes. For stories with limited data or controversial angles, the AI story research feature produces deep background including historical context, five to eight key facts, multiple named perspectives (law enforcement, community leaders, legal experts) each with a copyable thirty-second talk track, for-and-against argument columns for balanced coverage, investigative questions for reporters to pursue, related topics to watch, and types of expert sources to contact.

The story prediction system uses a thirteen-feature online logistic regression model that trains continuously from historical outcomes. Features include velocity trend, source diversity, engagement momentum, category virality factor, early velocity, average source trust, hour of day, day of week, sentiment intensity, entity count, location specificity, cross-platform count, and story age. The model updates its weights via gradient descent every time it processes a story older than six hours, comparing its prediction against the actual outcome. An escalation alert fires when a DEVELOPING or ONGOING story has a viral probability above sixty percent, warning producers that it may upgrade to BREAKING within two hours.

Coverage gap detection — a capability no competitor offers — continuously monitors what competitor stations and newsrooms are publishing by polling their RSS feeds, comparing each item against the station's own story database using Jaccard similarity, and flagging stories that competitors have covered but the station has not. The beat alerts page presents these gaps with red urgency indicators, competitor source attribution, composite scores, and one-click assignment buttons. Active gaps can be pushed to Slack via webhook with formatted messages that include the story title, score, source count, and which competitor covered it.

---

## Competitive Broadcast Monitoring

Beyond coverage gap detection for the station's own output, the competitive broadcast monitoring dashboard provides strategic intelligence: competitor exclusives (stories they have that the station does not), the station's own exclusives, shared coverage with overlap analysis, per-competitor activity statistics, and a beat score representing the percentage of shared stories where the station published first. A timeline view shows hourly publishing activity comparing the station against each competitor.

---

## Data Architecture and Sources

The platform ingests from a pre-configured library of over two hundred sources organized across fifteen categories: Houston television stations (KHOU, KPRC, KTRK, KRIV, KIAH plus breaking news feeds), Dallas-Fort Worth and San Antonio and Austin television stations, Houston and Texas newspapers and digital outlets, City of Houston and Harris County government feeds, Texas state government, school districts, police departments, fire and emergency services, National Weather Service zones, traffic and transportation (Houston TranStar, TxDOT, METRO, FAA NOTAMs), courts (CourtListener, Texas Supreme Court, Fifth Circuit), universities (UH, Rice, TSU, Sam Houston, Prairie View, Texas A&M, UT Austin), sports teams (Texans, Astros, Rockets, Dynamo, Dash, Cowboys, Rangers, Mavericks, Spurs), business and energy (Oil & Gas Journal, Rigzone, NASA, Federal Reserve Bank of Dallas), national wire services (AP, Reuters, UPI, NPR, PBS), Spanish-language outlets (Univision Houston, Telemundo Houston, La Voz de Houston, CNN en Español, BBC Mundo, EFE), community and hyperlocal sites (Patch neighborhoods, The Defender, CultureMap, Houston Public Media), health and medical centers (Texas Medical Center, MD Anderson, Baylor, UTHealth), and news aggregators (Bing News, Google News).

The Grok LLM integration adds a unique real-time dimension by querying X/Twitter data every five minutes with Houston-specific prompts that reference local police, fire, traffic, weather, and news accounts. Stories surfaced this way often appear minutes before any RSS feed picks them up, providing a detection speed advantage comparable to Dataminr's one-million-source monitoring network.

SimilarWeb integration automatically scores domain trust by converting global rank to a zero-to-one trust score, updating the DomainScore records that feed into the confidence scoring algorithm.

---

## Enterprise Features

The multi-tenant architecture isolates each newsroom's data, sources, and configurations behind account boundaries. A superadmin dashboard provides cross-tenant management: creating accounts, inviting users, assigning roles, and configuring a twenty-two-module permission grid with granular create-read-update-delete controls per role. Permissions cascade — an admin can only grant permissions they themselves hold, and role display names are configurable per tenant (so "EDITOR" can be relabeled "Assignment Editor" or "Digital Producer" to match the newsroom's org chart). Every permission change, role assignment, and user action is recorded in a comprehensive audit log.

Authentication supports JWT tokens with twenty-four-hour expiry, multi-account switching (users can belong to multiple newsroom accounts), API key authentication for third-party integrations, and SAML 2.0 single sign-on for enterprise newsrooms using identity providers like Okta or Azure AD.

The platform supports four interface languages — English, Spanish, Vietnamese, and Mandarin Chinese — reflecting the linguistic demographics of the Houston market where forty-five percent of residents speak Spanish at home.

---

## How We Compare

The newsroom intelligence market is fragmented. Each incumbent excels at one narrow function but leaves the rest of the workflow uncovered. Dataminr, priced at over one hundred thousand dollars per year, is the gold standard for real-time event detection, processing a million sources with fifty large language models and multi-modal AI analysis of text, images, video, and audio. But it provides zero editorial workflow tools — no assignment desk, no show prep, no content generation, no coverage gap detection. It is an alerting service, not a production platform.

NewsWhip Spike, at thirty to eighty thousand dollars per year, leads the market in predictive analytics with engagement prediction in as little as sixty seconds across Facebook, X, Reddit, YouTube, and TikTok. Its AI agents explain why stories matter and predict which articles will go viral. But it targets PR firms and digital publishers, not broadcast newsrooms, and offers no show preparation, rundown management, or broadcast-specific output formats.

TopicPulse, built by Futuri Media over fifteen years, is the closest competitor in targeting broadcast specifically. It offers RadioGPT for AI-generated radio content, ShowPrep for topic lists, video automation through Wibbitz and Vimeo integrations, and a mature production-hardened platform running at multiple stations. Its infrastructure — MySQL with read replicas, Elasticsearch with a three-node cluster, Memcached, Redis, MongoDB, and Pinecone for vector search — reflects years of scaling. However, its PHP monolith architecture constrains development velocity, its two-hour breaking detection window is four times slower than ours, and it lacks coverage gap detection, assignment desk management, reporter performance tracking, A-block lineup recommendation, deadline countdown tracking, headline A/B testing, story prediction, collaborative editing, fact checking, and multi-language support.

TVEyes dominates broadcast transcript monitoring with speech-to-text across three thousand channels in twenty-seven countries and forty-one languages, recognized by the U.S. Department of Defense for accuracy. At twenty-four hundred to seventy-two hundred dollars per year, it is affordable but narrowly focused — it monitors what has already aired, not what is about to break.

Chartbeat, at roughly thirteen thousand dollars per year, provides the best real-time audience analytics in the market: concurrent reader counts, scroll depth tracking, time-on-page measurement, headline A/B testing, and subscriber conversion analysis. But it is purely an analytics tool with no news intelligence, content generation, or editorial workflow capabilities.

Meltwater and CisionOne serve enterprise PR and communications teams with comprehensive media monitoring across news, social, print, television, and radio in over two hundred languages. Their pricing ranges from forty thousand to over one hundred thousand dollars per year. They are overkill for a newsroom that needs breaking news intelligence rather than brand reputation management.

Breaking News Intelligence is the only platform that scores above seven out of ten across every functional category in the competitive grid — from detection speed to editorial workflow to AI content generation to analytics to enterprise infrastructure. The closest competitor, Dataminr, averages five point three by excelling at detection but scoring zero in every workflow category. A newsroom using Breaking News Intelligence replaces subscriptions to three to five separate tools while gaining capabilities — coverage gap detection, A-block lineup recommendation, reporter performance tracking, deadline management, compound story splitting, AI story research with talk tracks — that no competitor offers at any price.

The platform's remaining gaps are operational rather than functional: native mobile applications for field reporters, live over-the-air broadcast transcript monitoring (TVEyes territory), and production deployment across multiple stations to build a track record of reliability. These represent the difference between an eight-point-five and a ten on the perfection scale, and they are on the roadmap.

For a broadcast newsroom evaluating its technology stack, the question is not whether Breaking News Intelligence covers more ground than the alternatives — the competitive analysis makes that clear. The question is whether a newer platform can deliver the reliability that a twenty-four-seven news operation demands. The architecture is sound: PostgreSQL with pgvector for the data layer, Redis with BullMQ for the job pipeline, a four-provider LLM fallback chain for AI resilience, and a thirty-five-worker concurrent processing system with graceful shutdown and automatic retry. The foundation is built for the production demands of live television news.
