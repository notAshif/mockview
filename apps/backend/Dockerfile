# Use official Bun image
FROM oven/bun:1.3.11-alpine AS base
WORKDIR /usr/src/app

# Install openssl and libc6-compat for Prisma engine binaries in Alpine
RUN apk add --no-cache openssl libc6-compat

# Copy root workspace files
COPY package.json bun.lock ./

# Copy package configurations for monorepo resolution
COPY apps/backend/package.json ./apps/backend/
COPY packages/eslint-config/package.json ./packages/eslint-config/
COPY packages/typescript-config/package.json ./packages/typescript-config/
COPY packages/ui/package.json ./packages/ui/

# Copy monorepo source files (node_modules excluded via .dockerignore)
COPY apps/backend ./apps/backend
COPY packages ./packages

# Install dependencies AFTER copying source so Bun symlinks are not overwritten
RUN bun install

# Expose backend port
EXPOSE 3002

# Run from the backend directory
WORKDIR /usr/src/app/apps/backend

# On start, generate the Prisma client, push schema changes to Postgres, and run dev server
CMD ["sh", "-c", "bun ./node_modules/prisma/build/index.js generate && bun ./node_modules/prisma/build/index.js db push && bun run dev"]
