# ---- Build Stage ----
FROM node:20-alpine AS builder

WORKDIR /app

# Copy package files
COPY package.json package-lock.json* ./

# Install all dependencies (including devDependencies for build)
RUN npm install

# Copy prisma schema and generate client
COPY prisma ./prisma
RUN npx prisma generate

# Copy source code
COPY tsconfig.json ./
COPY src ./src

# Build TypeScript
RUN npx tsc

# ---- Production Stage ----
FROM node:20-slim AS production

WORKDIR /app

# Install OpenSSL for Prisma + PostgreSQL client for migrations
RUN apt-get update -y && apt-get install -y openssl postgresql-client && rm -rf /var/lib/apt/lists/*

# Copy package files
COPY package.json package-lock.json* ./

# Install production dependencies only
RUN npm install --omit=dev

# Install prisma CLI for db push at startup
RUN npm install prisma@5.19.1

# Copy prisma schema and generated client
COPY prisma ./prisma
COPY --from=builder /app/node_modules/.prisma ./node_modules/.prisma
COPY --from=builder /app/node_modules/@prisma ./node_modules/@prisma

# Copy compiled JavaScript
COPY --from=builder /app/dist ./dist

# Copy migration scripts
COPY scripts ./scripts

# Set environment
ENV NODE_ENV=production
ENV PORT=3001

EXPOSE 3001

# Apply schema to DB then start server
# Sleep briefly to ensure DB connection is stable, then push schema
CMD ["sh", "-c", "sleep 3 && npx prisma db push --accept-data-loss --skip-generate 2>&1 && echo 'Schema pushed successfully' && node dist/index.js"]
