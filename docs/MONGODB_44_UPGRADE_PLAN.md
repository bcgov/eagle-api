# MongoDB 4.4 Production Upgrade Plan

**Created**: January 13, 2026  
**Target Environment**: 6cdc9e-prod  
**Estimated Downtime**: 2-3 hours  

## Executive Summary

This document provides step-by-step instructions to upgrade MongoDB in production from version 3.6 to 4.4. The upgrade must be performed sequentially through intermediate versions (3.6 → 4.0 → 4.2 → 4.4) as MongoDB does not support skipping major versions.

---

## Current State Assessment

### Production Environment (6cdc9e-prod)
| Property | Value |
|----------|-------|
| MongoDB Version | 3.6 |
| Image | `openshift/mongodb:3.6` |
| featureCompatibilityVersion | 3.6 |
| Database Name | epic |
| Collections | 21 |
| Objects | ~38.4 million |
| Data Size | ~8.5 GB (uncompressed) |
| Storage Size | ~1.7 GB (compressed with WiredTiger) |
| Index Size | ~907 MB |
| PVC Name | eagle-api-mongodb-data |
| PVC Size | 10 GB |
| PVC Used | ~3.1 GB |

### Test Environment (6cdc9e-test) - Reference
| Property | Value |
|----------|-------|
| MongoDB Version | 4.4.30 |
| Image | `6cdc9e-tools/mongodb-44:4.4.30` |
| Status | Successfully upgraded |

### Available Images in 6cdc9e-tools
| ImageStream | Tag | Notes |
|-------------|-----|-------|
| mongodb-40 | 4.0.28 | Intermediate upgrade step |
| mongodb-42 | 4.2.24 | Intermediate upgrade step |
| mongodb-44 | 4.4.30 | Final target version |

---

## Prerequisites

Before starting the upgrade, verify the following:

1. **OpenShift Access**: You have `oc` CLI access with admin privileges to `6cdc9e-prod`
2. **Backup Verified**: A recent backup exists and has been tested for restoration
3. **Maintenance Window**: Scheduled and communicated to stakeholders
4. **Rollback Plan**: Backup restoration procedure is documented and tested

### Verify Prerequisites Commands

```bash
# Set project context
oc project 6cdc9e-prod

# Verify you can access MongoDB
oc get dc eagle-api-mongodb

# Verify images exist in tools namespace
oc get is -n 6cdc9e-tools | grep mongodb

# Expected output should include:
# mongodb-40, mongodb-42, mongodb-44

# Check current featureCompatibilityVersion (should be "3.6")
oc exec $(oc get pods -l name=eagle-api-mongodb -o jsonpath='{.items[0].metadata.name}') -- mongo admin \
  -u admin --password=$(oc get secret eagle-api-mongodb -o jsonpath='{.data.MONGODB_ADMIN_PASSWORD}' | base64 -d) \
  --eval 'db.adminCommand({getParameter: 1, featureCompatibilityVersion: 1})'
```

---

## Upgrade Procedure

### Phase 0: Pre-Upgrade Backup

**CRITICAL: Do not skip this step.**

```bash
# Set project
oc project 6cdc9e-prod

# Check for existing backup cronjob
oc get cronjob | grep backup

# Trigger a manual backup before upgrade
oc create job --from=cronjob/eagle-api-mongodb-backup mongodb-backup-pre-upgrade-$(date +%Y%m%d)

# Wait for backup job to complete
oc get jobs -w | grep mongodb-backup-pre-upgrade

# Verify backup completed successfully (should show 1/1 COMPLETIONS)
oc get jobs | grep mongodb-backup-pre-upgrade
```

### Phase 1: Scale Down Application

```bash
# Set project
oc project 6cdc9e-prod

# Record current replica count (should be 1)
oc get dc eagle-api -o jsonpath='{.spec.replicas}'

# Scale down the API to prevent database connections during upgrade
oc scale dc eagle-api --replicas=0

# Wait for API pods to terminate completely
oc get pods -l name=eagle-api -w

# Verify no API pods are running
oc get pods -l name=eagle-api
# Expected: "No resources found"
```

### Phase 2: Upgrade to MongoDB 4.0

```bash
# Set project
oc project 6cdc9e-prod

# Update the image trigger to use MongoDB 4.0
oc patch dc eagle-api-mongodb --type='json' -p='[
  {"op": "replace", "path": "/spec/triggers/0/imageChangeParams/from", "value": {
    "kind": "ImageStreamTag",
    "name": "mongodb-40:4.0.28",
    "namespace": "6cdc9e-tools"
  }}
]'

# Wait for rollout to complete
oc rollout status dc/eagle-api-mongodb

# Verify MongoDB version is 4.0.x
oc exec $(oc get pods -l name=eagle-api-mongodb -o jsonpath='{.items[0].metadata.name}') -- mongo --version
# Expected: "MongoDB shell version v4.0.28"

# Set featureCompatibilityVersion to 4.0
oc exec $(oc get pods -l name=eagle-api-mongodb -o jsonpath='{.items[0].metadata.name}') -- mongo admin \
  -u admin --password=$(oc get secret eagle-api-mongodb -o jsonpath='{.data.MONGODB_ADMIN_PASSWORD}' | base64 -d) \
  --eval 'db.adminCommand({setFeatureCompatibilityVersion: "4.0"})'
# Expected: { "ok" : 1 }

# Verify featureCompatibilityVersion is now 4.0
oc exec $(oc get pods -l name=eagle-api-mongodb -o jsonpath='{.items[0].metadata.name}') -- mongo admin \
  -u admin --password=$(oc get secret eagle-api-mongodb -o jsonpath='{.data.MONGODB_ADMIN_PASSWORD}' | base64 -d) \
  --eval 'db.adminCommand({getParameter: 1, featureCompatibilityVersion: 1})'
# Expected: { "featureCompatibilityVersion" : { "version" : "4.0" }, "ok" : 1 }

# Verify database is accessible
oc exec $(oc get pods -l name=eagle-api-mongodb -o jsonpath='{.items[0].metadata.name}') -- mongo epic \
  -u admin --password=$(oc get secret eagle-api-mongodb -o jsonpath='{.data.MONGODB_ADMIN_PASSWORD}' | base64 -d) \
  --authenticationDatabase admin --eval 'db.stats().objects'
# Expected: Should return ~38378047 (object count)
```

### Phase 3: Upgrade to MongoDB 4.2

```bash
# Set project
oc project 6cdc9e-prod

# Update the image trigger to use MongoDB 4.2
oc patch dc eagle-api-mongodb --type='json' -p='[
  {"op": "replace", "path": "/spec/triggers/0/imageChangeParams/from", "value": {
    "kind": "ImageStreamTag",
    "name": "mongodb-42:4.2.24",
    "namespace": "6cdc9e-tools"
  }}
]'

# Wait for rollout to complete
oc rollout status dc/eagle-api-mongodb

# Verify MongoDB version is 4.2.x
oc exec $(oc get pods -l name=eagle-api-mongodb -o jsonpath='{.items[0].metadata.name}') -- mongo --version
# Expected: "MongoDB shell version v4.2.24"

# Set featureCompatibilityVersion to 4.2
oc exec $(oc get pods -l name=eagle-api-mongodb -o jsonpath='{.items[0].metadata.name}') -- mongo admin \
  -u admin --password=$(oc get secret eagle-api-mongodb -o jsonpath='{.data.MONGODB_ADMIN_PASSWORD}' | base64 -d) \
  --eval 'db.adminCommand({setFeatureCompatibilityVersion: "4.2"})'
# Expected: { "ok" : 1 }

# Verify featureCompatibilityVersion is now 4.2
oc exec $(oc get pods -l name=eagle-api-mongodb -o jsonpath='{.items[0].metadata.name}') -- mongo admin \
  -u admin --password=$(oc get secret eagle-api-mongodb -o jsonpath='{.data.MONGODB_ADMIN_PASSWORD}' | base64 -d) \
  --eval 'db.adminCommand({getParameter: 1, featureCompatibilityVersion: 1})'
# Expected: { "featureCompatibilityVersion" : { "version" : "4.2" }, "ok" : 1 }

# Verify database is accessible
oc exec $(oc get pods -l name=eagle-api-mongodb -o jsonpath='{.items[0].metadata.name}') -- mongo epic \
  -u admin --password=$(oc get secret eagle-api-mongodb -o jsonpath='{.data.MONGODB_ADMIN_PASSWORD}' | base64 -d) \
  --authenticationDatabase admin --eval 'db.stats().objects'
```

### Phase 4: Upgrade to MongoDB 4.4 (Final)

```bash
# Set project
oc project 6cdc9e-prod

# Update the image trigger to use MongoDB 4.4
oc patch dc eagle-api-mongodb --type='json' -p='[
  {"op": "replace", "path": "/spec/triggers/0/imageChangeParams/from", "value": {
    "kind": "ImageStreamTag",
    "name": "mongodb-44:4.4.30",
    "namespace": "6cdc9e-tools"
  }}
]'

# Wait for rollout to complete
oc rollout status dc/eagle-api-mongodb

# Verify MongoDB version is 4.4.x
oc exec $(oc get pods -l name=eagle-api-mongodb -o jsonpath='{.items[0].metadata.name}') -- mongo --version
# Expected: "MongoDB shell version v4.4.30"

# Set featureCompatibilityVersion to 4.4
oc exec $(oc get pods -l name=eagle-api-mongodb -o jsonpath='{.items[0].metadata.name}') -- mongo admin \
  -u admin --password=$(oc get secret eagle-api-mongodb -o jsonpath='{.data.MONGODB_ADMIN_PASSWORD}' | base64 -d) \
  --eval 'db.adminCommand({setFeatureCompatibilityVersion: "4.4"})'
# Expected: { "ok" : 1 }

# Verify featureCompatibilityVersion is now 4.4
oc exec $(oc get pods -l name=eagle-api-mongodb -o jsonpath='{.items[0].metadata.name}') -- mongo admin \
  -u admin --password=$(oc get secret eagle-api-mongodb -o jsonpath='{.data.MONGODB_ADMIN_PASSWORD}' | base64 -d) \
  --eval 'db.adminCommand({getParameter: 1, featureCompatibilityVersion: 1})'
# Expected: { "featureCompatibilityVersion" : { "version" : "4.4" }, "ok" : 1 }

# Verify database is accessible and data intact
oc exec $(oc get pods -l name=eagle-api-mongodb -o jsonpath='{.items[0].metadata.name}') -- mongo epic \
  -u admin --password=$(oc get secret eagle-api-mongodb -o jsonpath='{.data.MONGODB_ADMIN_PASSWORD}' | base64 -d) \
  --authenticationDatabase admin --eval 'db.stats()'
```

### Phase 5: Bring Application Back Online

```bash
# Set project
oc project 6cdc9e-prod

# Scale up the API
oc scale dc eagle-api --replicas=1

# Wait for API pod to be ready
oc rollout status dc/eagle-api

# Verify API pod is running
oc get pods -l name=eagle-api
# Expected: 1/1 Running

# Test API health endpoint
curl -s https://projects.eao.gov.bc.ca/api/public/project | head -c 200

# Test search functionality
curl -s "https://projects.eao.gov.bc.ca/api/public/search?dataset=Project" | jq '.length'
```

### Phase 6: Post-Upgrade Verification

```bash
# Set project
oc project 6cdc9e-prod

# Create post-upgrade backup
oc create job --from=cronjob/eagle-api-mongodb-backup mongodb-backup-post-upgrade-$(date +%Y%m%d)

# Check API logs for any errors
oc logs $(oc get pods -l name=eagle-api -o jsonpath='{.items[0].metadata.name}') --tail=50

# Verify MongoDB logs
oc logs $(oc get pods -l name=eagle-api-mongodb -o jsonpath='{.items[0].metadata.name}') --tail=50
```

---

## Rollback Procedure

**Use this only if the upgrade fails and the application is not functioning.**

### Option A: Rollback to Previous Version (Data Compatible)

If the issue is with the new MongoDB binary but data is intact:

```bash
# Set project
oc project 6cdc9e-prod

# Scale down API
oc scale dc eagle-api --replicas=0

# Determine which version to roll back to based on current featureCompatibilityVersion
# If FCV is 4.2, roll back to mongodb-42
# If FCV is 4.0, roll back to mongodb-40
# If FCV is 3.6, roll back to openshift/mongodb:3.6

# Example: Roll back to 4.2 if upgrade to 4.4 failed
oc patch dc eagle-api-mongodb --type='json' -p='[
  {"op": "replace", "path": "/spec/triggers/0/imageChangeParams/from", "value": {
    "kind": "ImageStreamTag",
    "name": "mongodb-42:4.2.24",
    "namespace": "6cdc9e-tools"
  }}
]'

# Wait for rollout
oc rollout status dc/eagle-api-mongodb

# Scale up API
oc scale dc eagle-api --replicas=1
```

### Option B: Full Restore from Backup

If data is corrupted and needs to be restored:

```bash
# Set project
oc project 6cdc9e-prod

# Scale down everything
oc scale dc eagle-api --replicas=0
oc scale dc eagle-api-mongodb --replicas=0

# Wait for pods to terminate
oc get pods -l name=eagle-api-mongodb -w

# Revert to original MongoDB 3.6 image
oc patch dc eagle-api-mongodb --type='json' -p='[
  {"op": "replace", "path": "/spec/triggers/0/imageChangeParams/from", "value": {
    "kind": "ImageStreamTag",
    "name": "mongodb:3.6",
    "namespace": "openshift"
  }}
]'

# NOTE: At this point you need to restore the data from backup
# The backup restoration process depends on your backup job configuration
# Typically involves:
# 1. Start a temporary pod with access to both backup PVC and data PVC
# 2. Delete contents of data PVC
# 3. Copy backup to data PVC
# 4. Start MongoDB

# Scale up MongoDB
oc scale dc eagle-api-mongodb --replicas=1
oc rollout status dc/eagle-api-mongodb

# Verify featureCompatibilityVersion matches the restored backup
oc exec $(oc get pods -l name=eagle-api-mongodb -o jsonpath='{.items[0].metadata.name}') -- mongo admin \
  -u admin --password=$(oc get secret eagle-api-mongodb -o jsonpath='{.data.MONGODB_ADMIN_PASSWORD}' | base64 -d) \
  --eval 'db.adminCommand({getParameter: 1, featureCompatibilityVersion: 1})'

# Scale up API
oc scale dc eagle-api --replicas=1
```

---

## Troubleshooting

### MongoDB Pod Not Starting

```bash
# Check pod status
oc get pods -l name=eagle-api-mongodb

# Check pod events
oc describe pod $(oc get pods -l name=eagle-api-mongodb -o jsonpath='{.items[0].metadata.name}')

# Check pod logs
oc logs $(oc get pods -l name=eagle-api-mongodb -o jsonpath='{.items[0].metadata.name}')
```

### featureCompatibilityVersion Command Fails

If you get an error setting featureCompatibilityVersion, check:

1. MongoDB is fully started (check logs)
2. You're using the correct admin credentials
3. The target version is valid for the current binary

```bash
# Check MongoDB startup complete
oc logs $(oc get pods -l name=eagle-api-mongodb -o jsonpath='{.items[0].metadata.name}') | grep "waiting for connections"
```

### API Cannot Connect to MongoDB

```bash
# Check MongoDB is accepting connections
oc exec $(oc get pods -l name=eagle-api-mongodb -o jsonpath='{.items[0].metadata.name}') -- mongo admin \
  -u admin --password=$(oc get secret eagle-api-mongodb -o jsonpath='{.data.MONGODB_ADMIN_PASSWORD}' | base64 -d) \
  --eval 'db.runCommand({ping: 1})'

# Check service exists
oc get svc eagle-api-mongodb

# Check API environment variables
oc get dc eagle-api -o jsonpath='{.spec.template.spec.containers[0].env}' | jq '.[] | select(.name | startswith("MONGODB"))'
```

---

## Success Criteria

The upgrade is considered successful when:

- [ ] MongoDB version reports 4.4.30
- [ ] featureCompatibilityVersion is set to "4.4"
- [ ] API pods are running (1/1 Ready)
- [ ] Public search endpoint returns results
- [ ] No errors in MongoDB logs
- [ ] No errors in API logs
- [ ] Post-upgrade backup completed successfully

---

## References

- [MongoDB 4.0 Upgrade Guide](https://www.mongodb.com/docs/v4.0/release-notes/4.0-upgrade-standalone/)
- [MongoDB 4.2 Upgrade Guide](https://www.mongodb.com/docs/v4.2/release-notes/4.2-upgrade-standalone/)
- [MongoDB 4.4 Upgrade Guide](https://www.mongodb.com/docs/v4.4/release-notes/4.4-upgrade-standalone/)
- [featureCompatibilityVersion Documentation](https://www.mongodb.com/docs/manual/reference/command/setFeatureCompatibilityVersion/)
