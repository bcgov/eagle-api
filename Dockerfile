# =============================================================================
# Eagle-API Multi-Stage Dockerfile
# =============================================================================
# Node.js 22 API server for EPIC (Environmental Assessment Office)
#
# Build: docker build -t eagle-api .
# Run:   docker run -p 3000:3000 eagle-api
# =============================================================================

# -----------------------------------------------------------------------------
# Stage 1: Dependencies
# -----------------------------------------------------------------------------
FROM node:22-alpine AS base

WORKDIR /app

# Enable Corepack for Yarn
RUN corepack enable

# Copy package files
COPY package.json yarn.lock .yarnrc.yml ./

# Install production dependencies only
RUN yarn install --immutable

# Remove nested test lockfiles that may contain vulnerable dependencies
RUN find ./node_modules -name "package-lock.json" -path "*/test/*" -delete 2>/dev/null || true

# -----------------------------------------------------------------------------
# Stage 2: Production Runtime
# -----------------------------------------------------------------------------
FROM node:22-alpine

# Build arguments for labels
ARG COMMIT_SHA
ARG COMMIT_AUTHOR
ARG COMMIT_TIMESTAMP
ARG COMMIT_MESSAGE

WORKDIR /app

# Labels for image metadata
LABEL commit.id="${COMMIT_SHA}" \
      commit.author="${COMMIT_AUTHOR}" \
      commit.timestamp="${COMMIT_TIMESTAMP}" \
      commit.message="${COMMIT_MESSAGE}" \
      app.name="eagle-api" \
      app.component="api" \
      io.openshift.expose-services="3000:http" \
      io.openshift.tags="node,eagle-api,epic"

# Update Alpine packages to latest security patches
RUN apk upgrade --no-cache

# Remove npm to eliminate bundled vulnerabilities (we use Yarn via corepack)
RUN rm -rf /usr/local/lib/node_modules/npm

# Create non-root user for security (OpenShift compatible)
RUN addgroup -g 1001 -S nodejs && \
    adduser -S nodejs -u 1001

# Copy production dependencies from base stage
COPY --from=base /app/node_modules ./node_modules

# Copy application source code
COPY --chown=nodejs:nodejs . .

# Create directories with proper permissions
RUN mkdir -p uploads logs && \
    chown -R nodejs:nodejs uploads logs

# Switch to non-root user
USER nodejs

# Expose port
EXPOSE 3000

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
    CMD wget --no-verbose --tries=1 --spider http://localhost:3000/api/docs || exit 1

# Start the application
CMD ["node", "app.js"]
