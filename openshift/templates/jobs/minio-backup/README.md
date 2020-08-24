# S3/ minio document backup

This job connects to a PVC containing files and creates a backup in NFS storage using restic (see https://restic.net/).

## Restore from a backup

see the readme in the minio-restore folder in this directory https://github.com/bcgov/eagle-api/blob/develop/openshift/templates/jobs/minio-backup/minio-restore/README.md

## Setup

You will need to setup the following OpenShift secrets first

### Openshift Variables

You will need to create RESTIC_PASSWORD and ROCKETCHAT_WEBHOOK OpenShift secrets matching the implementation in the cron job template

```
env:
  - name: RESTIC_PASSWORD
    valueFrom:
      secretKeyRef:
        key: RESTIC_PASSWORD
        name: minio-access-parameters-${NAME_SUFFIX}
env:
  - name: ROCKETCHAT_WEBHOOK
    valueFrom:
      secretKeyRef:
        key: ROCKETCHAT_WEBHOOK
        name: minio-rocketchat-webhook-${NAME_SUFFIX}
```

### Backup PVC

In this implementation we are using NFS storage called minio-esm-test-backup. You will have to make an nfs storage type pvc for your backups that is a bit larger than your minio pvc. Restic keeps track of changed files on this scedule:

```
restic -r /mnt/dest/epic-documents forget --keep-daily 7 --keep-weekly 5 --keep-monthly 12 --keep-yearly 10 --prune
```

you can change this in the entrypoint.sh file.

### Manual Setup

#### Build in tools namespace:
```
oc process -f minio-backup.bc.yaml | oc create -f -
```

#### Deploy in test/ prod:
```
oc process -f minio-backup.cj.yaml NAME_SUFFIX='test' NAMESPACE='esm-test' TOOLS_NAMESPACE='esm' DEST_PVC='minio-esm-test-backup' SOURCE_PVC='minio-esm-test-data-gf' | oc create -f -
```

you can also specify the chron schedule here using the 'SCHEDULE' param.