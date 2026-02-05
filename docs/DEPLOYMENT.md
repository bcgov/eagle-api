# Deployment Guide - EPIC Platform

## Overview

The EPIC platform uses a **multi-environment deployment strategy** with separate OpenShift namespaces for tools, development, test, and production. Deployments are automated through GitHub Actions workflows that build Docker images, push to OpenShift's internal registry, and deploy using Helm charts or DeploymentConfigs.

## OpenShift Infrastructure

### Namespaces (License Plate: 6cdc9e)

The platform operates across **4 OpenShift namespaces**:

| Namespace | Purpose | Trigger | Image Tag |
|-----------|---------|---------|-----------|
| **6cdc9e-tools** | Build configurations, ImageStreams, CI/CD | - | `latest` |
| **6cdc9e-dev** | Development environment | Push to `develop` branch | `dev` |
| **6cdc9e-test** | QA/Testing environment | Push to `promotion/test` branch | `test` |
| **6cdc9e-prod** | Production environment | Push to `promotion/prod` branch | `prod` |

### Cluster Information

- **Platform**: OpenShift 4.14+ (Silver cluster)
- **Domain**: `apps.silver.devops.gov.bc.ca`
- **Registry**: `image-registry.openshift-image-registry.svc:5000`
- **Routes**:
  - Dev: `https://eagle-dev.apps.silver.devops.gov.bc.ca`
  - Test: `https://eagle-test.apps.silver.devops.gov.bc.ca`
  - Prod: `https://eagle.gov.bc.ca`

## Deployment Architecture

```
┌──────────────────────────────────────────────────────────────┐
│  GitHub Repository                                           │
│    - Source code                                             │
│    - Dockerfile                                              │
│    - Helm charts                                             │
│    - GitHub Actions workflows                                │
└──────────────────────────────────────────────────────────────┘
                            │
                            │ git push to develop/promotion/*
                            ▼
┌──────────────────────────────────────────────────────────────┐
│  GitHub Actions (CI/CD)                                      │
│    1. Build Docker image                                     │
│    2. Tag: <sha>, dev/test/prod, latest                      │
│    3. Push to OpenShift registry                             │
│    4. Deploy via Helm or oc rollout                          │
└──────────────────────────────────────────────────────────────┘
                            │
                            │ Image pushed
                            ▼
┌──────────────────────────────────────────────────────────────┐
│  OpenShift Registry (6cdc9e-tools)                           │
│    - ImageStreams for all services                           │
│    - Tags: latest, dev, test, prod, <sha>                    │
└──────────────────────────────────────────────────────────────┘
                            │
                            │ ImageStream tag updated
                            ▼
┌──────────────────────────────────────────────────────────────┐
│  OpenShift Deployment (6cdc9e-dev/test/prod)                │
│    - DeploymentConfig or Deployment (via Helm)               │
│    - Auto-triggers on ImageStream change                     │
│    - Rolling update strategy                                 │
└──────────────────────────────────────────────────────────────┘
```

## GitHub Actions CI/CD Pipeline

### Workflow Overview

Each service repository contains GitHub Actions workflows:

1. **build_and_promote.yaml** - Build and deploy to dev
2. **deploy-to-test.yaml** - Promote to test
3. **deploy-to-prod.yaml** - Promote to prod

### Example: eagle-public Deployment

**File**: `.github/workflows/build_and_promote.yaml`

```yaml
name: Build and Deploy to Dev

on:
  push:
    branches:
      - develop
  workflow_dispatch:

env:
  OPENSHIFT_SERVER: ${{ secrets.OPENSHIFT_SERVER }}
  OPENSHIFT_TOKEN: ${{ secrets.OPENSHIFT_TOKEN }}
  NAMESPACE_TOOLS: 6cdc9e-tools
  NAMESPACE_DEV: 6cdc9e-dev
  IMAGE_NAME: eagle-public
  REGISTRY: image-registry.openshift-image-registry.svc:5000

jobs:
  build-and-deploy:
    runs-on: ubuntu-latest
    steps:
      - name: Checkout code
        uses: actions/checkout@v4

      - name: Log in to OpenShift
        run: |
          oc login --token=${{ secrets.OPENSHIFT_TOKEN }} \
                   --server=${{ secrets.OPENSHIFT_SERVER }}

      - name: Build Docker image
        run: |
          SHORT_SHA=$(git rev-parse --short HEAD)
          docker build -t $IMAGE_NAME:$SHORT_SHA .
          
      - name: Tag image
        run: |
          SHORT_SHA=$(git rev-parse --short HEAD)
          docker tag $IMAGE_NAME:$SHORT_SHA \
            $REGISTRY/$NAMESPACE_TOOLS/$IMAGE_NAME:$SHORT_SHA
          docker tag $IMAGE_NAME:$SHORT_SHA \
            $REGISTRY/$NAMESPACE_TOOLS/$IMAGE_NAME:dev
          docker tag $IMAGE_NAME:$SHORT_SHA \
            $REGISTRY/$NAMESPACE_TOOLS/$IMAGE_NAME:latest

      - name: Push to OpenShift registry
        run: |
          docker login -u $(oc whoami) -p $(oc whoami -t) $REGISTRY
          docker push $REGISTRY/$NAMESPACE_TOOLS/$IMAGE_NAME:$SHORT_SHA
          docker push $REGISTRY/$NAMESPACE_TOOLS/$IMAGE_NAME:dev
          docker push $REGISTRY/$NAMESPACE_TOOLS/$IMAGE_NAME:latest

      - name: Deploy to dev via Helm
        run: |
          helm upgrade --install eagle-public ./helm/eagle-public \
            --namespace $NAMESPACE_DEV \
            --values ./helm/eagle-public/values-dev.yaml \
            --set images.public.tag=$(git rev-parse --short HEAD) \
            --wait --timeout=5m
```

### Promotion Workflow (Test)

**File**: `.github/workflows/deploy-to-test.yaml`

```yaml
name: Promote to Test

on:
  push:
    branches:
      - promotion/test
  workflow_dispatch:

jobs:
  promote-to-test:
    runs-on: ubuntu-latest
    steps:
      - name: Checkout code
        uses: actions/checkout@v4

      - name: Read commit SHA from promotion file
        id: get_sha
        run: |
          SHA=$(cat .promotion-commit)
          echo "commit_sha=$SHA" >> $GITHUB_OUTPUT

      - name: Log in to OpenShift
        run: |
          oc login --token=${{ secrets.OPENSHIFT_TOKEN }} \
                   --server=${{ secrets.OPENSHIFT_SERVER }}

      - name: Tag image for test
        run: |
          oc tag 6cdc9e-tools/eagle-public:${{ steps.get_sha.outputs.commit_sha }} \
                 6cdc9e-tools/eagle-public:test

      - name: Deploy to test
        run: |
          helm upgrade --install eagle-public ./helm/eagle-public \
            --namespace 6cdc9e-test \
            --values ./helm/eagle-public/values-test.yaml \
            --set images.public.tag=test \
            --wait --timeout=5m
```

### Promotion Workflow (Production)

**File**: `.github/workflows/deploy-to-prod.yaml`

```yaml
name: Promote to Production

on:
  push:
    branches:
      - promotion/prod
  workflow_dispatch:

jobs:
  promote-to-prod:
    runs-on: ubuntu-latest
    environment: production  # Requires approval
    steps:
      # Similar to test, but deploys to 6cdc9e-prod
      - name: Tag image for prod
        run: |
          oc tag 6cdc9e-tools/eagle-public:${{ steps.get_sha.outputs.commit_sha }} \
                 6cdc9e-tools/eagle-public:prod

      - name: Deploy to production
        run: |
          helm upgrade --install eagle-public ./helm/eagle-public \
            --namespace 6cdc9e-prod \
            --values ./helm/eagle-public/values-prod.yaml \
            --set images.public.tag=prod \
            --wait --timeout=10m
```

## Helm Chart Structure

### Chart Organization

```
helm/
└── eagle-public/
    ├── Chart.yaml              # Chart metadata
    ├── values.yaml             # Default values
    ├── values-dev.yaml         # Dev overrides
    ├── values-test.yaml        # Test overrides
    ├── values-prod.yaml        # Prod overrides
    └── templates/
        ├── deployment.yaml     # Deployment/DeploymentConfig
        ├── service.yaml        # Service
        ├── route.yaml          # OpenShift Route
        ├── configmap.yaml      # ConfigMap (optional)
        └── secret.yaml         # Secret (optional)
```

### values.yaml (Default)

```yaml
namespace: 6cdc9e-dev
nameOverride: eagle-public
fullnameOverride: eagle-public

images:
  public:
    registry: image-registry.openshift-image-registry.svc:5000/6cdc9e-tools
    name: eagle-public
    tag: dev
    pullPolicy: Always

replicas: 2

resources:
  limits:
    cpu: 500m
    memory: 512Mi
  requests:
    cpu: 100m
    memory: 256Mi

service:
  port: 8080
  targetPort: 8080

route:
  host: eagle-dev.apps.silver.devops.gov.bc.ca
  path: /
  tls:
    termination: edge
    insecureEdgeTerminationPolicy: Redirect

env:
  - name: LOG_LEVEL
    value: "0"
```

### values-prod.yaml (Production Overrides)

```yaml
namespace: 6cdc9e-prod

images:
  public:
    tag: prod

replicas: 3  # More replicas for production

resources:
  limits:
    cpu: 2000m
    memory: 2Gi
  requests:
    cpu: 500m
    memory: 1Gi

route:
  host: eagle.gov.bc.ca
  path: /

# Additional production-specific config
livenessProbe:
  initialDelaySeconds: 60
  periodSeconds: 30

readinessProbe:
  initialDelaySeconds: 30
  periodSeconds: 10
```

## Manual Deployment

### Prerequisites

```bash
# Install OpenShift CLI
# See: https://docs.openshift.com/container-platform/4.14/cli_reference/openshift_cli/getting-started-cli.html

# Install Helm
# See: https://helm.sh/docs/intro/install/

# Log in to OpenShift
oc login --token=<your-token> --server=https://api.silver.devops.gov.bc.ca:6443
```

### Deploy eagle-api

```bash
# Process DeploymentConfig template
oc process -f eagle-api/openshift/templates/eagle-api.dc.json \
  -p ENVIRONMENT=dev \
  -p API_LOCATION=https://eagle-dev.apps.silver.devops.gov.bc.ca \
  -p ANALYTICS_API_URL=/analytics \
  -p KEYCLOAK_URL=https://dev.loginproxy.gov.bc.ca/auth \
  -p IMAGE_TAG=dev \
  | oc apply -f - -n 6cdc9e-dev

# Wait for rollout
oc rollout status dc/eagle-api -n 6cdc9e-dev --timeout=300s
```

### Deploy eagle-public (Helm)

```bash
# Install or upgrade
helm upgrade --install eagle-public ./helm/eagle-public \
  --namespace 6cdc9e-dev \
  --values ./helm/eagle-public/values-dev.yaml \
  --set images.public.tag=dev \
  --wait --timeout=5m

# Check status
helm status eagle-public -n 6cdc9e-dev

# View deployed resources
helm get manifest eagle-public -n 6cdc9e-dev
```

### Deploy penguin-analytics (Helm)

```bash
cd penguin-analytics

helm upgrade --install penguin-analytics ./helm/penguin-analytics \
  --namespace 6cdc9e-dev \
  --values ./helm/penguin-analytics/values-dev.yaml \
  --wait --timeout=5m

# Verify database
oc exec -n 6cdc9e-dev deployment/penguin-analytics-db -- \
  psql -U postgres -d penguin_analytics -c "SELECT COUNT(*) FROM analytics_events;"
```

### Deploy rproxy

```bash
# Trigger build (if eao-nginx repo changed)
oc start-build rproxy -n 6cdc9e-tools --follow

# Tag for dev
oc tag 6cdc9e-tools/rproxy:latest 6cdc9e-tools/rproxy:dev

# Set environment variables
oc set env dc/rproxy \
  NGINX__EPIC__PROXY__ROOT=http://eagle-public:8080 \
  NGINX__EPIC__PROXY__API=http://eagle-api:3000 \
  NGINX__EPIC__PROXY__ADMIN=http://eagle-admin:8080 \
  NGINX__EPIC__PROXY__ANALYTICS=http://penguin-analytics-api:3001 \
  -n 6cdc9e-dev

# Wait for rollout
oc rollout status dc/rproxy -n 6cdc9e-dev --timeout=120s
```

## Environment Promotion

### Promotion Process

**Dev → Test**:
```bash
# 1. Get the commit SHA from a successful dev deployment
SHORT_SHA=$(git rev-parse --short HEAD)

# 2. Create promotion file
echo $SHORT_SHA > .promotion-commit

# 3. Commit and push to promotion/test branch
git checkout -b promotion/test
git add .promotion-commit
git commit -m "Promote $SHORT_SHA to test"
git push origin promotion/test

# GitHub Actions will automatically:
# - Read .promotion-commit
# - Tag image: 6cdc9e-tools/eagle-public:<sha> → 6cdc9e-tools/eagle-public:test
# - Deploy to 6cdc9e-test
```

**Test → Prod**:
```bash
# Similar process, but requires GitHub environment approval
git checkout -b promotion/prod
echo $SHORT_SHA > .promotion-commit
git add .promotion-commit
git commit -m "Promote $SHORT_SHA to prod"
git push origin promotion/prod

# GitHub Actions workflow triggers
# - Waits for "production" environment approval
# - Deploys to 6cdc9e-prod after approval
```

### Manual Image Promotion

```bash
# Dev → Test
oc tag 6cdc9e-tools/eagle-public:dev 6cdc9e-tools/eagle-public:test

# Test → Prod
oc tag 6cdc9e-tools/eagle-public:test 6cdc9e-tools/eagle-public:prod

# Specific SHA → Prod
oc tag 6cdc9e-tools/eagle-public:abc1234 6cdc9e-tools/eagle-public:prod
```

## Build Configurations

### Docker Build (GitHub Actions)

Most services use **Docker builds in GitHub Actions**:

```yaml
- name: Build Docker image
  run: docker build -t $IMAGE_NAME:$SHORT_SHA .

- name: Push to registry
  run: |
    docker login -u $(oc whoami) -p $(oc whoami -t) $REGISTRY
    docker push $REGISTRY/$NAMESPACE_TOOLS/$IMAGE_NAME:$SHORT_SHA
```

### OpenShift S2I Build (Legacy)

Some services use **Source-to-Image (S2I) builds** in OpenShift:

**File**: `eagle-api/openshift/templates/eagle-api.bc.json`

```json
{
  "kind": "BuildConfig",
  "metadata": {
    "name": "eagle-api"
  },
  "spec": {
    "source": {
      "type": "Git",
      "git": {
        "uri": "https://github.com/bcgov/eagle-api",
        "ref": "develop"
      }
    },
    "strategy": {
      "type": "Source",
      "sourceStrategy": {
        "from": {
          "kind": "ImageStreamTag",
          "name": "nodejs:20",
          "namespace": "openshift"
        }
      }
    },
    "output": {
      "to": {
        "kind": "ImageStreamTag",
        "name": "eagle-api:latest"
      }
    }
  }
}
```

**Trigger build**:
```bash
oc start-build eagle-api -n 6cdc9e-tools --follow
```

## Rollout Strategies

### Rolling Update (Default)

```yaml
# DeploymentConfig
strategy:
  type: Rolling
  rollingParams:
    updatePeriodSeconds: 1
    intervalSeconds: 1
    timeoutSeconds: 600
    maxUnavailable: 25%
    maxSurge: 25%
```

**Behavior**:
- New pods created before old pods terminated
- Zero-downtime deployment
- Gradual traffic shift to new version

### Recreate Strategy

```yaml
strategy:
  type: Recreate
```

**Behavior**:
- Old pods terminated before new pods created
- Brief downtime during deployment
- Use for services that can't run multiple versions simultaneously

### Blue-Green Deployment

```bash
# Create new deployment (green)
helm upgrade --install eagle-public-green ./helm/eagle-public \
  --namespace 6cdc9e-dev \
  --set images.public.tag=v2.0.0

# Test green deployment
curl https://eagle-public-green-6cdc9e-dev.apps.silver.devops.gov.bc.ca

# Switch route to green
oc patch route eagle-public -n 6cdc9e-dev \
  -p '{"spec":{"to":{"name":"eagle-public-green"}}}'

# Delete old deployment (blue)
helm uninstall eagle-public-blue -n 6cdc9e-dev
```

## Database Migrations

### eagle-api (MongoDB)

**File**: `eagle-api/migrations/`

```bash
# Run migrations manually
oc exec -n 6cdc9e-dev deployment/eagle-api -- \
  npm run migrate up

# Rollback migration
oc exec -n 6cdc9e-dev deployment/eagle-api -- \
  npm run migrate down

# View migration status
oc exec -n 6cdc9e-dev deployment/eagle-api -- \
  npm run migrate status
```

**Migration script** (example):
```javascript
// migrations/20260203-add-analytics-field.js
exports.up = async function(db) {
  await db.collection('projects').updateMany(
    {},
    { $set: { analyticsEnabled: true } }
  );
};

exports.down = async function(db) {
  await db.collection('projects').updateMany(
    {},
    { $unset: { analyticsEnabled: "" } }
  );
};
```

### penguin-analytics (TimescaleDB)

**File**: `penguin-analytics/db/init.sql`

```sql
-- Run migrations
oc exec -n 6cdc9e-dev deployment/penguin-analytics-db -- \
  psql -U postgres -d penguin_analytics -f /docker-entrypoint-initdb.d/init.sql
```

**Schema changes**:
```sql
-- Add new column
ALTER TABLE analytics_events ADD COLUMN device_type VARCHAR(50);

-- Create index
CREATE INDEX idx_device_type ON analytics_events(device_type, timestamp DESC);
```

## Health Checks and Monitoring

### Liveness Probe

```yaml
livenessProbe:
  httpGet:
    path: /health
    port: 8080
  initialDelaySeconds: 30
  periodSeconds: 10
  timeoutSeconds: 5
  failureThreshold: 3
```

**Behavior**: Restarts container if probe fails 3 times

### Readiness Probe

```yaml
readinessProbe:
  httpGet:
    path: /health
    port: 8080
  initialDelaySeconds: 5
  periodSeconds: 5
  timeoutSeconds: 3
  failureThreshold: 3
```

**Behavior**: Removes pod from service endpoints if not ready

### Check Deployment Status

```bash
# View pod status
oc get pods -n 6cdc9e-dev -l app=eagle-public

# View recent events
oc get events -n 6cdc9e-dev --sort-by='.lastTimestamp' | tail -20

# View pod logs
oc logs -n 6cdc9e-dev deployment/eagle-public --tail=100

# Follow logs
oc logs -n 6cdc9e-dev deployment/eagle-public -f

# Check rollout status
oc rollout status deployment/eagle-public -n 6cdc9e-dev
```

## Troubleshooting

### Deployment Fails

**Check image pull**:
```bash
oc describe pod -n 6cdc9e-dev <pod-name> | grep -A 10 Events
# Look for "ImagePullBackOff" or "ErrImagePull"

# Verify ImageStream tag exists
oc get imagestream eagle-public -n 6cdc9e-tools -o yaml | grep -A 5 tags
```

**Check resource limits**:
```bash
# View pod resource usage
oc adm top pods -n 6cdc9e-dev

# View node resource usage
oc adm top nodes
```

### Pod Crashes

**View crash logs**:
```bash
# Previous pod logs
oc logs -n 6cdc9e-dev <pod-name> --previous

# Describe pod for crash reason
oc describe pod -n 6cdc9e-dev <pod-name>
```

### Route Not Working

**Check route configuration**:
```bash
oc get route -n 6cdc9e-dev eagle-public -o yaml

# Test route
curl -I https://eagle-dev.apps.silver.devops.gov.bc.ca
```

### Database Connection Issues

**Check database pod**:
```bash
oc get pods -n 6cdc9e-dev -l app=mongodb
oc logs -n 6cdc9e-dev deployment/eagle-api-mongodb --tail=50

# Test connection from api pod
oc exec -n 6cdc9e-dev deployment/eagle-api -- \
  mongosh --host eagle-api-mongodb --port 27017 --eval "db.stats()"
```

### Environment Variables Not Applied

**Check pod environment**:
```bash
oc set env deployment/eagle-api --list -n 6cdc9e-dev

# Check specific pod
oc exec -n 6cdc9e-dev deployment/eagle-api -- env | grep API_LOCATION
```

## Rollback Procedures

### Rollback Deployment

```bash
# View rollout history
oc rollout history deployment/eagle-public -n 6cdc9e-dev

# Rollback to previous version
oc rollout undo deployment/eagle-public -n 6cdc9e-dev

# Rollback to specific revision
oc rollout undo deployment/eagle-public -n 6cdc9e-dev --to-revision=3
```

### Rollback via Image Tag

```bash
# Revert to previous working image
oc tag 6cdc9e-tools/eagle-public:abc1234 6cdc9e-tools/eagle-public:dev

# Deployment will auto-trigger on ImageStream change
```

### Rollback Database Migration

```bash
# MongoDB
oc exec -n 6cdc9e-dev deployment/eagle-api -- npm run migrate down

# PostgreSQL
oc exec -n 6cdc9e-dev deployment/penguin-analytics-db -- \
  psql -U postgres -d penguin_analytics -c "DROP TABLE new_table;"
```

## Best Practices

### 1. Tag Images Properly

✅ **DO**: Use semantic versioning and SHA tags
```bash
docker tag eagle-public:abc1234 eagle-public:v1.2.3
docker tag eagle-public:abc1234 eagle-public:dev
docker tag eagle-public:abc1234 eagle-public:latest
```

### 2. Test Before Promoting

✅ **DO**: Thoroughly test in dev/test before promoting to prod
- Run automated tests
- Manual QA verification
- Load testing (if applicable)

### 3. Use Health Checks

✅ **DO**: Implement `/health` endpoints for all services
```javascript
app.get('/health', (req, res) => {
  res.status(200).send('healthy');
});
```

### 4. Document Environment Variables

✅ **DO**: Keep environment variable documentation up-to-date
- See [CONFIGURATION.md](./CONFIGURATION.md)

### 5. Monitor Deployments

✅ **DO**: Watch logs during deployment
```bash
oc logs -n 6cdc9e-dev deployment/eagle-public -f
```

### 6. Backup Before Major Changes

✅ **DO**: Backup databases before schema migrations
```bash
# MongoDB backup
oc exec -n 6cdc9e-prod deployment/eagle-api-mongodb -- \
  mongodump --out=/tmp/backup-$(date +%Y%m%d)

# PostgreSQL backup
oc exec -n 6cdc9e-prod deployment/penguin-analytics-db -- \
  pg_dump -U postgres penguin_analytics > backup-$(date +%Y%m%d).sql
```

## Related Documentation

- [ARCHITECTURE.md](./ARCHITECTURE.md) - Platform architecture overview
- [CONFIGURATION.md](./CONFIGURATION.md) - Configuration management
- [ANALYTICS_ARCHITECTURE.md](./ANALYTICS_ARCHITECTURE.md) - Analytics deployment
- [GitHub Actions Documentation](https://docs.github.com/en/actions)
- [OpenShift Documentation](https://docs.openshift.com/)
- [Helm Documentation](https://helm.sh/docs/)
