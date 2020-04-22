#!/bin/sh
set -euo pipefail
IFS=$'\n\t'
[ "${VERBOSE:-}" != true ]|| set -x

echo "Connect to openshift..."
oc login...
echo "Shut down the API pod..."
oc scale pod [api pod id] --replicas=0

echo "Remote to the Mongo pod..."
oc project esm-[dev/test/prod]
oc rsh [mongo pod name]

echo "Creating a backup..."
mongodump -u admin -p $MONGODB_ADMIN_PASSWORD --authenticationDatabase=admin -d epic -o /tmp/dump
exit

echo "Copying backup..."
cd [dump location]
oc rsync [mongo pod name]:/tmp/dump .
mongo
use epic
db.dropDatabase()
exit

echo "Loading backup into local MongoDB..."
mongoRestore

echo "Running migration scripts..."
cd ./ealge-api
./node_modules/db-migrate/bin/db-migrate up

echo "Creating a local dump..."
cd [dump location]
mongodump -d epic -o ./migrated

echo "Copying dump to Mongo pod..."
oc rsync . [mongo pod name]:/tmp/dump
oc rsh [mongo pod name]

echo "Restoring dump..."
mongo admin -u admin -p $MONGODB_ADMIN_PASSWORD
use epic
db.dropDatabase()
exit
cd /tmp/dump
mongorestore -u admin -p $MONGODB_ADMIN_PASSWORD --authenticationDatabase=admin -d epic migrated/epic
exit

echo "Spinning API pod back up..."
oc scale pod [api pod id] --replicas=1

echo "Migration run complete!"
