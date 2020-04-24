#!/bin/sh
# Make a mongodump call to create the dumpfiles needed for our migration
# dump files will be pushed into /tmp/dump for retrieval
/opt/rh/rh-mongodb36/root/usr/bin/mongodump -u admin -p ${MONGODB_ADMIN_PASSWORD} --authenticationDatabase=admin -d epic -o /tmp/dump
exit