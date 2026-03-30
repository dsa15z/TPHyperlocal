# TopicPulse Feature Inventory

## Core Infrastructure & Platforms

### 1. PulseOS Authentication & Authorization System
**What it does:** Modern JWT-based authentication system with dual-table architecture, supporting registration, login, and token refresh. Maintains backward compatibility with legacy user table.
**Key Files:** 
- `/modules/Core/PulseOS/Auth/Services/AuthService.php`
- `/modules/Core/PulseOS/Auth/DataAccess/PulseOSUser.php`
- `/modules/MasterApi/Services/JWTService.php`
- `/modules/MasterApi/Middleware/RequireJWT.php`
**TPHyperlocal Equivalent:** Partial - has basic auth, but not JWT-based

### 2. MasterApi Framework
**What it does:** Multi-version REST API architecture (v1-v5) with modular controllers, middleware, and routes. Supports PublicApi, ClientApi, PartnerApi, PortalApi, PulseApi, ServiceApi, and WidgetApi.
**Key Files:**
- `/modules/MasterApi/PublicApi/Controllers/V1/` (HealthController, AuthController, BookmarksController, AnalyticsController, ContentController, UserController, UserSettingsController, NotificationsController, DevicesController, FirstDraftController, GroupController, CommunityRadarController, SmartPulsesController)
- `/modules/MasterApi/ClientApi/Controllers/` (CommRadarController, NewsFeedController, StocksController, Pulses, PrepOS, Format)
- `/modules/MasterApi/Middleware/` (RequireJWT, RequireApiKey, RequireGroupId, RateLimit, CORS, OutputFormatter, TPExceptionHandler)
**TPHyperlocal Equivalent:** No - none of this architecture exists

### 3. Eloquent ORM with Dual Database Layer
**What it does:** Illuminate/Laravel Eloquent-based ORM with read/write separation, caching layers (Redis/Memcached), OpenSearch/Elasticsearch integration, and MongoDB support.
**Key Files:** `/modules/Core/Models/` (contains 40+ Eloquent models)
**TPHyperlocal Equivalent:** No

### 4. Redis Cache Layer
**What it does:** Comprehensive caching system using Redis with configurable TTLs, cache invalidation, and storage strategies.
**Key Files:** `/modules/Core/RedisCache/RedisCache.php`
**TPHyperlocal Equivalent:** No

### 5. Feature Flags System
**What it does:** Per-group and per-user feature flag management for A/B testing and feature rollout control.
**Key Files:** 
- `/modules/Core/FeatureFlags/API/SharedAPI.php`
- `/modules/Core/FeatureFlags/API/AdminAPI.php`
**TPHyperlocal Equivalent:** No

---

## Content & News Features

### 6. TopicOS - Topic Management System
**What it does:** Manages topics, stories, bookmarks, and content sources with advanced filtering, sorting, and analytics.
**Key Files:**
- `/modules/Core/TopicOS/Services/TopicService.php`
- `/modules/Core/Topics/API/SharedAPI.php`
**TPHyperlocal Equivalent:** Partial - has basic story/topic management

### 7. Story Intelligence & Analytics
**What it does:** Tracks story statistics, priority calculation, engagement metrics, and trending analysis.
**Key Files:**
- `/cron/calculate_story_priority.php`
- `/modules/Core/Analytics/Analytics.php`
- `/modules/MasterApi/PublicApi/Controllers/V1/AnalyticsController.php`
**TPHyperlocal Equivalent:** Partial - has basic story stats

### 8. Content Distribution System
**What it does:** Manages content delivery across multiple formats and channels with scheduling and optimization.
**Key Files:**
- `/modules/Core/ContentOS/` 
- `/modules/MasterApi/PublicApi/Controllers/V1/ContentController.php`
**TPHyperlocal Equivalent:** No

### 9. First Draft - AI Content Summarization
**What it does:** Generates multiple types of summaries and rewrites using AI (OpenAI GPT-4o), including summaries, short summaries, tweets, bullets, and idea starters.
**Key Files:**
- `/modules/FirstDraft/FirstDraft.php`
- `/modules/MasterApi/PublicApi/Controllers/V1/FirstDraftController.php`
- `/modules/Core/LLM/` (OpenAI & Gemini integrations)
**TPHyperlocal Equivalent:** No

### 10. MyVoice - Custom Voice Management
**What it does:** Allows broadcasters to create custom "voices" (writing styles) with system prompts, interests, and sample profiles for content personalization.
**Key Files:**
- `/modules/MyVoice/MyVoice.php`
- Database: `first_draft_voices` table
**TPHyperlocal Equivalent:** No

---

## AI & Content Generation

### 11. ChatGPT/OpenAI Integration
**What it does:** Direct integration with OpenAI API (GPT-4o) for AI-powered content generation and analysis.
**Key Files:** `/modules/ChatGPT/OpenAIClient.php`
**TPHyperlocal Equivalent:** No

### 12. LLM Factory (Multi-LLM Support)
**What it does:** Abstraction layer supporting multiple LLMs (OpenAI, Google Gemini) with factory pattern for easy switching.
**Key Files:**
- `/modules/LLM/Factory.php`
- `/modules/LLM/OpenAI.php`
- `/modules/LLM/Gemini.php`
**TPHyperlocal Equivalent:** No

### 13. RadioGPT - Radio Show Content Assistant
**What it does:** AI-powered assistant that pulls news from topics/presets and prepares content for radio broadcasts with local integration.
**Key Files:**
- `/modules/RadioGPT/RadioGPT.php`
- `/modules/RadioGPT/API/SharedAPI.php`
- `/modules/RadioGPT/API/AdminAPI.php`
**TPHyperlocal Equivalent:** No

### 14. IdeaStarters - Content Idea Generation
**What it does:** Generates content ideas, suggestion streams, and push notification campaigns with format support (email, app, web).
**Key Files:**
- `/modules/IdeaStarters/IdeaStarters.php`
- `/modules/IdeaStarters/API/SharedAPI.php`
- `/modules/IdeaStarters/API/AdminAPI.php`
- `/modules/IdeaStarters/ConstantContact/` (Email marketing integration)
**TPHyperlocal Equivalent:** No

### 15. ConversationStarters - Discussion Topics
**What it does:** Generates conversation-starting topics for on-air use with content streams, caching, and publish management.
**Key Files:**
- `/modules/ConversationStarters/ConversationStarters.php`
- `/modules/ConversationStarters/API/SharedAPI.php`
- `/modules/ConversationStarters/API/AdminAPI.php`
**TPHyperlocal Equivalent:** No

### 16. UniversalPromptManager - Dynamic Prompts
**What it does:** Manages AI prompts at scale with versioning, per-group customization, and format-specific prompts.
**Key Files:**
- `/modules/Core/UniversalPromptManager/`
- `/migrations/2025100601_create_universal_prompt_tables.sql`
- `/migrations/2025100602_seed_universal_prompts.sql`
**TPHyperlocal Equivalent:** No

---

## Social & Community Features

### 17. CommunityRadarII - Social Media Monitoring
**What it does:** Scrapes and monitors social media platforms (Facebook, Twitter, etc.) for brand mentions, community sentiment, and engagement trends.
**Key Files:**
- `/modules/CommunityRadarII/CommunityRadar.php`
- `/modules/CommunityRadarII/Readers/FBGroupReader.php`
- `/modules/CommunityRadarII/Readers/FBPageReader.php`
- `/modules/CommunityRadarII/Scrapers/` (ScrapFly, ScrapingFish, Futuri)
- `/modules/MasterApi/PublicApi/Controllers/V1/CommunityRadarController.php`
**TPHyperlocal Equivalent:** Partial - has social monitoring but not as comprehensive

### 18. Facebook Groups Integration
**What it does:** Deep integration with Facebook Groups API including member data, group summaries, post analysis, and JWT token generation for FB data.
**Key Files:**
- `/modules/FacebookGroups/FacebookGroups.php`
- `/modules/FacebookGroups/API/PublicAPI.php`
- `/modules/FacebookGroups/API/AdminAPI.php`
- Database models: `FacebookGroup`, `FacebookGroupPost`, `FacebookGroupSummary`, `FacebookUsers`
**TPHyperlocal Equivalent:** No

---

## Video & Multimedia

### 19. InstantVideo - Video Rebranding & Management
**What it does:** Manages video content with Vimeo integration, video rebranding, multi-station support, OAuth, SAML SSO, and batch download processing.
**Key Files:**
- `/modules/InstantVideo/InstantVideo.php`
- `/modules/InstantVideo/Vimeo/VimeoAPI.php`
- `/modules/InstantVideo/Vimeo/SSO.php`
- `/modules/InstantVideo/WibbitzAPI.php`
- `/modules/InstantVideo/MultiStation.php`
- Models: `IvPublisherVideos`, `IvRebrandedVideos`, `IvRebrandJobs`, `IvVimeoSetting`
**TPHyperlocal Equivalent:** No

### 20. Wibbitz Video API Integration
**What it does:** Integration with Wibbitz for automated video creation and publishing.
**Key Files:** `/modules/InstantVideo/WibbitzAPI.php`
**TPHyperlocal Equivalent:** No

---

## Notifications & Engagement

### 21. Firebase Cloud Messaging Integration
**What it does:** Push notification system using Firebase for web and mobile app notifications with device management.
**Key Files:**
- `/modules/Core/Firebase/`
- `/modules/MasterApi/PublicApi/Controllers/V1/NotificationsController.php`
- `/modules/MasterApi/PublicApi/Controllers/V1/DevicesController.php`
**TPHyperlocal Equivalent:** No

### 22. Breaking News Processor
**What it does:** Real-time breaking news detection and distribution through Node.js worker with Redis queue management.
**Key Files:**
- `/workers/breaking-news/breaking-news-processor/processor.js`
- `/scripts/breaking_news_processor.php`
- `/cron/send_breaking_notifications.php`
**TPHyperlocal Equivalent:** No

### 23. Email Distribution System
**What it does:** Comprehensive email campaign management with top stories delivery, format-specific emails, and engagement tracking.
**Key Files:**
- `/cron/send_top_stories_to_email.php`
- `/cron/send_top_stories_to_email.tpl`
- `/cron/gather_email_stats.php`
- `/modules/IdeaStarters/ConstantContact/` (Constant Contact email marketing)
**TPHyperlocal Equivalent:** Partial - has email delivery but not as sophisticated

### 24. Slack Integration
**What it does:** Sends news and updates to Slack channels with configurable pulses and content filtering.
**Key Files:**
- `/modules/Slack/Slack.php`
- `/modules/Slack/API/SharedAPI.php`
- `/modules/Slack/API/AdminAPI.php`
- `/cron/send_top_stories_to_slack.php`
- Model: `SlackIntegration`, `SlackIntegrationsPulse`
**TPHyperlocal Equivalent:** Partial - basic Slack notifications exist

---

## Broadcast & Media

### 25. ShowPrep - Show Preparation Tools
**What it does:** Topic lists and show preparation materials with API access for on-air use.
**Key Files:**
- `/modules/ShowPrep/TopicLists.php`
- `/modules/ShowPrep/TopicLists/API.php`
- `/modules/ShowPrep/TopicLists/AdminAPI.php`
**TPHyperlocal Equivalent:** No

### 26. Stocks Integration
**What it does:** Stock market data, ticker tracking, industry association, and story correlation.
**Key Files:**
- `/modules/Stocks/Stocks.php`
- `/modules/Stocks/API/PublicAPI.php`
- `/modules/Stocks/API/SharedAPI.php`
- Database: `stocks`, `story_stocks`, `industries`, `story_industries`
**TPHyperlocal Equivalent:** No

### 27. Geolocation Services
**What it does:** Geo-coordinate calculations, bounding box calculations for location-based filtering, city/state coordinates.
**Key Files:**
- `/modules/Geolocation/Geolocation.php`
- Database: `us_city_coordinates`
**TPHyperlocal Equivalent:** Partial - has basic location support

---

## Widgets & Embeds

### 28. Web Widgets
**What it does:** Embeddable web widgets for publishing stories on external sites with theming, generative content options, and multiple source types (Pulse, Smart Pulse, RSS).
**Key Files:**
- `/modules/Widgets/Main.php`
- `/modules/Widgets/Base.php`
- `/modules/Widgets/TypeFactory.php`
- `/modules/Widgets/API/PublicAPI.php`
- `/modules/Widgets/API/AdminAPI.php`
- `/modules/Widgets/Caching/API/SharedApi.php`
- Database: `widgets`
**TPHyperlocal Equivalent:** No

### 29. Vector Pulses
**What it does:** Advanced pulse types using vector/semantic search for more sophisticated content matching.
**Key Files:**
- `/modules/Core/VectorPulses/API/PublicAPI.php`
- Model: `UserVectorPulse`
**TPHyperlocal Equivalent:** No

---

## Administration & Management

### 30. Admin Panel - React-Based
**What it does:** Modern React-based administration interface for managing all TopicPulse features.
**Key Components:**
- `/admin/www/static/js_src/src/components/Admin/` - Main admin interface
- `/admin/www/static/js_src/src/components/IdeaStarters/` - Idea starters management
- `/admin/www/static/js_src/src/components/ConversationStarters/` - Conversation starters management
- `/admin/www/static/js_src/src/components/Slack/` - Slack integration management
- `/admin/www/static/js_src/src/components/Configs/` - Configuration management
- `/admin/www/static/js_src/src/components/ReleaseManager/` - Release management
- `/admin/www/static/js_src/src/components/PartnerAPI/` - Partner API management
- `/admin/www/static/js_src/src/components/Widget/` - Widget management
- `/admin/www/static/js_src/src/components/TopTopicsEmail/` - Email campaign management
**TPHyperlocal Equivalent:** No - completely new architecture

### 31. Release Manager
**What it does:** Version control and deployment management for content and configuration releases.
**Key Files:**
- `/modules/Core/ReleaseManager/` 
- `/modules/Core/ReleaseManager/API/PublicAPI.php`
- `/modules/Core/ReleaseManager/API/AdminAPI.php`
- Model: `Release`
**TPHyperlocal Equivalent:** No

### 32. Partner API Management
**What it does:** Manages API keys and access for partner integrations with documentation and Swagger specs.
**Key Files:**
- `/partner-api/`
- `/modules/Core/PartnerAPI/`
- `/modules/MasterApi/PartnerApi/`
- Swagger: `/partner-api/topicpulse-api-swagger.json`
**TPHyperlocal Equivalent:** No

### 33. Group Management System
**What it does:** Multi-group/multi-client support with group properties, ownership, parent groups, and group-specific customization.
**Key Files:**
- `/modules/Core/Group/API/PropertiesAPI.php`
- `/modules/Core/Group/API/SharedAPI.php`
- `/modules/Core/GroupParent/`
- `/modules/MasterApi/PublicApi/Controllers/V1/GroupController.php`
- Model: `Group`, `GroupParent`
**TPHyperlocal Equivalent:** Partial - basic multi-group support

### 34. Presets/Shortcuts
**What it does:** Saved searches and topic collections for quick access to curated content.
**Key Files:**
- `/modules/Core/Presets/API/SharedAPI.php`
- Database: `presets` table
**TPHyperlocal Equivalent:** Partial - basic saved searches exist

---

## Data Integration & ETL

### 35. Web Scraper
**What it does:** HTTP scraper for fetching and cleaning web content with user-agent rotation and error handling.
**Key Files:** `/modules/Scraper/Scraper.php`
**TPHyperlocal Equivalent:** Partial - basic scraping exists

### 36. NetSuite Integration
**What it does:** OAuth 1.0a authenticated integration with NetSuite ERP for syncing customer and market data.
**Key Files:**
- `/modules/NetSuite/Main.php`
- `/cron/netsuite_api/` 
**TPHyperlocal Equivalent:** No

### 37. FreshDesk Integration
**What it does:** Support ticket management and restore value tracking for FreshDesk-based support systems.
**Key Files:**
- `/modules/FreshDesk/FreshDesk.php`
- User property: `freshDeskRestoreId`
**TPHyperlocal Equivalent:** No

### 38. Reporting System
**What it does:** Analytics and reporting with scheduled email reports, metrics collection, and data export.
**Key Files:**
- `/modules/Reporting/`
- `/modules/IdeaStarters/Reporting/`
- `/modules/InstantVideo/Reporting/`
- `/cron/new_combined_stats.php`
- `/cron/alltime_stats.php`
- `/cron/top_20_report.php`
**TPHyperlocal Equivalent:** Partial - has basic reporting

### 39. Monitoring & Health Checks
**What it does:** System monitoring, error tracking, and API health status checks.
**Key Files:**
- `/cron/monitoring/`
- `/modules/MasterApi/PublicApi/Controllers/V1/HealthController.php`
**TPHyperlocal Equivalent:** Partial

---

## Database & Content Management

### 40. PrepOS - Broadcast Show Preparation
**What it does:** Manages show prep content with formats, enrichment data, moderation, and historical context.
**Key Files:**
- `/modules/Core/PrepOS/`
- Database: `prepos_show_prep_stories`, `prepos_story_enrichment`, `prepos_formats`, `prepos_holidays`
**TPHyperlocal Equivalent:** Partial - has show prep but not as comprehensive

### 41. History of the Day
**What it does:** Manages historical events and "on this day" content with format relevance and data quality tracking.
**Key Files:**
- `/modules/Core/HistoryOfTheDay/`
- Database: `prepos_history_data_raw`, `prepos_holiday_format_relevance`, `prepos_data_quality_logs`
**TPHyperlocal Equivalent:** No

### 42. Domain Popularity & Scoring
**What it does:** Tracks domain authority, popularity metrics, and story priority scoring.
**Key Files:**
- `/cron/calculate_domain_popularity.php`
- `/modules/Core/Models/PredictionDomainScore.php`
**TPHyperlocal Equivalent:** Partial

### 43. Feed Management System
**What it does:** RSS feed management, scraping, failure detection, and reliability tracking.
**Key Files:**
- `/modules/Core/Feed/`
- `/modules/Core/FeedOS/`
- `/workers/feed_scraper/`
- `/cron/scrape_feeds/`
- `/cron/feed_failure/`
**TPHyperlocal Equivalent:** Partial - has feed parsing

### 44. Twitter Integration
**What it does:** Twitter data ingestion, sentiment analysis, and trend tracking.
**Key Files:**
- `/modules/Core/Twitter/`
- `/workers/twitter/`
**TPHyperlocal Equivalent:** Partial

### 45. Market & Station Groupings
**What it does:** Market-based organization, station relationships, and network grouping.
**Key Files:**
- `/modules/Core/MarketGroupings/`
- Database: `station_market_parent`, `us_city_coordinates`
**TPHyperlocal Equivalent:** Partial

---

## Advanced Features

### 46. Smart Pulses
**What it does:** AI-powered dynamic topic selection based on engagement patterns and user preferences.
**Key Files:**
- `/modules/MasterApi/PublicApi/Controllers/V1/SmartPulsesController.php`
**TPHyperlocal Equivalent:** No

### 47. Categories & Taxonomies
**What it does:** Content categorization system with taxonomy management.
**Key Files:**
- `/modules/Core/Categories/`
**TPHyperlocal Equivalent:** Partial

### 48. Demographics
**What it does:** Audience demographic tracking and analysis.
**Key Files:**
- `/modules/Core/Demographics/`
**TPHyperlocal Equivalent:** Partial

### 49. HotZips - Hyper-Local Data
**What it does:** ZIP code-based content filtering and hyper-local market analysis.
**Key Files:**
- `/modules/Core/HotZips/`
**TPHyperlocal Equivalent:** Yes - this is a core feature

### 50. Image Management
**What it does:** Image optimization, caching, and CDN integration for content images.
**Key Files:**
- `/modules/Core/Image/`
**TPHyperlocal Equivalent:** Partial

### 51. Bookmarks System
**What it does:** User-level content bookmarking and saved story management.
**Key Files:**
- `/modules/MasterApi/PublicApi/Controllers/V1/BookmarksController.php`
**TPHyperlocal Equivalent:** No

### 52. User Profiles & Settings
**What it does:** User account management, preferences, and customization.
**Key Files:**
- `/modules/Core/User/`
- `/modules/MasterApi/PublicApi/Controllers/V1/UserController.php`
- `/modules/MasterApi/PublicApi/Controllers/V1/UserSettingsController.php`
**TPHyperlocal Equivalent:** Partial

### 53. Single Sign-On (SSO)
**What it does:** Enterprise SSO with SAML support for Vimeo and other integrations.
**Key Files:**
- `/modules/Core/SSO/`
- `/modules/InstantVideo/Vimeo/SSO.php`
- `/modules/InstantVideo/Vimeo/SAMLSettings.php`
- Library: `simplesamlphp/simplesamlphp` (composer)
**TPHyperlocal Equivalent:** No

### 54. Time Zones
**What it does:** Multi-timezone support for global operations.
**Key Files:**
- `/modules/Core/TimeZones/`
**TPHyperlocal Equivalent:** Partial

### 55. Logging & Auditing
**What it does:** Comprehensive logging system for debugging, auditing, and monitoring.
**Key Files:**
- `/modules/Core/Logging/`
**TPHyperlocal Equivalent:** Partial

---

## Data Storage & Search

### 56. Elasticsearch/OpenSearch Integration
**What it does:** Full-text search and advanced querying capabilities for story content.
**Key Files:**
- `/cron/update_es_indexes.php`
- `/modules/Core/Models/ArticleOpenSearchData.php`
**TPHyperlocal Equivalent:** No

### 57. MongoDB Integration
**What it does:** NoSQL storage for social media and unstructured data.
**Key Files:** Composer dependency `mongoose`
**TPHyperlocal Equivalent:** No

### 58. Dual Database Architecture
**What it does:** Read/write database separation for scalability with failover support.
**Key Infrastructure:** Read replicas configured in config
**TPHyperlocal Equivalent:** No

---

## Background Jobs & Cron

### 59. Cron Job System
**What it does:** Scheduled jobs for:
- Email distribution (top stories, format emails)
- Analytics calculation (story priority, domain popularity, metrics)
- Feed scraping and management
- Data cleanup and optimization
- Report generation
- Cache refresh
- Social media monitoring
**Key Files:** `/cron/` directory (25+ job files)
**TPHyperlocal Equivalent:** Partial - has some scheduled tasks

### 60. Redis Queue Workers
**What it does:** Background job processing using Redis queues for async operations.
**Key Workers:** `/workers/` directory with dedicated workers for:
- Breaking news processing (Node.js)
- Facebook group scraping
- Feed scraping
- Twitter integration
- News parsing
**TPHyperlocal Equivalent:** No

---

## Content Enrichment

### 61. Content Stream Management
**What it does:** Manages content streams for formats with scheduling and delivery.
**Key Files:**
- `/modules/IdeaStarters/Models/ContentStream.php`
- `/cron/content_stream/`
**TPHyperlocal Equivalent:** No

### 62. Format Management
**What it does:** Multi-format support with format-specific configurations and delivery rules.
**Key Files:**
- `/modules/IdeaStarters/Models/Format.php`
- Database: `formats`, `format_groups`
**TPHyperlocal Equivalent:** Partial

### 63. Glance - Quick Summary Feature
**What it does:** Provides quick story summaries and key points extraction.
**Key Files:**
- `/modules/Core/Glance/`
**TPHyperlocal Equivalent:** No

### 64. Push Notifications
**What it does:** In-app push notification management and scheduling.
**Key Files:**
- `/modules/IdeaStarters/Models/PushNotifications.php`
- `/modules/Core/Notifications/`
**TPHyperlocal Equivalent:** No

---

## Partner & Client APIs

### 65. Client API (Private)
**What it does:** Dedicated API endpoints for internal clients with news feed, pulses, community radar, stocks, and format data.
**Key Files:** `/modules/MasterApi/ClientApi/Controllers/` (CommRadarController, NewsFeedController, StocksController, PrepOS, Pulses)
**TPHyperlocal Equivalent:** No - different architecture

### 66. Portal API
**What it does:** Internal portal endpoints for administrative functions.
**Key Files:** `/modules/MasterApi/PortalApi/`
**TPHyperlocal Equivalent:** No

### 67. Service API
**What it does:** Internal service-to-service communication endpoints.
**Key Files:** `/modules/MasterApi/ServiceApi/`
**TPHyperlocal Equivalent:** No

### 68. Public API v1
**What it does:** Public-facing RESTful API with JWT authentication for external developers.
**Key Files:** `/modules/MasterApi/PublicApi/`
**Endpoints:** Health, Auth, Bookmarks, Analytics, Content, Users, Groups, Notifications, Devices, FirstDraft, CommunityRadar, SmartPulses
**TPHyperlocal Equivalent:** No

### 69. Widget API
**What it does:** Dedicated endpoints for embedded widget functionality.
**Key Files:** `/modules/MasterApi/WidgetApi/`
**TPHyperlocal Equivalent:** No

---

## Summary Statistics

**Total Major Features: 69**

### By Category:
- **Infrastructure & Platforms: 5**
- **Content & News: 4**
- **AI & Content Generation: 6**
- **Social & Community: 2**
- **Video & Multimedia: 2**
- **Notifications & Engagement: 4**
- **Broadcast & Media: 3**
- **Widgets & Embeds: 2**
- **Administration & Management: 4**
- **Data Integration & ETL: 5**
- **Database & Content Management: 6**
- **Advanced Features: 7**
- **Data Storage & Search: 3**
- **Background Jobs & Cron: 2**
- **Content Enrichment: 4**
- **Partner & Client APIs: 5**

### TPHyperlocal Equivalent Summary:
- **No Equivalent: 46 features (67%)**
- **Partial Equivalent: 22 features (32%)**
- **Full Equivalent: 1 feature (1%)**
