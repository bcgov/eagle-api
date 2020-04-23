#!/bin/sh

/opt/rh/rh-mongodb36/root/usr/bin/mongodump -u admin -p ${MONGODB_ADMIN_PASSWORD} --authenticationDatabase=admin -d epic -o /tmp/dump
exit