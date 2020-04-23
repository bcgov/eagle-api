#!/bin/sh

LD_LIBRARY_PATH=/opt/rh/rh-mongodb36/root/usr/lib64/
export LD_LIBRARY_PATH

/opt/rh/rh-mongodb36/root/usr/bin/mongo epic --authenticationDatabase=admin -u admin -p ${MONGODB_ADMIN_PASSWORD} --eval "printjson(db.dropDatabase())"
exit