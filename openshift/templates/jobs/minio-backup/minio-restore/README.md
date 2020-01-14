# To Restore

## Build in the tools namespace (esm in this example)
```
oc process -f minio-restore.bc.yaml | oc create -f -
```

## Deploy in the namespace with the lost data (esm-test in this example)
```
oc process -f minio-restore.dc.yaml RESTIC_BACKUP_PVC='minio-esm-test-backup' MINIO_SOURCE_PVC='minio-esm-test-data-gf' RSYNC_BACKUP_PVC='epic-documents-test-backup' SOURCE_IMAGE_NAME='epic-documents-restore' SOURCE_IMAGE_NAMESPACE='esm' TAG_NAME='latest' | oc create -f -
```
deploy and spin up a pod and then rsh into it.

## Backup from backup-rsync
if your rsync backup pvc still exists then you should do this

if you have your backup-rsync pvc running still, rsync the contents of the backup-rsync/documents/bk/uploads/ into your new minio pvc's uploads folder source-minio/uploads.

## Backup from backup-restic
make sure you have enough room on the pvc mounted to  /backup-rsync (after you create it). then run:

```
restic -r backup-restic/epic-documents restore latest --target backup-rsync
```

input the password found in the openshift secret and wait for restore to complete. After that locate the /uploads folder and rsync the contents onto the pvc mounted to /source-minio/uploads.

if you need to restore a backup from a previous backup see https://restic.readthedocs.io/en/latest/index.html