# OpenShift-compatible MongoDB 4.0.28 Image
# Based on official Docker Hub image (no auth required)
# Provides sclorg-style environment variable compatibility for eagle-api

FROM mongo:4.0.28

LABEL io.k8s.description="MongoDB 4.0 NoSQL database server for OpenShift" \
      io.k8s.display-name="MongoDB 4.0" \
      io.openshift.expose-services="27017:mongodb" \
      io.openshift.tags="database,mongodb,mongodb40" \
      name="eagle/mongodb-40-openshift" \
      version="4.0.28" \
      maintainer="BC Gov EAO <EAO.EPICsupport@gov.bc.ca>"

# Environment variables for sclorg compatibility (used by eagle-api)
ENV MONGODB_VERSION=4.0 \
    HOME=/data/db \
    CONTAINER_SCRIPTS_PATH=/usr/share/container-scripts/mongodb \
    MONGODB_DATADIR=/var/lib/mongodb/data

USER root

# Install additional tools needed for backups and health checks
RUN apt-get update && \
    apt-get install -y --no-install-recommends \
        gettext \
        rsync \
        curl \
    && rm -rf /var/lib/apt/lists/*

# Create data directories with OpenShift-compatible permissions
# OpenShift runs containers with arbitrary UIDs but GID 0 (root group)
RUN mkdir -p /var/lib/mongodb/data /data/db /data/configdb ${CONTAINER_SCRIPTS_PATH} && \
    # Set group ownership to root (GID 0) for OpenShift arbitrary UID support
    chgrp -R 0 /var/lib/mongodb /data/db /data/configdb ${CONTAINER_SCRIPTS_PATH} && \
    chmod -R g=u /var/lib/mongodb /data/db /data/configdb ${CONTAINER_SCRIPTS_PATH} && \
    # Allow write access for any user in group 0
    chmod -R g+rwX /var/lib/mongodb /data/db /data/configdb && \
    # Create directory for init scripts
    mkdir -p /docker-entrypoint-initdb.d && \
    chgrp -R 0 /docker-entrypoint-initdb.d && \
    chmod -R g+rwX /docker-entrypoint-initdb.d

# Copy custom entrypoint that handles sclorg env vars
COPY docker-entrypoint-openshift.sh /usr/local/bin/
RUN chmod +x /usr/local/bin/docker-entrypoint-openshift.sh

# Volume for persistent data (matches eagle-api.dc.json volumeMount)
VOLUME ["/var/lib/mongodb/data"]

# Expose default MongoDB port
EXPOSE 27017

# Use non-root user (UID 999 is 'mongodb' in base image)
# OpenShift will override this with an arbitrary UID
USER 999

ENTRYPOINT ["docker-entrypoint-openshift.sh"]
CMD ["mongod", "--bind_ip_all", "--dbpath", "/var/lib/mongodb/data"]
