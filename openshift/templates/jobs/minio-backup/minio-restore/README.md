# To Restore

## Build in the tools namespace (esm in this example)
```
oc process -f minio-restore.bc.yaml | oc create -f -
```

## Deploy in the namespace with the lost data (esm-test in this example)
```
oc process -f minio-restore.dc.yaml RESTIC_BACKUP_PVC='minio-esm-test-backup' MINIO_SOURCE_PVC='minio-esm-test-data-gf' SOURCE_IMAGE_NAME='epic-documents-restore' SOURCE_IMAGE_NAMESPACE='esm' TAG_NAME='latest' | oc create -f -
```
deploy and spin up a pod and then rsh into it.

## Restore from backup-restic
make sure you have enough room on the pvc mounted to  /mnt/source (NOTE: it is important that the PVC you intend to restore to is mounted to this directory, because the backups all have the folder structure /mnt/source/uploads/). From the root run:

```
restic restore -r ./mnt/backup/epic-documents --target . latest
```

input the password found in the openshift secret and wait for restore to complete (takes several minutes even with the high resource limits).

if you need to restore a backup from a backup that isn't 'latest' see https://restic.readthedocs.io/en/latest/index.html