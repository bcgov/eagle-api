#!/bin/sh
set -euo pipefail
IFS=$'\n\t'
[ "${VERBOSE:-}" != true ]|| set -x

echo "###############################################"
echo "##            Migration starting             ##"
echo "###############################################"
echo ""
echo ""
echo ""
echo "***********************************************"
echo "* Connect to openshift..."
echo "***********************************************"
# probably need a long-lived token? oc create serviceaccount epic-dbmigrate 
oc login ${OC_URL} --token=${OC_TOKEN}
oc project esm-${NAME_SUFFIX}

# get the API and MongoDB pods
echo "Identifying Mongo and API pods..."
API_POD=$(oc get pods -n esm-dev --output='custom-columns=NAME:.metadata.name' --no-headers=true --selector='name in (eagle-api)')
MONGO_POD=$(oc get pods -n esm-dev --output='custom-columns=NAME:.metadata.name' --no-headers=true --selector='name in (eagle-api-mongodb)')
echo ""
echo "***********************************************"
echo "* Current API Pod: ${API_POD}"
echo "* Current MongoDB Pod: ${MONGO_POD}"
echo "***********************************************"
echo ""
echo "***********************************************"
echo "* Shut down the API pod ${API_POD}..."
echo "***********************************************"
oc scale pod ${API_POD} --replicas=0

echo "***********************************************"
echo "* Begin backup process"
echo "***********************************************"

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

echo "Prepping for migration run..."
cd /eagle-api
# how do we know if this failed or succeeded?
# if it failed, we should just die, and alert the user
# only carry on with the local dump if all is well.
# install so we can run the migrations
echo "***********************************************"
echo "* NPM install log"
echo "***********************************************"
npm install
echo "***********************************************"
echo "* Running migrations..."
echo "***********************************************"
if ! ./node_modules/db-migrate/bin/db-migrate up
then
	echo "Migration process failed!"
    curl -X POST -H "Content-Type: application/json" --data "{\"username\":\"BakBot\",\"icon_emoji\":\":robot:\",\"text\":\"@all EPIC data migration process failed.\"}" ${ROCKETCHAT_WEBHOOK};
else
    # If the migrations were all good, create a local dump
    # and push that up to the mongodb
    echo "***********************************************"
    echo "* Migration successful, restoring to ${MONGO_POD}"
    echo "***********************************************"

    echo "Creating a local dump..."
    cd /data/dump
    mongodump -d epic -o ./migrated

    echo "Copying dump to Mongo pod..."
    oc rsync . ${MONGO_POD}:/tmp/dump

    echo "Restoring Mongo from Migrated data dump..."
    cd /
    oc cp drop_db.sh ${MONGO_POD}:/tmp/
    oc cp restore_backup.sh ${MONGO_POD}:/tmp/
    echo "Dropping epic db..."
    oc rsh ${MONGO_POD} /tmp/drop_db.sh
    echo "Loading migrated data..."
    oc rsh ${MONGO_POD} /tmp/restore_backup.sh
fi
echo "***********************************************"
echo "* Spinning API pod back up..."
echo "***********************************************"
echo ""
oc scale pod ${API_POD} --replicas=1
echo ""
echo "###############################################"
echo "##            Migration complete             ##"
echo "###############################################"

exit 1
