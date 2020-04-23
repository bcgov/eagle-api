#!/bin/sh
set -euo pipefail
IFS=$'\n\t'
[ "${VERBOSE:-}" != true ]|| set -x

# Variables -- Where do we get these from? Assuming the openshift yaml env configs
API_POD=${API_POD}
MONGO_POD=${MONGO_POD}

# probably need a long-lived token? oc create serviceaccount epic-dbmigrate 
echo "Connect to openshift..."
oc login ???
oc project esm-${NAME_SUFFIX}
echo "Shut down the API pod ${API_POD}..."
#oc scale pod ${API_POD} --replicas=0  # how do we get the pod id?

echo "Remote to the Mongo pod ${MONGO_POD}..."
oc cp create_backup.sh ${MONGO_POD}:/tmp/
echo "Creating a backup..."
oc rsh ${MONGO_POD} /tmp/create_backup.sh

echo "Copying backup..."
cd /data/dump
oc rsync ${MONGO_POD}:/tmp/dump .
echo "Fire up MongoDB..."
mongod --fork --logpath /var/log/mongod.log
echo "Loading backup into local MongoDB..."
cd /data/dump/dump/epic
mongorestore -d epic .

echo "Preparing eagle-api for running migration scripts..."
cd /eagle-api
# how do we know if this failed or succeeded?
# if it failed, we should just die, and alert the user
# only carry on with the local dump if all is well.
# install so we can run the migrations
npm install
echo "Running migrations..."
if ! ./node_modules/db-migrate/bin/db-migrate up
then
	echo "Migration process failed!"
    #curl -X POST -H "Content-Type: application/json" --data "{\"username\":\"BakBot\",\"icon_emoji\":\":robot:\",\"text\":\"@all EPIC data migration process failed.\"}" ${ROCKETCHAT_WEBHOOK};
    echo "Spinning API pod back up..."
    #oc scale pod ${API_POD} --replicas=1
	exit 1
fi
# If the migrations were all good, create a local dump
# and push that up to the mongodb
echo "Creating a local dump..."
cd /data/dump
mongodump -d epic -o ./migrated

echo "Copying dump to Mongo pod..."
oc rsync . ${MONGO_POD}:/tmp/dump
echo "Restoring Mongo from Migrated data dump..."
oc cp restore_backup.sh ${MONGO_POD}:/tmp/
oc rsh ${MONGO_POD} /tmp/restore_backup.sh

echo "Spinning API pod back up..."
#oc scale pod ${API_POD} --replicas=1

echo "Migration complete!"

#exit 1
