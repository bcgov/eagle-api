#!/usr/bin/env sh

echo "-------- STARTING CRON --------"

# cp -a (preserve all) fails as non-root; use -r (recursive only) instead
cp -r /scripts/. /opt/cron/jobs/

for SCRIPT in /opt/cron/jobs/*.sh
do
    if [ -f "$SCRIPT" ]
    then
        chmod +x "$SCRIPT"
        "$SCRIPT"
    fi
done