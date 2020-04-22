#!/bin/sh
set -euo pipefail
IFS=$'\n\t'
[ "${VERBOSE:-}" != true ]|| set -x

# Variables -- Where do we get these from? Assuming the openshift yaml env configs
API_POD=${API_POD}
MONGO_POD=${MONGO_POD}
MONGODB_ADMIN_PASSWORD=${MONGODB_ADMIN_PASSWORD}

# probably need a long-lived token? oc create serviceaccount epic-dbmigrate 
echo "Connect to openshift..."
oc login https://console.pathfinder.gov.bc.ca:8443 --token=abc123
oc project esm-${NAME_SUFFIX}
echo "Shut down the API pod..."
oc scale pod ${API_POD} --replicas=0  # how do we get the pod id?

echo "Remote to the Mongo pod..."
oc rsh ${MONGO_POD} # how do we get the pod id?
# At this point, I'm assuming the script will execute correctly in the rsh terminal?
echo "Creating a backup..."
mongodump -u admin -p ${MONGODB_ADMIN_PASSWORD} --authenticationDatabase=admin -d epic -o /tmp/dump
exit

echo "Copying backup..."
cd ./data/dump
oc rsync ${MONGO_POD}:/tmp/dump .
echo "Loading backup into local MongoDB..."
mongoRestore -u admin -p ${MONGODB_ADMIN_PASSWORD} --authenticationDatabase=admin -d epic .

echo "Running migration scripts..."
cd ./ealge-api
# how do we know if this failed or succeeded?
# if it failed, we should just die, and alert the user
# only carry on with the local dump if all is well.
if ! ./node_modules/db-migrate/bin/db-migrate up
then
	echo "Migration process failed!"
    curl -X POST -H "Content-Type: application/json" --data "{\"username\":\"BakBot\",\"icon_emoji\":\":robot:\",\"text\":\"@all EPIC data migration process failed.\"}" ${ROCKETCHAT_WEBHOOK};
    echo "Spinning API pod back up..."
    oc scale pod ${API_POD} --replicas=1
	exit 1
fi
# If the migrations were all good, create a local dump
# and push that up to the mongodb
echo "Creating a local dump..."
cd ./data/dump
mongodump -d epic -o ./migrated

echo "Copying dump to Mongo pod..."
oc rsync . ${MONGO_POD}:/tmp/dump
oc rsh ${MONGO_POD}

echo "Restoring dump..."
mongo admin -u admin -p ${MONGODB_ADMIN_PASSWORD}
use epic
db.dropDatabase()
exit
cd /tmp/dump
mongorestore -u admin -p ${MONGODB_ADMIN_PASSWORD} --authenticationDatabase=admin -d epic migrated/epic
exit

echo "Spinning API pod back up..."
oc scale pod ${API_POD} --replicas=1

echo "Migration complete!"

# kill local mongo, let the pod die? or just shut down the pod?