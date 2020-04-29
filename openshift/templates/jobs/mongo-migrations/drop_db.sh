#!/bin/sh
# MongoDB pod appears to have libs in different places. We need
# access to the libyaml-cpp package located in the path below
# removing this line will cause the mongo command to fail if called
# via rsh
LD_LIBRARY_PATH=/opt/rh/rh-mongodb36/root/usr/lib64/
export LD_LIBRARY_PATH
# This command will drop the epic database, destroying the data. It cannot be undone so
# ensure this doesn't run unless you follow up with a restore!
/opt/rh/rh-mongodb36/root/usr/bin/mongo epic --authenticationDatabase=admin -u admin -p ${MONGODB_ADMIN_PASSWORD} --eval "printjson(db.dropDatabase())"
exit