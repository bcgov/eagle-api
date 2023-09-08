#!/bin/sh
[ "${VERBOSE:-}" != true ]|| set -xe
DATABASE_JSON=$(cat << EOF
{
  "defaultEnv": "local",
  "local": {
    "driver": "mongodb",
    "database": "epic",
    $([ "$MONGODB_ADMIN_USER" ] && echo "\"user\"":"\"$MONGODB_ADMIN_USER\"",)
    $([ "$MONGODB_ADMIN_PASSWORD" ] && echo "\"password\"":"\"$MONGODB_ADMIN_PASSWORD\"",)
    "host": $([ "$MONGODB_SERVICE_HOST" ] && echo "\"$MONGODB_SERVICE_HOST\"", || echo "\"localhost\"",)
    $([ "$MONGODB_AUTHSOURCE" ] && echo "\"authSource\"":"\"$MONGODB_AUTHSOURCE\"",)
    "port": $([ "$MONGODB_PORT" ] && echo "\"$MONGODB_PORT\"", || echo "\"27017\"")
  }
}
EOF
)

echo "$DATABASE_JSON" > database_migration.json
cat ./database_migration.json

echo "Migration starting..."
node ./node_modules/db-migrate/bin/db-migrate up --config database_migration.json --env local
echo "Migration completed"