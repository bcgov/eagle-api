#!/bin/sh
set -euo pipefail
IFS=$'\n\t'
[ "${VERBOSE:-}" != true ]|| set -x

# keep pod open for one day to allow developer to restore backup
sleep ${SLEEP}
