# Build stage - use Node for reliable cross-platform builds
FROM node:20-alpine AS builder

RUN apk add --no-cache python3 make g++
RUN npm install -g bun

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
FROM node:20-alpine

WORKDIR /app

# Copy built application from builder
COPY --from=builder /app/.output ./.output

# Create data directory
RUN mkdir -p /app/data

# Expose port
EXPOSE 3000

# Start the application
CMD ["node", ".output/server/index.mjs"]
