# Use official Bun image
FROM oven/bun:1.3.11-alpine AS base
WORKDIR /usr/src/app

# Copy root workspace files
COPY package.json bun.lock ./

# Copy package configurations for monorepo resolution
COPY apps/frontend/package.json ./apps/frontend/
COPY packages/eslint-config/package.json ./packages/eslint-config/
COPY packages/typescript-config/package.json ./packages/typescript-config/
COPY packages/ui/package.json ./packages/ui/

# Copy monorepo source files (node_modules excluded via .dockerignore)
COPY apps/frontend ./apps/frontend
COPY packages ./packages

# Install dependencies AFTER copying source so Bun symlinks are not overwritten
RUN bun install

# Expose frontend port
EXPOSE 3000

# Set environment variables to bind to all network interfaces inside container
ENV PORT=3000
ENV HOST=0.0.0.0

# Run from the frontend directory
WORKDIR /usr/src/app/apps/frontend

# Start frontend dev server
CMD ["bun", "run", "dev", "--host", "0.0.0.0", "--port", "3000"]
