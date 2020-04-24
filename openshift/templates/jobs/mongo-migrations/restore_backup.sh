#!/bin/sh
# mongorestore will rebuild the database from a dump file
# We'll look for our migrated dump file at /tmp/dump/migrated/epic/
/opt/rh/rh-mongodb36/root/usr/bin/mongorestore -u admin -p ${MONGODB_ADMIN_PASSWORD} --authenticationDatabase=admin -d epic /tmp/dump/migrated/epic/
exit