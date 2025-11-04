# Build stage
FROM node:20-alpine AS builder

WORKDIR /app

# Copy package files
COPY package*.json ./

# Install dependencies
RUN npm ci

# Copy application files
COPY . .

# Build Nuxt application
RUN npm run build

# Production stage
FROM node:20-alpine

WORKDIR /app

# Copy package files
COPY package*.json ./

# Install production dependencies only
RUN npm ci --production --ignore-scripts

# Copy built application from builder
COPY --from=builder /app/.output ./.output
COPY --from=builder /app/public ./public

# Create data directory with proper permissions
# The node user already exists in the base image with UID 1000
RUN mkdir -p /app/data && \
    chown -R node:node /app/data && \
    chown -R node:node /app/.output

# Switch to non-root user
USER node

# Expose port
EXPOSE 3000


# Start the application
CMD ["node", ".output/server/index.mjs"]

