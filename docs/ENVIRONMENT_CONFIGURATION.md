# Eagle-API Environment Configuration

## Overview

Eagle-API serves configuration to frontend applications (eagle-admin and eagle-public) via the `/api/config` endpoint. This endpoint returns environment-specific configuration that **overrides** the bundled `env.js` values in the frontend apps.

**Note**: Both eagle-admin and eagle-public use the same `/api/config` endpoint.

## Why This Matters

Frontend applications use a two-stage configuration system:

1. **Build-time**: `env.js` is bundled with `configEndpoint=true` (set by sed/Dockerfile)
2. **Runtime**: `ConfigService` fetches `/api/config` on app startup and **merges** (API wins)

This allows:
- **Single Docker image** for all environments (dev/test/prod)
- **Environment-specific configuration** without rebuilding
- **Dynamic configuration changes** without redeploying frontends

## Required Environment Variables

These environment variables **must** be set in eagle-api DeploymentConfig for each namespace:

### Core Configuration

| Variable | Purpose | Dev Value | Test Value | Prod Value |
|----------|---------|-----------|------------|------------|
| `ENVIRONMENT` | Environment name | `dev` | `test` | `prod` |
| `BANNER_COLOUR` | Frontend banner color | `red` | `green` | `` (none) |
| `ANALYTICS_API_URL` | Analytics endpoint | Full URL* | Full URL* | `/analytics` |

*Dev and Test use full penguin-analytics URLs (e.g., `https://penguin-analytics-api-6cdc9e-dev.apps.silver.devops.gov.bc.ca/analytics`) because there's no rproxy route for `/analytics`. Prod may use `/analytics` if rproxy is configured.

### Analytics Configuration (Optional)

| Variable | Purpose | Default | Notes |
|----------|---------|---------|-------|
| `ANALYTICS_DEBUG` | Enable analytics debug logging | `false` | Automatically `true` if `ENVIRONMENT != 'prod'` |

---

## Setting Environment Variables

### Via OpenShift CLI

**Dev Environment**:
```bash
oc set env dc/eagle-api \
  ENVIRONMENT=dev \
  BANNER_COLOUR=red \
  ANALYTICS_API_URL=https://penguin-analytics-api-6cdc9e-dev.apps.silver.devops.gov.bc.ca/analytics \
  -n 6cdc9e-dev
```

**Test Environment**:
```bash
oc set env dc/eagle-api \
  ENVIRONMENT=test \
  BANNER_COLOUR=green \
  ANALYTICS_API_URL=https://penguin-analytics-api-6cdc9e-test.apps.silver.devops.gov.bc.ca/analytics \
  -n 6cdc9e-test
```

**Prod Environment**:
```bash
oc set env dc/eagle-api \
  ENVIRONMENT=prod \
  BANNER_COLOUR= \
  ANALYTICS_API_URL=/analytics \
  -n 6cdc9e-prod
```

**Note**: Setting env vars triggers an automatic rollout.

---

### Via OpenShift Web Console

1. Navigate to: Workloads → DeploymentConfigs → eagle-api
2. Click "Environment" tab
3. Add/edit variables:
   - `ENVIRONMENT`: `test`
   - `BANNER_COLOUR`: `green`
   - `ANALYTICS_API_URL`: `/analytics`
4. Click "Save" (triggers rollout)

---

## Verification

### Check Current Environment Variables

```bash
# Dev
oc get dc eagle-api -n 6cdc9e-dev -o jsonpath='{.spec.template.spec.containers[0].env[*]}' | jq

# Test
oc get dc eagle-api -n 6cdc9e-test -o jsonpath='{.spec.template.spec.containers[0].env[*]}' | jq

# Prod
oc get dc eagle-api -n 6cdc9e-prod -o jsonpath='{.spec.template.spec.containers[0].env[*]}' | jq
```

### Test Config Endpoint

Both eagle-admin and eagle-public use the same endpoint:

```bash
# Dev
curl -s https://eagle-dev.apps.silver.devops.gov.bc.ca/api/config | jq

# Test  
curl -s https://test.projects.eao.gov.bc.ca/api/config | jq

# Prod
curl -s https://projects.eao.gov.bc.ca/api/config | jq
```

**Expected Response**:
```json
{
  "ENVIRONMENT": "test",
  "BANNER_COLOUR": "green",
  "API_LOCATION": "",
  "API_PATH": "/api",
  "API_PUBLIC_PATH": "/api/public",
  "ANALYTICS_API_URL": "/analytics",
  "ANALYTICS_DEBUG": true,
  "KEYCLOAK_CLIENT_ID": "eagle-admin-console",
  "KEYCLOAK_URL": "https://test.loginproxy.gov.bc.ca/auth",
  "KEYCLOAK_REALM": "eao-epic",
  "KEYCLOAK_ENABLED": true
}
```

---

## Configuration Controller Code

The configuration is served by `api/controllers/config.js`:

```javascript
exports.publicGetConfig = async function (args, res) {
  let configObj = {
    debugMode: process.env.DEBUG_MODE === 'true',
    ENVIRONMENT: process.env.ENVIRONMENT,
    BANNER_COLOUR: process.env.BANNER_COLOUR,
    API_LOCATION: process.env.API_LOCATION,
    API_PATH: process.env.API_PATH,
    API_PUBLIC_PATH: process.env.API_PUBLIC_PATH,
    ADMIN_PATH: process.env.ADMIN_PATH || '/admin/',
    KEYCLOAK_CLIENT_ID: process.env.KEYCLOAK_CLIENT_ID,
    KEYCLOAK_URL: process.env.KEYCLOAK_URL,
    KEYCLOAK_REALM: process.env.KEYCLOAK_REALM,
    KEYCLOAK_ENABLED: process.env.KEYCLOAK_ENABLED === 'true',
    // Analytics - default to /analytics (rproxy routes to penguin-analytics)
    ANALYTICS_API_URL: process.env.ANALYTICS_API_URL || '/analytics',
    ANALYTICS_DEBUG: process.env.ANALYTICS_DEBUG === 'true' || process.env.ENVIRONMENT !== 'prod',
    // Survey configuration
    SURVEY_URL: process.env.SURVEY_URL || null,
    SHOW_SURVEY_BANNER: process.env.SHOW_SURVEY_BANNER === 'true'
  };

  return Actions.sendResponse(res, 200, configObj);
};
```

**Key Points**:
- Values come directly from environment variables
- `ANALYTICS_DEBUG` automatically `true` unless `ENVIRONMENT=prod`
- `ADMIN_PATH` defaults to `/admin/` for eagle-public footer link

---

## Troubleshooting

### Issue: Frontend shows wrong environment or banner color

**Symptoms**:
- eagle-admin shows "dev" banner in test environment
- eagle-public has yellow banner instead of green
- Analytics not working

**Diagnosis**:
1. Check what `/api/config` returns:
   ```bash
   curl -s https://test.projects.eao.gov.bc.ca/api/config | jq
   ```

2. Check eagle-api environment variables:
   ```bash
   oc get dc eagle-api -n 6cdc9e-test -o jsonpath='{.spec.template.spec.containers[0].env[?(@.name=="ENVIRONMENT")].value}'
   ```

**Solution**:
- If `/api/config` returns wrong values: Set environment variables (see above)
- If env vars are set but not appearing: Verify eagle-api pods restarted:
  ```bash
  oc rollout latest dc/eagle-api -n 6cdc9e-test
  ```

---

### Issue: Analytics not working

**Symptoms**:
- Browser console: Network error on analytics POST
- eagle-admin/eagle-public not tracking events

**Diagnosis**:
1. Check `ANALYTICS_API_URL` in config:
   ```bash
   curl -s https://test.projects.eao.gov.bc.ca/api/config | jq -r '.ANALYTICS_API_URL'
   ```

2. Test analytics endpoint:
   ```bash
   curl -X POST https://test.projects.eao.gov.bc.ca/analytics \
     -H "Content-Type: application/json" \
     -d '{"eventType":"test","sessionId":"test123","sourceApp":"curl"}'
   ```

**Solution**:
- If `ANALYTICS_API_URL` is missing or wrong: Set environment variable:
  ```bash
  oc set env dc/eagle-api ANALYTICS_API_URL=/analytics -n 6cdc9e-test
  ```
- If analytics endpoint returns 404: Check penguin-analytics deployment (see penguin-analytics docs)
- If analytics endpoint returns 502: Check rproxy configuration and network policies

---

### Issue: Keycloak authentication failing

**Symptoms**:
- Login redirects to wrong URL
- "Invalid redirect URI" error
- Can't access eagle-admin

**Diagnosis**:
```bash
curl -s https://test.projects.eao.gov.bc.ca/api/config | jq -r '.KEYCLOAK_URL, .KEYCLOAK_REALM, .KEYCLOAK_CLIENT_ID'
```

**Solution**: Set correct Keycloak environment variables:

```bash
# Test
oc set env dc/eagle-api \
  KEYCLOAK_URL=https://test.loginproxy.gov.bc.ca/auth \
  KEYCLOAK_REALM=eao-epic \
  KEYCLOAK_CLIENT_ID=eagle-admin-console \
  -n 6cdc9e-test

# Prod
oc set env dc/eagle-api \
  KEYCLOAK_URL=https://loginproxy.gov.bc.ca/auth \
  KEYCLOAK_REALM=eao-epic \
  KEYCLOAK_CLIENT_ID=eagle-admin-console \
  -n 6cdc9e-prod
```

---

## Adding New Configuration Values

To add a new configuration value:

1. **Update config controller** (`api/controllers/config.js`):
   ```javascript
   exports.publicConfig = function (req, res) {
     const config = {
       // ... existing config ...
       
       // New value
       MY_NEW_FEATURE_URL: process.env.MY_NEW_FEATURE_URL || '/default-path'
     };
     res.status(200).json(config);
   };
   ```

2. **Set environment variable** in each namespace:
   ```bash
   oc set env dc/eagle-api MY_NEW_FEATURE_URL=/custom-path -n 6cdc9e-test
   ```

3. **Update frontend** to use the new value:
   ```typescript
   // In ConfigService or component
   const featureUrl = this.configService.config['MY_NEW_FEATURE_URL'];
   ```

4. **Update this documentation** with the new variable

---

## Environment Variable Checklist

Before deploying frontends to a new environment, ensure eagle-api has:

- [ ] `ENVIRONMENT` set to correct value (dev/test/prod)
- [ ] `BANNER_COLOUR` set appropriately
- [ ] `ANALYTICS_API_URL` set to `/analytics`
- [ ] `KEYCLOAK_URL` set to correct realm URL
- [ ] `KEYCLOAK_REALM` set (usually `eao-epic`)
- [ ] `KEYCLOAK_CLIENT_ID` set (usually `eagle-admin-console`)
- [ ] Config endpoint tested: `curl https://.../api/config | jq`
- [ ] Frontend tested: banner color, analytics, authentication

---

## Best Practices

1. **Set environment variables before deploying frontends** - prevents configuration issues
2. **Use `/analytics` for ANALYTICS_API_URL** - consistent across all environments
3. **Test config endpoint after changes** - verify eagle-api returns expected values
4. **Document new configuration values** - update this file when adding env vars
5. **Use environment-specific Keycloak URLs** - dev/test/prod have different realms
6. **Verify after rollouts** - check config endpoint after eagle-api redeploys
7. **Don't hardcode environment-specific URLs in frontends** - always use config endpoint
8. **Set ENVIRONMENT accurately** - affects ANALYTICS_DEBUG and other defaults
