# MongoDB migrations autoation

This job will automatically execute the migration scripts found in the eagle-api migrations.

## Setup

you can either deploy this manually or in a jenkins pipeline. Either way you will need to setup the following OpenShift secrets

### Openshift Variables

You will need to create ??? and ROCKETCHAT_WEBHOOK OpenShift secrets matching the implementation in the cron job template

```
env:
  - name: ROCKETCHAT_WEBHOOK
    valueFrom:
      secretKeyRef:
        key: ROCKETCHAT_WEBHOOK
        name: minio-rocketchat-webhook-${NAME_SUFFIX}
```
### Manual Setup

#### Build in tools namespace:
```
oc process -f mongo-migrations.bc.yaml | oc create -f -
```

#### Deploy in test/ prod:
```
oc process -f mongo-migrations.cj.yaml NAME_SUFFIX='test' NAMESPACE='esm-test' TOOLS_NAMESPACE='esm' | oc create -f -
```

you can also specify the schedule here.

### Example usage in Jenkins pipeline:

```groovy
def docBackupCronjob = openshift.process("-f",
    "openshift/jobs/mongo-migrations.cj.yaml",

    // values for the environment that this job will run in
    "NAME_SUFFIX=${prodSuffix}",
    "NAMESPACE=${prodProject}",

    // this is the backup image version created by the build config in this folder (minio-backup.bc.yaml)
    "VERSION=v1.0.0",
    "SCHEDULE='15 12 * * *'",
)
```