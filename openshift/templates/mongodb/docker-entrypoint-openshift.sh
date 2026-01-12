#!/bin/bash
# Custom entrypoint for OpenShift-compatible MongoDB 4.4
# Maps sclorg-style environment variables (used by eagle-api) to Docker official image format

set -e

# Map sclorg environment variables to Docker official image format
# eagle-api uses: MONGODB_ADMIN_PASSWORD, MONGODB_USER, MONGODB_PASSWORD, MONGODB_DATABASE
if [ -n "${MONGODB_ADMIN_PASSWORD}" ]; then
    export MONGO_INITDB_ROOT_USERNAME="${MONGO_INITDB_ROOT_USERNAME:-admin}"
    export MONGO_INITDB_ROOT_PASSWORD="${MONGODB_ADMIN_PASSWORD}"
fi

if [ -n "${MONGODB_DATABASE}" ]; then
    export MONGO_INITDB_DATABASE="${MONGODB_DATABASE}"
fi

# Ensure data directory exists and check permissions
if [ ! -d "/var/lib/mongodb/data" ]; then
    mkdir -p /var/lib/mongodb/data
fi

# Log current user for debugging OpenShift arbitrary UID
echo "MongoDB 4.4.30 starting..."
echo "Running as user: $(id)"

# Create user initialization script if sclorg-style env vars are provided
# This creates the application user that eagle-api connects with
if [ -n "${MONGODB_USER}" ] && [ -n "${MONGODB_PASSWORD}" ] && [ -n "${MONGODB_DATABASE}" ]; then
    echo "Setting up application user '${MONGODB_USER}' for database '${MONGODB_DATABASE}'"
    
    cat > /docker-entrypoint-initdb.d/create-app-user.js <<EOF
// Create application database and user for eagle-api
db = db.getSiblingDB('${MONGODB_DATABASE}');
db.createUser({
    user: '${MONGODB_USER}',
    pwd: '${MONGODB_PASSWORD}',
    roles: [
        { role: 'readWrite', db: '${MONGODB_DATABASE}' },
        { role: 'dbAdmin', db: '${MONGODB_DATABASE}' }
    ]
});
print('Created user ${MONGODB_USER} for database ${MONGODB_DATABASE}');
EOF
fi

# Call original Docker entrypoint
exec /usr/local/bin/docker-entrypoint.sh "$@"
