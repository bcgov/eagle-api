#!/bin/sh

/opt/rh/rh-mongodb36/root/usr/bin/mongorestore -u admin -p ${MONGODB_ADMIN_PASSWORD} --authenticationDatabase=admin -d epic /tmp/dump/migrated/epic/
exit