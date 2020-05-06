#!/bin/sh
set -euo pipefail
IFS=$'\n\t'
[ "${VERBOSE:-}" != true ]|| set -x

# PVC mount and folder variables, removing any trailing slashes (%/)
#
SRC_MNT=${SRC_MNT:-/mnt/source}
DEST_MNT=${DEST_MNT:-/mnt/dest}
SRC_MNT=${SRC_MNT%/}
DEST_MNT=${DEST_MNT%/}

echo "the source directory is: $SRC_MNT"
echo "the dest directory is: $DEST_MNT"
#

# Copy and verify
#
if ! rsync -avh ${SRC_MNT}/ ${DEST_MNT}/
then
	echo "Copy failed!  Previous backups retained."
	curl -X POST -H "Content-Type: application/json" --data "{\"username\":\"DataDruid\",\"icon_emoji\":\":man_mage:\",\"text\":\"@all EPIC Minio copy failed! Previous backups retained.\"}" ${ROCKETCHAT_WEBHOOK};
	rm -rf ${TMP_BK}
	exit 1
fi

du -hd 1 ${DEST_MNT}

echo "Backup Success!"
curl -X POST -H "Content-Type: application/json" --data "{\"username\":\"DataDruid\",\"icon_emoji\":\":man_mage:\",\"text\":\"EPIC Minio backup SUCCESS!\"}" ${ROCKETCHAT_WEBHOOK};
