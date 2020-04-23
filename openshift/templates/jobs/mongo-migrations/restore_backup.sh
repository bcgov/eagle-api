#!/bin/sh

/opt/rh/rh-mongodb36/root/usr/bin/mongo admin -u admin -p ${MONGODB_ADMIN_PASSWORD}
use epic
db.dropDatabase()
exit
cd /tmp/dump/
/opt/rh/rh-mongodb36/root/usr/bin/mongorestore -u admin -p ${MONGODB_ADMIN_PASSWORD} --authenticationDatabase=admin -d epic migrated/epic
exit