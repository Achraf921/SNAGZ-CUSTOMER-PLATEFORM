# ===============================================
# DOCKERFILE FOR SNA GZ BACKEND
# Production-ready Node.js application with security
# ===============================================

# Stage 1: Base image with Node.js
# Using Alpine Linux for smaller image size
FROM node:18-alpine AS base

# Set working directory inside container
WORKDIR /app

# Install system dependencies needed for native modules
# - python3, make, g++: For compiling native Node.js modules
# - curl: For health checks
RUN apk add --no-cache python3 make g++ curl

# Create non-root user for security
# Running as root is a security risk
RUN addgroup -g 1001 -S nodejs && \
    adduser -S nodejs -u 1001

# ===============================================
# Stage 2: Dependencies installation
# ===============================================
FROM base AS deps

# Copy package files first (for better Docker layer caching)
# If package.json doesn't change, this layer won't rebuild
COPY package*.json ./

# Install dependencies
# Install all dependencies first, then remove dev dependencies
RUN npm ci && \
    npm prune --production && \
    npm cache clean --force

# ===============================================
# Stage 3: Application build
# ===============================================
FROM base AS runner

# Copy installed dependencies from deps stage
COPY --from=deps /app/node_modules ./node_modules

# Copy application source code
COPY --chown=nodejs:nodejs . .

# Create directories that the app needs
RUN mkdir -p /app/uploads/temp && \
    mkdir -p /app/src/services/logs && \
    mkdir -p /app/ssl

# Set proper permissions
RUN chown -R nodejs:nodejs /app

# Switch to non-root user
USER nodejs

# ===============================================
# Environment and Security Configuration
# ===============================================

# Set Node.js environment to production
ENV NODE_ENV=production

# Optimize Node.js for production
ENV NODE_OPTIONS="--max-old-space-size=1024"

# Security: Disable Node.js development features
ENV NODE_NO_WARNINGS=1

# Set timezone
ENV TZ=Europe/Paris

# ===============================================
# Health Check
# ===============================================

# Health check to monitor container health
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
    CMD curl -f http://localhost:3000/health || exit 1

# ===============================================
# Expose and Run
# ===============================================

# Expose port 3000 (where our app runs)
EXPOSE 3000

# Start the application
# Using node directly (not npm) for better signal handling in containers
CMD ["node", "src/server.js"]