# Use official Bun image
FROM oven/bun:1.3.11-alpine AS base
WORKDIR /usr/src/app

# Copy lock and root package files
COPY package.json bun.lock ./

# Copy package configurations for monorepo resolution
COPY apps/frontend/package.json ./apps/frontend/
COPY packages/eslint-config/package.json ./packages/eslint-config/
COPY packages/typescript-config/package.json ./packages/typescript-config/
COPY packages/ui/package.json ./packages/ui/

# Install dependencies
RUN bun install

# Copy monorepo source files
COPY apps/frontend ./apps/frontend
COPY packages ./packages

# Expose frontend port
EXPOSE 3000

# Set environment variables to bind to all network interfaces inside container
ENV PORT=3000
ENV HOST=0.0.0.0

# Run from the frontend directory
WORKDIR /usr/src/app/apps/frontend

# Start frontend dev server
CMD ["bun", "run", "dev", "--host", "0.0.0.0", "--port", "3000"]
