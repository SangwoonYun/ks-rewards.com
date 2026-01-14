# Build stage
FROM oven/bun:1-alpine AS builder

WORKDIR /app

# Copy package files
COPY package.json ./
COPY bun.lock ./

# Install dependencies with frozen lockfile for reproducible builds
RUN bun install --frozen-lockfile

# Copy application files
COPY . .

# Build Nuxt application
RUN bun run build

# Production stage
FROM oven/bun:1-alpine

WORKDIR /app

# Copy package files
COPY package.json ./

# Copy lock file from builder to ensure same versions
COPY --from=builder /app/bun.lock ./

# Install production dependencies only with frozen lockfile
RUN bun install --frozen-lockfile --production

# Copy built application from builder
COPY --from=builder /app/.output ./.output

# Create data directory
RUN mkdir -p /app/data

# Expose port
EXPOSE 3000

# Start the application
CMD ["bun", "run", ".output/server/index.mjs"]
