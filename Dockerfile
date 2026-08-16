# ==============================================================================
# Eagle-API Dockerfile
# ==============================================================================
# Node.js Express backend for EPIC.
#
# Build: docker build -t eagle-api .
# Run:   docker run -p 3000:3000 eagle-api
# ==============================================================================

FROM node:24-alpine

# Update Alpine packages to latest security patches
RUN apk upgrade --no-cache

# Remove npm (we use yarn) — eliminates Trivy findings from npm's bundled deps
RUN rm -rf /usr/local/lib/node_modules/npm /usr/local/bin/npm /usr/local/bin/npx

LABEL io.openshift.expose-services="3000:http" \
      io.openshift.tags="nodejs,express,eagle-api"

WORKDIR /opt/app-root/src

# Copy package files and yarn configuration
COPY package.json yarn.lock .yarnrc.yml ./

# Install production dependencies only (devDependencies are not needed at runtime)
RUN corepack enable && yarn workspaces focus --production

# Copy application source
COPY . .

# Writeable upload directory (OpenShift runs as non-root)
RUN mkdir -p /tmp/uploads && chmod 1777 /tmp/uploads
ENV UPLOAD_DIRECTORY=/tmp/uploads

EXPOSE 3000

# Health check
HEALTHCHECK --interval=30s --timeout=3s --start-period=10s --retries=3 \
    CMD wget -q --spider http://localhost:3000/api/health || exit 1

CMD ["node", "app.js"]
