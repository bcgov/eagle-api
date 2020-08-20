#!/bin/sh
set -euo pipefail
IFS=$'\n\t'
[ "${VERBOSE:-}" != true ]|| set -x

# PVC mount and folder variables, removing any trailing slashes (%/)
#
SRC_MNT=${SRC_MNT:-/mnt/source}
SRC_MNT=${SRC_MNT%/}
#

# Check if NFS repository is initialized.  If not, initialize it.
# the RESTIC_PASSWORD secret is required.
if ! restic -r /mnt/dest/epic-documents snapshots > /dev/null 2>&1; then
    restic -r /mnt/dest/epic-documents init ; fi

# Backup files using delta (de-duplicate) and encryption
restic --cache-dir /mnt/dest/epic-documents/.cache -r /mnt/dest/epic-documents backup ${SRC_MNT}

# Clean up old snapshots.
# As an example, the following arguments:
# --keep-daily 7 --keep-weekly 5 --keep-monthly 12 --keep-yearly 2
# will keep the most recent 7 daily snapshots, 5 weekly, 12 monthly, and 2 yearly snapshots.
# The rest will be pruned.
restic -r /mnt/dest/epic-documents forget --keep-daily 7 --keep-weekly 5 --keep-monthly 12 --keep-yearly 10 --prune

# check repository integrity before exiting
if ! restic -r /mnt/dest/epic-documents check
then
	echo "Backup failed!  Previous backups retained."
	curl -X POST -H "Content-Type: application/json" --data "{\"username\":\"DataDruid\",\"icon_emoji\":\":man_mage:\",\"text\":\"@all EPIC Minio backup FAILED! Previous backups retained.\"}" ${ROCKETCHAT_WEBHOOK};
	exit 1
fi

echo "Backup Success!"
curl -X POST -H "Content-Type: application/json" --data "{\"username\":\"DataDruid\",\"icon_emoji\":\":man_mage:\",\"text\":\"EPIC Minio backup SUCCESS!\"}" ${ROCKETCHAT_WEBHOOK};
