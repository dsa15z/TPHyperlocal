-- CreateEnum
CREATE TYPE "Platform" AS ENUM ('FACEBOOK', 'TWITTER', 'RSS', 'NEWSAPI', 'NEWSCATCHER', 'PERIGON', 'GDELT', 'LLM_OPENAI', 'LLM_CLAUDE', 'LLM_GROK', 'LLM_GEMINI', 'MANUAL');

-- CreateEnum
CREATE TYPE "SourceType" AS ENUM ('NEWS_ORG', 'GOV_AGENCY', 'PUBLIC_PAGE', 'RSS_FEED', 'API_PROVIDER', 'LLM_PROVIDER');

-- CreateEnum
CREATE TYPE "StoryStatus" AS ENUM ('EMERGING', 'BREAKING', 'TRENDING', 'ACTIVE', 'STALE', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "UserRole" AS ENUM ('VIEWER', 'EDITOR', 'ADMIN', 'OWNER');

-- CreateTable
CREATE TABLE "Account" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "plan" TEXT NOT NULL DEFAULT 'free',
    "maxMarkets" INTEGER NOT NULL DEFAULT 1,
    "maxSources" INTEGER NOT NULL DEFAULT 20,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Account_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "displayName" TEXT,
    "avatarUrl" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "lastLoginAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AccountUser" (
    "id" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "role" "UserRole" NOT NULL DEFAULT 'VIEWER',
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AccountUser_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "UserPreference" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,
    "defaultMarketId" TEXT,
    "categories" JSONB,
    "minScore" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "keywords" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "UserPreference_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Market" (
    "id" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "state" TEXT,
    "latitude" DOUBLE PRECISION NOT NULL,
    "longitude" DOUBLE PRECISION NOT NULL,
    "radiusKm" DOUBLE PRECISION NOT NULL DEFAULT 80,
    "timezone" TEXT NOT NULL DEFAULT 'America/Chicago',
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "keywords" JSONB,
    "neighborhoods" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Market_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AccountCredential" (
    "id" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,
    "platform" "Platform" NOT NULL,
    "name" TEXT NOT NULL,
    "apiKey" TEXT,
    "apiSecret" TEXT,
    "accessToken" TEXT,
    "extraConfig" JSONB,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "lastUsedAt" TIMESTAMP(3),
    "lastError" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AccountCredential_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AccountSource" (
    "id" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,
    "sourceId" TEXT NOT NULL,
    "isEnabled" BOOLEAN NOT NULL DEFAULT true,
    "pollIntervalMs" INTEGER,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AccountSource_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Source" (
    "id" TEXT NOT NULL,
    "platform" "Platform" NOT NULL,
    "sourceType" "SourceType" NOT NULL,
    "name" TEXT NOT NULL,
    "url" TEXT,
    "platformId" TEXT,
    "trustScore" DOUBLE PRECISION NOT NULL DEFAULT 0.5,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "isGlobal" BOOLEAN NOT NULL DEFAULT false,
    "marketId" TEXT,
    "metadata" JSONB,
    "lastPolledAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Source_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SourcePost" (
    "id" TEXT NOT NULL,
    "sourceId" TEXT NOT NULL,
    "platformPostId" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "contentHash" TEXT NOT NULL,
    "title" TEXT,
    "url" TEXT,
    "authorName" TEXT,
    "authorId" TEXT,
    "engagementLikes" INTEGER NOT NULL DEFAULT 0,
    "engagementShares" INTEGER NOT NULL DEFAULT 0,
    "engagementComments" INTEGER NOT NULL DEFAULT 0,
    "latitude" DOUBLE PRECISION,
    "longitude" DOUBLE PRECISION,
    "locationName" TEXT,
    "category" TEXT,
    "mediaUrls" JSONB,
    "rawData" JSONB,
    "llmModel" TEXT,
    "llmConfidence" DOUBLE PRECISION,
    "fullArticleText" TEXT,
    "fullArticleExtractedAt" TIMESTAMP(3),
    "embeddingJson" JSONB,
    "entities" JSONB,
    "sentimentScore" DOUBLE PRECISION,
    "sentimentLabel" TEXT,
    "minhashSignature" JSONB,
    "publishedAt" TIMESTAMP(3) NOT NULL,
    "collectedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SourcePost_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Story" (
    "id" TEXT NOT NULL,
    "marketId" TEXT,
    "title" TEXT NOT NULL,
    "summary" TEXT,
    "aiSummary" TEXT,
    "aiSummaryModel" TEXT,
    "aiSummaryAt" TIMESTAMP(3),
    "category" TEXT,
    "locationName" TEXT,
    "latitude" DOUBLE PRECISION,
    "longitude" DOUBLE PRECISION,
    "neighborhood" TEXT,
    "geocodedAt" TIMESTAMP(3),
    "breakingScore" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "trendingScore" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "confidenceScore" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "localityScore" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "compositeScore" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "sentimentScore" DOUBLE PRECISION,
    "sentimentLabel" TEXT,
    "credibilityScore" DOUBLE PRECISION,
    "editedTitle" TEXT,
    "editedSummary" TEXT,
    "editedBy" TEXT,
    "editedAt" TIMESTAMP(3),
    "editHistory" JSONB,
    "reviewStatus" TEXT DEFAULT 'UNREVIEWED',
    "topicId" INTEGER,
    "topicLabel" TEXT,
    "embeddingJson" JSONB,
    "status" "StoryStatus" NOT NULL DEFAULT 'EMERGING',
    "sourceCount" INTEGER NOT NULL DEFAULT 0,
    "firstSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastUpdatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "mergedIntoId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Story_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StorySource" (
    "id" TEXT NOT NULL,
    "storyId" TEXT NOT NULL,
    "sourcePostId" TEXT NOT NULL,
    "similarityScore" DOUBLE PRECISION NOT NULL,
    "isPrimary" BOOLEAN NOT NULL DEFAULT false,
    "addedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "StorySource_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ScoreSnapshot" (
    "id" TEXT NOT NULL,
    "storyId" TEXT NOT NULL,
    "breakingScore" DOUBLE PRECISION NOT NULL,
    "trendingScore" DOUBLE PRECISION NOT NULL,
    "confidenceScore" DOUBLE PRECISION NOT NULL,
    "localityScore" DOUBLE PRECISION NOT NULL,
    "compositeScore" DOUBLE PRECISION NOT NULL,
    "snapshotAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ScoreSnapshot_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RSSFeed" (
    "id" TEXT NOT NULL,
    "accountId" TEXT,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "filters" JSONB NOT NULL,
    "isPublic" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RSSFeed_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "APIKey" (
    "id" TEXT NOT NULL,
    "accountId" TEXT,
    "key" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "ownerId" TEXT NOT NULL,
    "permissions" JSONB,
    "rateLimit" INTEGER NOT NULL DEFAULT 100,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "lastUsedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "APIKey_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AuditLog" (
    "id" TEXT NOT NULL,
    "accountId" TEXT,
    "userId" TEXT,
    "action" TEXT NOT NULL,
    "entityType" TEXT NOT NULL,
    "entityId" TEXT NOT NULL,
    "details" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AuditLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Notification" (
    "id" TEXT NOT NULL,
    "storyId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "channel" TEXT NOT NULL,
    "recipient" TEXT NOT NULL,
    "payload" JSONB,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "sentAt" TIMESTAMP(3),
    "error" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Notification_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WebhookSubscription" (
    "id" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "secret" TEXT,
    "events" JSONB NOT NULL,
    "filters" JSONB,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "lastDeliveredAt" TIMESTAMP(3),
    "failCount" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "WebhookSubscription_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DigestSubscription" (
    "id" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "frequency" TEXT NOT NULL,
    "schedule" TEXT,
    "timezone" TEXT NOT NULL DEFAULT 'America/Chicago',
    "filters" JSONB,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "lastSentAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DigestSubscription_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SourceCredibilityLog" (
    "id" TEXT NOT NULL,
    "sourceId" TEXT NOT NULL,
    "storyId" TEXT NOT NULL,
    "wasCorroborated" BOOLEAN NOT NULL,
    "corroboratedBy" INTEGER NOT NULL DEFAULT 0,
    "timeToCorroboration" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SourceCredibilityLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TopicCluster" (
    "id" INTEGER NOT NULL,
    "label" TEXT NOT NULL,
    "keywords" JSONB NOT NULL,
    "storyCount" INTEGER NOT NULL DEFAULT 0,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "firstSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TopicCluster_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Account_slug_key" ON "Account"("slug");

-- CreateIndex
CREATE INDEX "Account_slug_idx" ON "Account"("slug");

-- CreateIndex
CREATE INDEX "Account_isActive_idx" ON "Account"("isActive");

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE INDEX "User_email_idx" ON "User"("email");

-- CreateIndex
CREATE INDEX "AccountUser_accountId_idx" ON "AccountUser"("accountId");

-- CreateIndex
CREATE INDEX "AccountUser_userId_idx" ON "AccountUser"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "AccountUser_accountId_userId_key" ON "AccountUser"("accountId", "userId");

-- CreateIndex
CREATE INDEX "UserPreference_accountId_idx" ON "UserPreference"("accountId");

-- CreateIndex
CREATE UNIQUE INDEX "UserPreference_userId_accountId_key" ON "UserPreference"("userId", "accountId");

-- CreateIndex
CREATE INDEX "Market_accountId_isActive_idx" ON "Market"("accountId", "isActive");

-- CreateIndex
CREATE UNIQUE INDEX "Market_accountId_slug_key" ON "Market"("accountId", "slug");

-- CreateIndex
CREATE INDEX "AccountCredential_accountId_platform_idx" ON "AccountCredential"("accountId", "platform");

-- CreateIndex
CREATE UNIQUE INDEX "AccountCredential_accountId_platform_name_key" ON "AccountCredential"("accountId", "platform", "name");

-- CreateIndex
CREATE INDEX "AccountSource_accountId_isEnabled_idx" ON "AccountSource"("accountId", "isEnabled");

-- CreateIndex
CREATE UNIQUE INDEX "AccountSource_accountId_sourceId_key" ON "AccountSource"("accountId", "sourceId");

-- CreateIndex
CREATE INDEX "Source_platform_isActive_idx" ON "Source"("platform", "isActive");

-- CreateIndex
CREATE INDEX "Source_sourceType_idx" ON "Source"("sourceType");

-- CreateIndex
CREATE INDEX "Source_marketId_idx" ON "Source"("marketId");

-- CreateIndex
CREATE INDEX "Source_isGlobal_idx" ON "Source"("isGlobal");

-- CreateIndex
CREATE UNIQUE INDEX "SourcePost_platformPostId_key" ON "SourcePost"("platformPostId");

-- CreateIndex
CREATE INDEX "SourcePost_platformPostId_idx" ON "SourcePost"("platformPostId");

-- CreateIndex
CREATE INDEX "SourcePost_contentHash_idx" ON "SourcePost"("contentHash");

-- CreateIndex
CREATE INDEX "SourcePost_sourceId_publishedAt_idx" ON "SourcePost"("sourceId", "publishedAt");

-- CreateIndex
CREATE INDEX "SourcePost_category_idx" ON "SourcePost"("category");

-- CreateIndex
CREATE INDEX "SourcePost_publishedAt_idx" ON "SourcePost"("publishedAt");

-- CreateIndex
CREATE INDEX "SourcePost_sentimentLabel_idx" ON "SourcePost"("sentimentLabel");

-- CreateIndex
CREATE INDEX "Story_marketId_idx" ON "Story"("marketId");

-- CreateIndex
CREATE INDEX "Story_compositeScore_idx" ON "Story"("compositeScore" DESC);

-- CreateIndex
CREATE INDEX "Story_status_idx" ON "Story"("status");

-- CreateIndex
CREATE INDEX "Story_firstSeenAt_idx" ON "Story"("firstSeenAt" DESC);

-- CreateIndex
CREATE INDEX "Story_breakingScore_idx" ON "Story"("breakingScore" DESC);

-- CreateIndex
CREATE INDEX "Story_trendingScore_idx" ON "Story"("trendingScore" DESC);

-- CreateIndex
CREATE INDEX "Story_category_idx" ON "Story"("category");

-- CreateIndex
CREATE INDEX "Story_status_compositeScore_idx" ON "Story"("status", "compositeScore" DESC);

-- CreateIndex
CREATE INDEX "Story_marketId_status_compositeScore_idx" ON "Story"("marketId", "status", "compositeScore" DESC);

-- CreateIndex
CREATE INDEX "StorySource_storyId_idx" ON "StorySource"("storyId");

-- CreateIndex
CREATE INDEX "StorySource_sourcePostId_idx" ON "StorySource"("sourcePostId");

-- CreateIndex
CREATE UNIQUE INDEX "StorySource_storyId_sourcePostId_key" ON "StorySource"("storyId", "sourcePostId");

-- CreateIndex
CREATE INDEX "ScoreSnapshot_storyId_snapshotAt_idx" ON "ScoreSnapshot"("storyId", "snapshotAt" DESC);

-- CreateIndex
CREATE UNIQUE INDEX "RSSFeed_slug_key" ON "RSSFeed"("slug");

-- CreateIndex
CREATE INDEX "RSSFeed_accountId_idx" ON "RSSFeed"("accountId");

-- CreateIndex
CREATE UNIQUE INDEX "APIKey_key_key" ON "APIKey"("key");

-- CreateIndex
CREATE INDEX "APIKey_key_idx" ON "APIKey"("key");

-- CreateIndex
CREATE INDEX "APIKey_accountId_idx" ON "APIKey"("accountId");

-- CreateIndex
CREATE INDEX "AuditLog_accountId_idx" ON "AuditLog"("accountId");

-- CreateIndex
CREATE INDEX "AuditLog_entityType_entityId_idx" ON "AuditLog"("entityType", "entityId");

-- CreateIndex
CREATE INDEX "AuditLog_userId_idx" ON "AuditLog"("userId");

-- CreateIndex
CREATE INDEX "AuditLog_createdAt_idx" ON "AuditLog"("createdAt" DESC);

-- CreateIndex
CREATE INDEX "Notification_storyId_idx" ON "Notification"("storyId");

-- CreateIndex
CREATE INDEX "Notification_status_idx" ON "Notification"("status");

-- CreateIndex
CREATE INDEX "Notification_createdAt_idx" ON "Notification"("createdAt" DESC);

-- CreateIndex
CREATE INDEX "WebhookSubscription_accountId_isActive_idx" ON "WebhookSubscription"("accountId", "isActive");

-- CreateIndex
CREATE INDEX "DigestSubscription_accountId_idx" ON "DigestSubscription"("accountId");

-- CreateIndex
CREATE INDEX "DigestSubscription_userId_idx" ON "DigestSubscription"("userId");

-- CreateIndex
CREATE INDEX "DigestSubscription_frequency_isActive_idx" ON "DigestSubscription"("frequency", "isActive");

-- CreateIndex
CREATE INDEX "SourceCredibilityLog_sourceId_idx" ON "SourceCredibilityLog"("sourceId");

-- CreateIndex
CREATE INDEX "SourceCredibilityLog_createdAt_idx" ON "SourceCredibilityLog"("createdAt" DESC);

-- CreateIndex
CREATE INDEX "TopicCluster_isActive_storyCount_idx" ON "TopicCluster"("isActive", "storyCount" DESC);

-- AddForeignKey
ALTER TABLE "AccountUser" ADD CONSTRAINT "AccountUser_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "Account"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AccountUser" ADD CONSTRAINT "AccountUser_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserPreference" ADD CONSTRAINT "UserPreference_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Market" ADD CONSTRAINT "Market_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "Account"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AccountCredential" ADD CONSTRAINT "AccountCredential_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "Account"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AccountSource" ADD CONSTRAINT "AccountSource_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "Account"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AccountSource" ADD CONSTRAINT "AccountSource_sourceId_fkey" FOREIGN KEY ("sourceId") REFERENCES "Source"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Source" ADD CONSTRAINT "Source_marketId_fkey" FOREIGN KEY ("marketId") REFERENCES "Market"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SourcePost" ADD CONSTRAINT "SourcePost_sourceId_fkey" FOREIGN KEY ("sourceId") REFERENCES "Source"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Story" ADD CONSTRAINT "Story_marketId_fkey" FOREIGN KEY ("marketId") REFERENCES "Market"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Story" ADD CONSTRAINT "Story_mergedIntoId_fkey" FOREIGN KEY ("mergedIntoId") REFERENCES "Story"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StorySource" ADD CONSTRAINT "StorySource_storyId_fkey" FOREIGN KEY ("storyId") REFERENCES "Story"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StorySource" ADD CONSTRAINT "StorySource_sourcePostId_fkey" FOREIGN KEY ("sourcePostId") REFERENCES "SourcePost"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ScoreSnapshot" ADD CONSTRAINT "ScoreSnapshot_storyId_fkey" FOREIGN KEY ("storyId") REFERENCES "Story"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RSSFeed" ADD CONSTRAINT "RSSFeed_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "Account"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "APIKey" ADD CONSTRAINT "APIKey_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "Account"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuditLog" ADD CONSTRAINT "AuditLog_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "Account"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuditLog" ADD CONSTRAINT "AuditLog_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Notification" ADD CONSTRAINT "Notification_storyId_fkey" FOREIGN KEY ("storyId") REFERENCES "Story"("id") ON DELETE CASCADE ON UPDATE CASCADE;
