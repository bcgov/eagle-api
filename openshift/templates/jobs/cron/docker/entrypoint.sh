#!/usr/bin/env sh

echo "-------- STARTING CRON --------"

cp -a /scripts/. /opt/cron/jobs/

for SCRIPT in /opt/cron/jobs/*.sh
do
    if [ -f "$SCRIPT" ]
    then
        chmod +x "$SCRIPT"
        "$SCRIPT"
    fi
done