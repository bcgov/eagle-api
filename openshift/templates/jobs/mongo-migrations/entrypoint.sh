#!/bin/sh
set -euo pipefail
IFS=$'\n\t'
[ "${VERBOSE:-}" != true ]|| set -x

echo "###############################################"
echo "##            Migration starting             ##"
echo "###############################################"
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
echo "* Scaling down the API pod ${API_POD}..."
echo "***********************************************"
# We need to scale down the API pod because of a tight dependency to db access
# We don't want users passing in data while we're migrating, and we don't want
# the pod to crash if it can't access in the few seconds while it's dropping
oc scale dc eagle-api --replicas=0

echo "***********************************************"
echo "* Begin backup process"
echo "***********************************************"

# Before we can start migrating, we need the latest copy of the data
# Because this is on another pod, we push up a script we can
# execue with an rsh call.
# We do not want to run the migration over the 'live' data in case
# there is an error
echo "Remote to the Mongo pod ${MONGO_POD}..."
oc cp create_backup.sh ${MONGO_POD}:/tmp/

echo "Creating a backup..."
oc rsh ${MONGO_POD} /tmp/create_backup.sh

# Now that the Mongo pod has generated a dump, we want to copy it
# over to this docker instance. This way we can run the data migration
# in isolation without potentially damaging the 'live' mongodb instance
# use oc rsync to pull the data into your desired local directory
echo "Copying backup..."
cd /data/dump
oc rsync ${MONGO_POD}:/tmp/dump .

# start a local instance of mongodb in a fork
echo "Fire up MongoDB..."
mongod --fork --logpath /var/log/mongod.log

# mongorestore will push our extracted dump into our local mongodb
# instance, where we can safely manipulate it with our migration scripts
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
# before we can run the migration scripts, we have to make sure
# the required libraries are available for running the api project
# in node
npm install
echo "***********************************************"
echo "* Running migrations..."
echo "***********************************************"
# We use the db-migrate library for running migration scripts.
# Call 'db-migrate up' to trigger the processing of any outstanding
# migration scripts in our migrations folder
# for more info on db-migrate see: https://db-migrate.readthedocs.io/en/latest/
if ! ./node_modules/db-migrate/bin/db-migrate up
then
    # If the process failed, send a message to the RocketChat channel
	echo "Migration process failed!"
    curl -X POST -H "Content-Type: application/json" --data "{\"username\":\"BakBot\",\"icon_emoji\":\":robot:\",\"text\":\"@all EPIC data migration process failed.\"}" ${ROCKETCHAT_WEBHOOK};
else
    # If the migrations were all good, create a local dump
    # and push that up to the 'live' mongodb pod. This is the same
    # process that we used to get the dump here initially
    # Note that this section will never call if the process fails
    # because we did everything locally, we don't have to worry about
    # any cleanup on the 'lve' mongodb instance.
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
    # we have a set of separate scripts to assist with reloading the data
    # on the 'live' mongodb instance. As before, execute with rsh
    oc cp drop_db.sh ${MONGO_POD}:/tmp/
    oc cp restore_backup.sh ${MONGO_POD}:/tmp/
    echo "Dropping epic db..."
    oc rsh ${MONGO_POD} /tmp/drop_db.sh
    echo "Loading migrated data..."
    oc rsh ${MONGO_POD} /tmp/restore_backup.sh
fi
echo "***********************************************"
echo "* Scaling API pod back up..."
echo "***********************************************"
echo ""
# The process is finished, so we need to scale up the API pod to get
# the system working again. This must occur whether the process is
# successful or not
oc scale dc eagle-api --replicas=1
echo ""
echo "###############################################"
echo "##            Migration complete             ##"
echo "###############################################"
# rip migration process.
exit 1
