# Stage 1: Build
FROM node:20-alpine AS builder

RUN apk add --no-cache openssl

WORKDIR /app

# Copy package files (including lock for deterministic installs)
COPY package.json package-lock.json* ./
RUN npm install

# Copy all source files
COPY . .

# Generate Prisma client from local schema
RUN npx prisma generate --schema=./prisma/schema.prisma

# Build TypeScript (skip the prisma generate in npm run build since we just did it)
RUN npx tsc

# Stage 2: Production
FROM node:20-alpine AS runner

RUN apk add --no-cache openssl

WORKDIR /app

ENV NODE_ENV=production

RUN addgroup --system --gid 1001 nodejs && \
    adduser --system --uid 1001 worker

COPY --from=builder /app/dist ./dist
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/package.json ./package.json

USER worker

CMD ["node", "dist/index.js"]
