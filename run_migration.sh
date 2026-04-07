#!/bin/sh
[ "${VERBOSE:-}" != true ]|| set -xe

echo "Migration starting..."
node ./node_modules/migrate-mongo/bin/migrate-mongo.js up
echo "Migration completed"