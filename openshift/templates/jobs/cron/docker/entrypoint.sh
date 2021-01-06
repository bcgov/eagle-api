#!/usr/bin/env bash

echo -e "-------- STARTING CRON --------\n" 

source /opt/cron/get-token.sh

cp -a /scripts/. /opt/cron/jobs/

for SCRIPT in /opt/cron/jobs/*.sh
do
    if [ -f $SCRIPT ]
    then
        chmod +x $SCRIPT
        $SCRIPT
    fi
done