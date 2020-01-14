# S3/ minio document backup

This job connects to a PVC containing files to backup and makes a copy to a second PVC. It then syncs the files to NFS storage using restic (see https://restic.net/).

This leaves 3 copies of the data:  the original (in-use) PVC that is mounted by the minio service,
a backup PVC in the cluster that is only mounted by the backup job pods during backup (e.g. minio-esm-test-backup), and the provisioned NFS storage (restic repository).

## Setup

you can either deploy this manually or in a jenkins pipeline. Either way you will need to setup the following OpenShift secrets

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

you can also specify the schedule here.

### Example usage in Jenkins pipeline:

```groovy
def docBackupCronjob = openshift.process("-f",
    "openshift/jobs/minio-backup.cj.yaml",

    // values for the environment that this job will run in
    "NAME_SUFFIX=${prodSuffix}",
    "NAMESPACE=${prodProject}",

    // this is the backup image version created by the build config in this folder (minio-backup.bc.yaml)
    "VERSION=v1.0.0",
    "SCHEDULE='15 12 * * *'",

    // the name of the target backup PVC for the restic repository.  This will be the 3rd backup.
    // the 2nd backup will be a PVC created by the minio-backup.cj.yaml template.
    // epic uses a provisioned NFS storage claim for this value.
    "DEST_PVC=${backupPVC}",
    "SOURCE_PVC=${minioDataPVC}", // the name of the minio data PVC
    "PVC_SIZE=40Gi" // you may need enough space to hold a few copies of files on-disk.
)
```

## Restore

see the minio-restore folder in this directory