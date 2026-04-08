#!/bin/sh
set -e
[ "${VERBOSE:-}" != true ] || set -x

echo "Migration starting..."
node ./node_modules/migrate-mongo/bin/migrate-mongo.js up
echo "Migration completed"
echo "Migration completed"