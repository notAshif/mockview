# Use official Bun image
FROM oven/bun:1.3.11-alpine AS base
WORKDIR /usr/src/app

# Install openssl and libc6-compat for Prisma engine binaries in Alpine
RUN apk add --no-cache openssl libc6-compat

# Copy lock and root package files
COPY package.json bun.lock ./

# Copy package configurations for monorepo resolution
COPY apps/backend/package.json ./apps/backend/
COPY packages/eslint-config/package.json ./packages/eslint-config/
COPY packages/typescript-config/package.json ./packages/typescript-config/
COPY packages/ui/package.json ./packages/ui/

# Install dependencies (bun links monorepo packages automatically)
RUN bun install 

# Copy monorepo source files
COPY apps/backend ./apps/backend
COPY packages ./packages

# Expose backend port
EXPOSE 3002

# Run from the backend directory
WORKDIR /usr/src/app/apps/backend

# Generate Prisma client
ENV DATABASE_URL="postgresql://postgres:postgres@localhost:5432/mockview?schema=public"
RUN bunx --bun prisma generate

# On start, push schema changes to Postgres database and run backend dev server
CMD ["sh", "-c", "bunx --bun prisma db push && bun run dev"]
