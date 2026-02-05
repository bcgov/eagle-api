# Configuration Management - EPIC Platform

## Overview

The EPIC platform uses a **runtime configuration pattern** where frontend applications fetch configuration from the eagle-api backend at initialization time. This enables a single Docker image to be deployed across multiple environments (dev, test, prod) with different configurations.

## Configuration Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                Build Time (Docker Image)                     │
│                                                               │
│  Frontend:                                                   │
│    env.js (defaults)  ────┐                                 │
│    configEndpoint: true   │                                  │
│                           │                                  │
│  Backend:                 │                                  │
│    config.js (controller) │                                  │
└───────────────────────────┼───────────────────────────────────┘
                            │
┌───────────────────────────┼───────────────────────────────────┐
│                Runtime (OpenShift)                            │
│                           │                                   │
│  Environment Variables ───┼──→ DeploymentConfig              │
│    API_LOCATION           │                                   │
│    KEYCLOAK_URL           │                                   │
│    ANALYTICS_API_URL ─────┼──→ eagle-api pod                 │
│    etc.                   │                                   │
│                           │                                   │
│  eagle-api /api/config    │                                   │
│    Returns env vars ──────┘                                   │
│                                                               │
│  Frontend on startup:                                         │
│    1. Load env.js                                            │
│    2. HTTP GET /api/config                                   │
│    3. Merge configs (API overrides env.js)                   │
│    4. Initialize services                                     │
└─────────────────────────────────────────────────────────────┘
```

## ConfigService Pattern

### Frontend Implementation

Both `eagle-public` and `eagle-admin` use identical ConfigService patterns.

**File**: `eagle-public/src/app/services/config.service.ts`

```typescript
import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { lastValueFrom } from 'rxjs';

export interface Config {
  ENVIRONMENT: string;
  API_LOCATION: string;
  API_PATH: string;
  ANALYTICS_API_URL: string;
  KEYCLOAK_CLIENT_ID?: string;
  KEYCLOAK_URL?: string;
  KEYCLOAK_REALM?: string;
  BANNER_COLOUR?: string;
  logLevel: number;
  configEndpoint: boolean;
  // ... other config properties
}

@Injectable({
  providedIn: 'root'
})
export class ConfigService {
  private configuration: Config;
  private retryAttempts = 0;
  private maxRetries = 5;

  constructor(private http: HttpClient) {}

  /**
   * Initialize configuration at application startup
   * Called via APP_INITIALIZER provider
   */
  public async init(): Promise<void> {
    // Step 1: Load env.js (build-time defaults)
    this.configuration = (window as any).__env || {};
    console.log('Loaded env.js config:', this.configuration);

    // Step 2: If deployed (configEndpoint=true), fetch from API
    if (this.configuration.configEndpoint === true) {
      try {
        const apiConfig = await this.getConfigFromApi();
        // Merge: API values take precedence over env.js
        this.configuration = { ...this.configuration, ...apiConfig };
        console.log('Merged with API config:', this.configuration);
      } catch (error) {
        console.warn('Failed to load API config, using env.js defaults', error);
        // Fallback: Continue with env.js values
      }
    }

    // Step 3: Load additional data (lists, etc.)
    await this.loadListData();
  }

  /**
   * Fetch configuration from eagle-api /api/config endpoint
   * Implements exponential backoff retry logic
   */
  private async getConfigFromApi(): Promise<Partial<Config>> {
    const apiPath = this.configuration.API_LOCATION + this.configuration.API_PATH;
    const configUrl = `${apiPath}/config`;

    try {
      const config = await lastValueFrom(
        this.http.get<Partial<Config>>(configUrl)
      );
      this.retryAttempts = 0;  // Reset on success
      return config;
    } catch (error) {
      this.retryAttempts++;

      if (this.retryAttempts < this.maxRetries) {
        // Exponential backoff: 1s, 2s, 4s, 8s, 16s
        const delay = Math.pow(2, this.retryAttempts - 1) * 1000;
        console.warn(`Config fetch failed, retry ${this.retryAttempts}/${this.maxRetries} in ${delay}ms`);
        
        await new Promise(resolve => setTimeout(resolve, delay));
        return this.getConfigFromApi();  // Recursive retry
      }

      throw error;  // Max retries exceeded
    }
  }

  /**
   * Get current configuration object
   */
  public getConfig(): Config {
    return this.configuration;
  }

  /**
   * Get specific config value
   */
  public get<K extends keyof Config>(key: K): Config[K] {
    return this.configuration[key];
  }
}
```

### Application Bootstrap

**File**: `eagle-public/src/main.ts`

```typescript
import { ApplicationConfig, APP_INITIALIZER } from '@angular/core';
import { ConfigService } from './app/services/config.service';

export const appConfig: ApplicationConfig = {
  providers: [
    // ConfigService.init() runs before app starts
    {
      provide: APP_INITIALIZER,
      useFactory: (configService: ConfigService) => {
        return () => configService.init();
      },
      deps: [ConfigService],
      multi: true
    },
    // ... other providers
  ]
};

bootstrapApplication(AppComponent, appConfig)
  .catch(err => console.error(err));
```

**Initialization Flow**:
1. Angular app starts
2. `APP_INITIALIZER` runs `ConfigService.init()`
3. App waits for config to load (returns Promise)
4. Services can inject ConfigService and read config
5. App renders

## Build-Time Configuration (env.js)

### Local Development

**File**: `eagle-public/src/env.js`

```javascript
(function (window) {
  window.__env = window.__env || {};

  // Local development defaults
  window.__env.logLevel = 0;
  window.__env.configEndpoint = false;  // Don't fetch from API
  window.__env.ENVIRONMENT = 'local';
  window.__env.API_LOCATION = 'http://localhost:3000';
  window.__env.API_PATH = '/api/public';
  window.__env.ANALYTICS_API_URL = 'http://localhost:3001/analytics';
  
  // Keycloak (optional for local dev)
  window.__env.KEYCLOAK_CLIENT_ID = '';
  window.__env.KEYCLOAK_URL = '';
  window.__env.KEYCLOAK_REALM = '';
}(this));
```

**Usage**:
```bash
# Start local dev server
npm start
# Uses env.js configuration, no API fetch
```

### Production Build

**File**: `eagle-public/src/env.js` (production)

```javascript
(function (window) {
  window.__env = window.__env || {};

  // Production build: Fetch config from API
  window.__env.logLevel = 0;
  window.__env.configEndpoint = true;  // ← Enables runtime fetch
  
  // Minimal defaults (will be overridden by /api/config)
  window.__env.ENVIRONMENT = 'production';
  window.__env.API_LOCATION = '';
  window.__env.API_PATH = '/api/public';
}(this));
```

**Docker Build**:
```dockerfile
# Dockerfile
FROM node:20 AS builder
WORKDIR /app
COPY . .

# Build Angular app with production env.js
RUN npm ci && npm run build -- --configuration=production

FROM nginx:alpine
COPY --from=builder /app/dist/eagle-public /usr/share/nginx/html
# env.js is included in the bundle with configEndpoint=true
```

## Runtime Configuration (Backend)

### eagle-api Configuration Controller

**File**: `eagle-api/api/controllers/config.js`

```javascript
exports.publicGetConfig = async function (args, res, next) {
  const Actions = require('../helpers/actions');
  
  try {
    // Build config object from environment variables
    let configObj = {
      // Environment
      ENVIRONMENT: process.env.ENVIRONMENT || 'local',
      BANNER_COLOUR: process.env.BANNER_COLOUR || '',
      
      // API URLs
      API_LOCATION: process.env.API_LOCATION || 'http://localhost:3000',
      API_PATH: process.env.API_PATH || '/api',
      ADMIN_PATH: process.env.ADMIN_PATH || '/admin/',
      
      // Analytics
      ANALYTICS_API_URL: process.env.ANALYTICS_API_URL || '/analytics',
      
      // Keycloak SSO
      KEYCLOAK_CLIENT_ID: process.env.KEYCLOAK_CLIENT_ID || '',
      KEYCLOAK_URL: process.env.KEYCLOAK_URL || '',
      KEYCLOAK_REALM: process.env.KEYCLOAK_REALM || '',
      KEYCLOAK_ENABLED: process.env.KEYCLOAK_ENABLED === 'true',
      
      // Feature flags
      ENABLE_OBJECT_STORE: process.env.ENABLE_OBJECT_STORE === 'true',
      OBJECT_STORE_URL: process.env.OBJECT_STORE_URL || '',
      
      // External services
      GEOCODER_API: process.env.GEOCODER_API || '',
      
      // Misc
      DEBUG: process.env.DEBUG === 'true',
      logLevel: parseInt(process.env.LOG_LEVEL || '0', 10)
    };

    return Actions.sendResponse(res, 200, configObj);
  } catch (error) {
    return Actions.sendResponse(res, 500, { error: 'Failed to load configuration' });
  }
};
```

**Route**: `GET /api/config` (public, no authentication required)

### Environment Variables (OpenShift)

**DeploymentConfig**: `eagle-api/openshift/templates/eagle-api.dc.json`

```json
{
  "spec": {
    "template": {
      "spec": {
        "containers": [{
          "name": "eagle-api",
          "env": [
            {
              "name": "ENVIRONMENT",
              "value": "${ENVIRONMENT}"
            },
            {
              "name": "API_LOCATION",
              "value": "${API_LOCATION}"
            },
            {
              "name": "API_PATH",
              "value": "${API_PATH}"
            },
            {
              "name": "ANALYTICS_API_URL",
              "value": "${ANALYTICS_API_URL}"
            },
            {
              "name": "KEYCLOAK_CLIENT_ID",
              "value": "${KEYCLOAK_CLIENT_ID}"
            },
            {
              "name": "KEYCLOAK_URL",
              "value": "${KEYCLOAK_URL}"
            },
            {
              "name": "KEYCLOAK_REALM",
              "value": "${KEYCLOAK_REALM}"
            },
            {
              "name": "MONGODB_PASSWORD",
              "valueFrom": {
                "secretKeyRef": {
                  "name": "eagle-api-mongodb",
                  "key": "MONGODB_PASSWORD"
                }
              }
            }
          ]
        }]
      }
    }
  },
  "parameters": [
    {
      "name": "ENVIRONMENT",
      "displayName": "Environment Name",
      "description": "Environment name (dev, test, prod)",
      "value": "dev",
      "required": true
    },
    {
      "name": "API_LOCATION",
      "displayName": "API Location",
      "description": "Full URL to API",
      "value": "https://eagle-dev.apps.silver.devops.gov.bc.ca",
      "required": true
    },
    {
      "name": "ANALYTICS_API_URL",
      "displayName": "Analytics API URL",
      "description": "Path to analytics endpoint",
      "value": "/analytics",
      "required": false
    }
  ]
}
```

## Environment-Specific Configuration

### Development (6cdc9e-dev)

```bash
# Set environment variables
oc set env dc/eagle-api \
  ENVIRONMENT=dev \
  BANNER_COLOUR=orange \
  API_LOCATION=https://eagle-dev.apps.silver.devops.gov.bc.ca \
  API_PATH=/api \
  ANALYTICS_API_URL=/analytics \
  KEYCLOAK_CLIENT_ID=epic-dev \
  KEYCLOAK_URL=https://dev.loginproxy.gov.bc.ca/auth \
  KEYCLOAK_REALM=eao-epic \
  -n 6cdc9e-dev
```

**Response from /api/config**:
```json
{
  "ENVIRONMENT": "dev",
  "BANNER_COLOUR": "orange",
  "API_LOCATION": "https://eagle-dev.apps.silver.devops.gov.bc.ca",
  "API_PATH": "/api",
  "ANALYTICS_API_URL": "/analytics",
  "KEYCLOAK_CLIENT_ID": "epic-dev",
  "KEYCLOAK_URL": "https://dev.loginproxy.gov.bc.ca/auth",
  "KEYCLOAK_REALM": "eao-epic"
}
```

### Test (6cdc9e-test)

```bash
oc set env dc/eagle-api \
  ENVIRONMENT=test \
  BANNER_COLOUR=blue \
  API_LOCATION=https://eagle-test.apps.silver.devops.gov.bc.ca \
  API_PATH=/api \
  ANALYTICS_API_URL=/analytics \
  KEYCLOAK_CLIENT_ID=epic-test \
  KEYCLOAK_URL=https://test.loginproxy.gov.bc.ca/auth \
  KEYCLOAK_REALM=eao-epic \
  -n 6cdc9e-test
```

### Production (6cdc9e-prod)

```bash
oc set env dc/eagle-api \
  ENVIRONMENT=prod \
  BANNER_COLOUR= \
  API_LOCATION=https://eagle.gov.bc.ca \
  API_PATH=/api \
  ANALYTICS_API_URL=/analytics \
  KEYCLOAK_CLIENT_ID=epic-prod \
  KEYCLOAK_URL=https://loginproxy.gov.bc.ca/auth \
  KEYCLOAK_REALM=eao-epic \
  ENABLE_OBJECT_STORE=true \
  -n 6cdc9e-prod
```

## Configuration Flow Diagram

```
┌──────────────────────────────────────────────────────────────┐
│  1. Build Docker Image                                       │
│     - Frontend: npm run build                                │
│     - env.js bundled with configEndpoint=true                │
│     - Single image: eagle-public:v1.2.3                      │
└──────────────────────────────────────────────────────────────┘
                            │
                            │ Deploy same image to dev/test/prod
                            ▼
┌──────────────────────────────────────────────────────────────┐
│  2. OpenShift Deployment                                     │
│     - DeploymentConfig with environment variables            │
│     - Different values per namespace                         │
│                                                               │
│     Dev:  ENVIRONMENT=dev, BANNER_COLOUR=orange             │
│     Test: ENVIRONMENT=test, BANNER_COLOUR=blue              │
│     Prod: ENVIRONMENT=prod, BANNER_COLOUR=                  │
└──────────────────────────────────────────────────────────────┘
                            │
                            │ Pod starts
                            ▼
┌──────────────────────────────────────────────────────────────┐
│  3. eagle-api Runtime                                        │
│     - Environment variables injected by OpenShift            │
│     - /api/config endpoint returns config object             │
└──────────────────────────────────────────────────────────────┘
                            │
                            │ Frontend initializes
                            ▼
┌──────────────────────────────────────────────────────────────┐
│  4. Frontend Initialization (APP_INITIALIZER)                │
│                                                               │
│     ConfigService.init():                                    │
│       1. Load window.__env (env.js)                          │
│          { configEndpoint: true, ... }                       │
│                                                               │
│       2. Check configEndpoint === true                       │
│          ↓ Yes                                               │
│                                                               │
│       3. HTTP GET /api/config                                │
│          ↓                                                    │
│          {                                                    │
│            ENVIRONMENT: "dev",                               │
│            API_LOCATION: "https://eagle-dev...",            │
│            ANALYTICS_API_URL: "/analytics",                  │
│            ...                                               │
│          }                                                    │
│                                                               │
│       4. Merge configs (API overrides env.js)                │
│          this.configuration = { ...env, ...apiConfig }       │
│                                                               │
│       5. Return Promise (allows app to continue)             │
└──────────────────────────────────────────────────────────────┘
                            │
                            │ Config ready
                            ▼
┌──────────────────────────────────────────────────────────────┐
│  5. Services Initialize                                      │
│                                                               │
│     AnalyticsService.initialize():                           │
│       const config = configService.getConfig();              │
│       const url = config.ANALYTICS_API_URL;  // "/analytics" │
│       this.analytics = Analytics({ endpoint: url });         │
│                                                               │
│     ApiService.initialize():                                 │
│       const base = config.API_LOCATION + config.API_PATH;    │
│       this.baseUrl = base;  // "https://eagle-dev.../api"   │
└──────────────────────────────────────────────────────────────┘
```

## Configuration Reference

### Frontend Configuration Properties

| Property | Type | Description | Example |
|----------|------|-------------|---------|
| `configEndpoint` | boolean | Fetch config from API? | `true` (production), `false` (local) |
| `ENVIRONMENT` | string | Environment name | `dev`, `test`, `prod` |
| `API_LOCATION` | string | Full URL to API | `https://eagle-dev.apps.silver.devops.gov.bc.ca` |
| `API_PATH` | string | API path prefix | `/api` or `/api/public` |
| `ADMIN_PATH` | string | Admin app path | `/admin/` |
| `ANALYTICS_API_URL` | string | Analytics endpoint | `/analytics` |
| `KEYCLOAK_CLIENT_ID` | string | Keycloak client ID | `epic-dev` |
| `KEYCLOAK_URL` | string | Keycloak server URL | `https://dev.loginproxy.gov.bc.ca/auth` |
| `KEYCLOAK_REALM` | string | Keycloak realm | `eao-epic` |
| `BANNER_COLOUR` | string | Banner color for env | `orange` (dev), `blue` (test), `''` (prod) |
| `logLevel` | number | Logging verbosity | `0` (errors), `1` (warnings), `2` (info) |

### Backend Environment Variables

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `ENVIRONMENT` | Yes | `local` | Environment name (dev/test/prod) |
| `API_LOCATION` | Yes | `http://localhost:3000` | Full URL to API |
| `API_PATH` | Yes | `/api` | API path prefix |
| `ANALYTICS_API_URL` | No | `/analytics` | Analytics endpoint path |
| `KEYCLOAK_CLIENT_ID` | Yes | - | Keycloak client ID |
| `KEYCLOAK_URL` | Yes | - | Keycloak server URL |
| `KEYCLOAK_REALM` | Yes | - | Keycloak realm name |
| `KEYCLOAK_ENABLED` | No | `false` | Enable Keycloak authentication |
| `MONGODB_HOST` | Yes | `localhost` | MongoDB hostname |
| `MONGODB_PORT` | Yes | `27017` | MongoDB port |
| `MONGODB_DATABASE` | Yes | `epic` | MongoDB database name |
| `MONGODB_USERNAME` | Yes | - | MongoDB username |
| `MONGODB_PASSWORD` | Yes (secret) | - | MongoDB password |
| `BANNER_COLOUR` | No | `''` | Environment banner color |
| `ENABLE_OBJECT_STORE` | No | `false` | Enable S3/Minio storage |
| `OBJECT_STORE_URL` | No | - | S3-compatible endpoint |
| `DEBUG` | No | `false` | Enable debug logging |
| `LOG_LEVEL` | No | `0` | Logging verbosity |

## Secrets Management

### OpenShift Secrets

**Create secret**:
```bash
oc create secret generic eagle-api-mongodb \
  --from-literal=MONGODB_USERNAME=admin \
  --from-literal=MONGODB_PASSWORD='<your-secure-password-here>' \
  -n 6cdc9e-dev
```

**Reference in DeploymentConfig**:
```json
{
  "name": "MONGODB_PASSWORD",
  "valueFrom": {
    "secretKeyRef": {
      "name": "eagle-api-mongodb",
      "key": "MONGODB_PASSWORD"
    }
  }
}
```

**Never commit secrets to git**:
- Use OpenShift secrets for sensitive data
- Secrets injected at runtime as environment variables
- Not visible in ConfigMaps or public endpoints

### Keycloak Configuration

Keycloak settings are **not secrets** (public endpoints):
- `KEYCLOAK_URL`: Public Keycloak server URL
- `KEYCLOAK_REALM`: Public realm name
- `KEYCLOAK_CLIENT_ID`: Public client ID

**Keycloak client secret** (if using confidential clients):
```bash
oc create secret generic eagle-api-keycloak \
  --from-literal=KEYCLOAK_CLIENT_SECRET='<secret-from-keycloak>' \
  -n 6cdc9e-dev
```

## Configuration Best Practices

### 1. Single Build, Multiple Deploys

✅ **DO**: Build one Docker image, deploy to all environments
```bash
docker build -t eagle-public:v1.2.3 .
docker tag eagle-public:v1.2.3 eagle-public:dev
docker tag eagle-public:v1.2.3 eagle-public:test
docker tag eagle-public:v1.2.3 eagle-public:prod
```

❌ **DON'T**: Build separate images per environment
```bash
# BAD: Different builds for each environment
docker build -t eagle-public:dev --build-arg ENV=dev .
docker build -t eagle-public:test --build-arg ENV=test .
```

### 2. Use Runtime Configuration

✅ **DO**: Fetch config at runtime from `/api/config`
```typescript
// Frontend fetches config after deployment
const config = await this.http.get('/api/config').toPromise();
```

❌ **DON'T**: Hardcode environment-specific values
```typescript
// BAD: Hardcoded environment-specific URL
const apiUrl = 'https://eagle-dev.apps.silver.devops.gov.bc.ca/api';
```

### 3. Graceful Fallbacks

✅ **DO**: Provide sensible defaults and fallback behavior
```typescript
const analyticsUrl = config.ANALYTICS_API_URL || '/analytics';
if (!config.KEYCLOAK_ENABLED) {
  console.warn('Keycloak disabled, using mock auth');
}
```

❌ **DON'T**: Fail hard on missing config
```typescript
// BAD: Throws error if config missing
const apiUrl = config.API_LOCATION;  // Uncaught TypeError if undefined
```

### 4. Validate Configuration

✅ **DO**: Validate required config at startup
```typescript
if (!config.API_LOCATION) {
  throw new Error('API_LOCATION is required');
}
if (!config.API_LOCATION.startsWith('http')) {
  throw new Error('API_LOCATION must be a valid URL');
}
```

### 5. Document Environment Variables

✅ **DO**: Maintain environment variable reference documentation
- This document (CONFIGURATION.md)
- README.md with setup instructions
- Example .env files in repository

### 6. Never Commit Secrets

❌ **DON'T**: Commit secrets, passwords, or API keys
```javascript
// BAD: Hardcoded secret
const dbPassword = 'hardcoded-password-here';
```

✅ **DO**: Use OpenShift secrets and environment variables
```bash
oc create secret generic my-secret --from-literal=PASSWORD='...'
```

## Troubleshooting

### Config Not Loading

**Symptom**: Frontend shows default values, not environment-specific config

**Check**:
```bash
# 1. Verify configEndpoint is true in production build
curl https://eagle-dev.apps.silver.devops.gov.bc.ca/env.js
# Should show: window.__env.configEndpoint = true;

# 2. Test /api/config endpoint
curl https://eagle-dev.apps.silver.devops.gov.bc.ca/api/config
# Should return JSON with ENVIRONMENT, API_LOCATION, etc.

# 3. Check browser console
# Should see: "Loaded env.js config: {...}"
#             "Merged with API config: {...}"
```

### Environment Variables Not Applied

**Symptom**: eagle-api returns wrong config values

**Check**:
```bash
# View current environment variables
oc set env dc/eagle-api --list -n 6cdc9e-dev

# Check pod environment
oc exec -n 6cdc9e-dev deployment/eagle-api -- env | grep API_LOCATION

# Trigger new deployment if needed
oc rollout latest dc/eagle-api -n 6cdc9e-dev
```

### Secrets Not Found

**Symptom**: Pod fails to start with "secret not found" error

**Check**:
```bash
# List secrets
oc get secrets -n 6cdc9e-dev

# Describe secret
oc describe secret eagle-api-mongodb -n 6cdc9e-dev

# Create if missing
oc create secret generic eagle-api-mongodb \
  --from-literal=MONGODB_PASSWORD='...' \
  -n 6cdc9e-dev
```

### Analytics URL Wrong

**Symptom**: Analytics calls return 404

**Check**:
```bash
# 1. Verify eagle-api returns correct value
curl https://eagle-dev.apps.silver.devops.gov.bc.ca/api/config | jq '.ANALYTICS_API_URL'
# Should return: "/analytics"

# 2. Set environment variable if missing
oc set env dc/eagle-api ANALYTICS_API_URL=/analytics -n 6cdc9e-dev

# 3. Test analytics endpoint
curl -X POST https://eagle-dev.apps.silver.devops.gov.bc.ca/analytics \
  -H "Content-Type: application/json" \
  -d '{"timestamp":"2026-01-01T00:00:00Z","eventType":"test","sessionId":"test","sourceApp":"test"}'
# Should return: 201 Created
```

## Related Documentation

- [ARCHITECTURE.md](./ARCHITECTURE.md) - Overall platform architecture
- [ANALYTICS_ARCHITECTURE.md](./ANALYTICS_ARCHITECTURE.md) - Analytics configuration details
- [DEPLOYMENT.md](./DEPLOYMENT.md) - Deployment workflows
