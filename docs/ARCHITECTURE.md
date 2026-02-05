# EPIC/Eagle Platform Architecture

## Overview

The EPIC (Environmental Assessment Information Catalogue) platform is a microservices-based application deployed on OpenShift that provides public access to environmental assessment projects in British Columbia. The platform consists of multiple services working together through a combination of direct routing and reverse proxy patterns.

## Service Map

```
┌─────────────────────────────────────────────────────────────┐
│                    OpenShift Routes                          │
│         eagle-{env}.apps.silver.devops.gov.bc.ca            │
└─────────────────────────────────────────────────────────────┘
                │                           │
        /api (direct)                      / (root)
                │                           │
                ▼                           ▼
    ┌───────────────────┐       ┌──────────────────────┐
    │   eagle-api       │       │   rproxy (nginx)     │
    │   Node.js/Express │       │   Port 8080          │
    │   Port 3000       │       └──────────────────────┘
    │   MongoDB         │                 │
    └───────────────────┘          ┌──────┴────┬──────────┬──────────┐
                                   │           │          │          │
                                   ▼           ▼          ▼          ▼
                          ┌──────────┐  ┌─────────┐  ┌─────────┐  ┌────────────┐
                          │ eagle-   │  │ eagle-  │  │penguin- │  │ eao-       │
                          │ public   │  │ admin   │  │analytics│  │ internal-  │
                          │ Angular  │  │ Angular │  │ Node.js │  │ guidance   │
                          │ :8080    │  │ :8080   │  │ :3001   │  │ :4000      │
                          └──────────┘  └─────────┘  └─────────┘  └────────────┘
                                                           │
                                                           ▼
                                                    ┌──────────────┐
                                                    │ TimescaleDB  │
                                                    │ PostgreSQL   │
                                                    └──────────────┘
```

## Core Services

### eagle-api (Backend API)

**Technology**: Node.js/Express, MongoDB, Mongoose ODM  
**Port**: 3000  
**Repository**: `bcgov/eagle-api`

The main backend API service providing RESTful endpoints for:
- Public project information (`/api/public/*`)
- Protected admin operations (`/api/*` - requires Keycloak authentication)
- Runtime configuration for frontends (`/api/config`)
- Document management and search
- User management and authorization

**Key Features**:
- Keycloak JWT authentication for admin endpoints
- MongoDB for data persistence
- S3/Minio integration for document storage
- Comprehensive search capabilities
- RESTful API design following OpenAPI specification

### eagle-public (Public Frontend)

**Technology**: Angular 21 (standalone components), TypeScript  
**Port**: 8080 (nginx)  
**Repository**: `bcgov/eagle-public`

Public-facing Angular application providing:
- Browse environmental assessment projects
- View project details, documents, and milestones
- Search functionality
- Responsive design for mobile/desktop
- Anonymous analytics tracking

**Deployment**: 2-stage Docker build
1. Build stage: Node 20+ compiles Angular app
2. Runtime stage: nginx serves static files

### eagle-admin (Admin Frontend)

**Technology**: Angular (standalone components), TypeScript  
**Port**: 8080 (nginx)  
**Repository**: `bcgov/eagle-admin`

Administrative interface for authorized users:
- Keycloak SSO integration
- Project management (CRUD operations)
- Document upload and management
- User and role management
- Authenticated analytics tracking

**Authentication Flow**:
1. User redirects to Keycloak login
2. Keycloak returns JWT token
3. Frontend includes JWT in Authorization header
4. eagle-api validates JWT for protected endpoints

### penguin-analytics-api (Analytics Service)

**Technology**: Node.js/Express, TimescaleDB (PostgreSQL + time-series)  
**Port**: 3001  
**Repository**: `bcgov/penguin-analytics`

Dedicated analytics service for tracking user interactions:
- Anonymous event ingestion
- Time-series data storage
- Event schema validation
- Metabase dashboard integration
- Batch and single-event endpoints

**See**: [ANALYTICS_ARCHITECTURE.md](./ANALYTICS_ARCHITECTURE.md) for detailed analytics documentation.

### rproxy/eao-nginx (Reverse Proxy)

**Technology**: nginx (OpenShift S2I build)  
**Port**: 8080  
**Repository**: `bcgov/eao-nginx`

Central reverse proxy providing:
- Path-based routing to backend services
- HTTP caching layer
- Security headers
- Optional HTTP Basic Auth per location
- Single entry point for multiple services

**Configuration**: `eao-nginx/conf.d/server.conf.tmpl`

## Request Routing Architecture

The platform uses **two distinct routing patterns** that work together:

### Pattern 1: Direct Route to eagle-api

**OpenShift Route Configuration**:
- Host: `eagle-{env}.apps.silver.devops.gov.bc.ca`
- Path: `/api`
- Target: `eagle-api:3000`
- TLS: Edge termination

**Request Flow**:
```
User Browser
    ↓
https://eagle-dev.apps.silver.devops.gov.bc.ca/api/projects
    ↓
OpenShift Route (direct match on /api)
    ↓
eagle-api:3000
    ↓
Response
```

### Pattern 2: Centralized rproxy Route

**OpenShift Route Configuration**:
- Host: `eagle-{env}.apps.silver.devops.gov.bc.ca`
- Path: `/` (root - catches all non-/api paths)
- Target: `rproxy:8080`
- TLS: Edge termination

**rproxy nginx Routing Rules**:

| Path | Target Service | Purpose |
|------|----------------|---------|
| `/` | `eagle-public:8080` | Public frontend |
| `/public` | `eagle-public:8080` | Alternative public access |
| `/admin/` | `eagle-admin:8080` | Admin frontend |
| `/analytics` | `penguin-analytics-api:3001` | Analytics events |
| `/eguide` | `eao-internal-guidance:4000` | Internal guidance |

**Request Flow Example** (accessing admin):
```
User Browser
    ↓
https://eagle-dev.apps.silver.devops.gov.bc.ca/admin/
    ↓
OpenShift Route (root / matches)
    ↓
rproxy:8080 (nginx)
    ↓
location /admin/ { proxy_pass eagle-admin:8080; }
    ↓
eagle-admin:8080
    ↓
Response (Angular app)
```

## Why /api Bypasses rproxy

The `/api` path has **both** routing configurations:
1. **Direct OpenShift route** to eagle-api (explicit `/api` path)
2. **rproxy location block** that could also proxy `/api`

**The direct route takes precedence** at the OpenShift ingress level.

### Rationale for Direct Routing

**Performance**:
- Eliminates extra nginx hop for frequent API calls
- Reduces latency for data-heavy operations
- Direct TLS termination at OpenShift edge

**Simplicity**:
- Cleaner authentication header passing (Keycloak JWT)
- No nginx proxy_pass header manipulation needed
- Easier to debug connection issues

**Independence**:
- API can scale independently from rproxy
- API restarts don't affect rproxy
- Separate resource allocation and monitoring

**Backend Communication**:
- API handles sensitive operations (auth, authorization, data modification)
- Direct path provides better security audit trail
- Reduces complexity in request chain

### When rproxy is Used

rproxy is used for:
- **Frontend applications** (eagle-public, eagle-admin) - static file serving with caching
- **Analytics** - separate microservice integration
- **Path-based routing** - multiple services on same domain
- **Caching layer** - reduce load on backend services
- **Security headers** - centralized CSP, HSTS, etc.

## Service Communication Patterns

### Frontend → Backend API

**eagle-public**:
```typescript
// Via ConfigService
API_LOCATION: 'https://eagle-dev.apps.silver.devops.gov.bc.ca'
API_PATH: '/api/public'

// HTTP calls
this.http.get(`${API_LOCATION}${API_PATH}/projects`)
    ↓
https://eagle-dev.apps.silver.devops.gov.bc.ca/api/public/projects
    ↓
OpenShift Route (direct /api)
    ↓
eagle-api:3000/api/public/projects
```

**eagle-admin**:
```typescript
// Authenticated calls include JWT
this.http.get(`${API_LOCATION}${API_PATH}/projects`, {
  headers: { Authorization: `Bearer ${jwt}` }
})
    ↓
https://eagle-dev.apps.silver.devops.gov.bc.ca/api/projects
    ↓
eagle-api:3000/api/projects
    ↓
JWT validation via Keycloak
```

### Frontend → Analytics

```typescript
// Via AnalyticsService
ANALYTICS_API_URL: '/analytics'

// Event tracking
this.http.post(`${ANALYTICS_API_URL}`, eventData)
    ↓
https://eagle-dev.apps.silver.devops.gov.bc.ca/analytics
    ↓
OpenShift Route (root /)
    ↓
rproxy:8080
    ↓
location /analytics { proxy_pass penguin-analytics-api:3001/analytics; }
    ↓
penguin-analytics-api:3001/analytics
    ↓
TimescaleDB storage
```

### Frontend → Configuration

Both frontends use the **ConfigService pattern** for runtime configuration:

```typescript
// At application bootstrap
ConfigService.init()
    ↓
HTTP GET /api/config
    ↓
eagle-api:3000/api/config
    ↓
Returns: {
  ENVIRONMENT: 'dev',
  API_LOCATION: 'https://eagle-dev.apps.silver.devops.gov.bc.ca',
  API_PATH: '/api',
  ANALYTICS_API_URL: '/analytics',
  KEYCLOAK_URL: '...',
  // ... other config
}
    ↓
Frontend initializes services with runtime config
```

**See**: [CONFIGURATION.md](./CONFIGURATION.md) for detailed configuration documentation.

## nginx Configuration (rproxy)

**File**: `eao-nginx/conf.d/server.conf.tmpl`

### Key Location Blocks

```nginx
# Root - public frontend
location / {
    proxy_pass ${NGINX__EPIC__PROXY__ROOT};  # http://eagle-public:8080
    proxy_cache globalcache;
    proxy_cache_valid 200 10m;
}

# Admin frontend
location /admin/ {
    proxy_pass ${NGINX__EPIC__PROXY__ADMIN};  # http://eagle-admin:8080
    proxy_cache globalcache;
}

# Analytics endpoint
location /analytics {
    proxy_pass ${NGINX__EPIC__PROXY__ANALYTICS}/analytics;  # http://penguin-analytics-api:3001/analytics
    proxy_http_version 1.1;
    proxy_connect_timeout 5s;
    proxy_send_timeout 10s;
    proxy_read_timeout 10s;
}

# API (legacy/fallback - not typically used due to direct route)
location /api {
    proxy_pass ${NGINX__EPIC__PROXY__API};  # http://eagle-api:3000
    proxy_cache globalcache;
}
```

### Caching Strategy

```nginx
# Cache configuration
proxy_cache_path /tmp/nginx-cache levels=1:2 keys_zone=globalcache:10m max_size=100m inactive=60m use_temp_path=off;

# Cache-Control header handling
proxy_ignore_headers Cache-Control;
proxy_cache_valid 200 10m;  # Cache successful responses for 10 minutes
proxy_cache_key "$scheme$request_method$host$request_uri";
```

**Cache Behavior**:
- Static frontend files: Cached for 10 minutes
- API responses: Generally not cached (dynamic data)
- Analytics: Not cached (write-heavy endpoint)

### Security Headers

```nginx
add_header Content-Security-Policy "default-src 'self' https://*.gov.bc.ca; ..." always;
add_header Strict-Transport-Security "max-age=63072000; includeSubDomains; preload" always;
add_header X-Content-Type-Options "nosniff" always;
add_header X-Frame-Options "DENY" always;
add_header X-XSS-Protection "1; mode=block" always;
```

Applied at rproxy level to all proxied services.

## Environment Variables

### rproxy Environment Variables

Set in OpenShift DeploymentConfig:

```bash
NGINX__EPIC__PROXY__ROOT=http://eagle-public:8080
NGINX__EPIC__PROXY__PUBLIC=http://eagle-public:8080
NGINX__EPIC__PROXY__API=http://eagle-api:3000
NGINX__EPIC__PROXY__ADMIN=http://eagle-admin:8080
NGINX__EPIC__PROXY__ANALYTICS=http://penguin-analytics-api:3001
NGINX__EPIC__PROXY__EGUIDE=http://eao-internal-guidance:4000
```

These are templated into `server.conf.tmpl` at container startup.

### eagle-api Environment Variables

```bash
# Service URLs
API_LOCATION=https://eagle-dev.apps.silver.devops.gov.bc.ca
API_PATH=/api
ANALYTICS_API_URL=/analytics

# Authentication
KEYCLOAK_CLIENT_ID=epic-api
KEYCLOAK_URL=https://dev.loginproxy.gov.bc.ca/auth
KEYCLOAK_REALM=eao-epic

# Database
MONGODB_HOST=eagle-api-mongodb
MONGODB_PORT=27017
MONGODB_DATABASE=epic

# Environment
ENVIRONMENT=dev
BANNER_COLOUR=orange
```

**See**: [CONFIGURATION.md](./CONFIGURATION.md) for complete environment variable reference.

## Security Architecture

### Authentication Flow (Admin)

```
1. User accesses /admin/
    ↓
2. Angular app checks for Keycloak token
    ↓
3. No token → Redirect to Keycloak login
    ↓
4. Keycloak authenticates user (IDIR, BCeID)
    ↓
5. Keycloak returns JWT token
    ↓
6. Frontend stores token in sessionStorage
    ↓
7. All API calls include: Authorization: Bearer <jwt>
    ↓
8. eagle-api validates JWT with Keycloak public key
    ↓
9. JWT contains roles → eagle-api checks authorization
```

### Authorization Roles

Managed in Keycloak and enforced by eagle-api:

- **sysadmin**: Full system administration
- **admin**: Project management, document upload
- **user**: Read-only access to admin interface
- **public**: No authentication required (public API)

### API Route Protection

```javascript
// eagle-api/api/helpers/auth.js
exports.isLoggedIn = function(token) {
  // Validates JWT token with Keycloak
  // Returns user object with roles
}

// eagle-api/api/routes.js
app.get('/api/projects', auth.isLoggedIn, projectController.getProjects);
app.get('/api/public/projects', projectController.getPublicProjects);  // No auth
```

## Monitoring and Observability

### Health Checks

All services expose health check endpoints:

```bash
# eagle-api
GET /api/health
→ 200 OK

# eagle-public (nginx)
GET /health
→ 200 "healthy"

# eagle-admin (nginx)
GET /health
→ 200 "healthy"

# penguin-analytics-api
GET /analytics/health
→ 200 { "status": "ok", "database": "connected" }

# rproxy
GET /health
→ 200 "healthy"
```

### OpenShift Readiness/Liveness Probes

```yaml
livenessProbe:
  httpGet:
    path: /health
    port: 8080
  initialDelaySeconds: 30
  periodSeconds: 10

readinessProbe:
  httpGet:
    path: /health
    port: 8080
  initialDelaySeconds: 5
  periodSeconds: 5
```

### Logging

- **Application logs**: Stdout/stderr captured by OpenShift
- **nginx access logs**: `stdout` (combined format)
- **nginx error logs**: `stderr`
- **Log aggregation**: Available through OpenShift console or external tools

## Scalability Patterns

### Horizontal Scaling

All services support horizontal pod autoscaling:

```yaml
# eagle-api: Multiple replicas share MongoDB
replicas: 2
# Session state stored in MongoDB (no sticky sessions required)

# eagle-public/admin: Stateless nginx
replicas: 2
# No shared state, pure static file serving

# penguin-analytics-api: Stateless API
replicas: 2
# Shared TimescaleDB handles concurrent writes

# rproxy: Stateless proxy
replicas: 2
# No shared state, pure proxy/cache
```

### Resource Allocation

**Development**:
```yaml
resources:
  limits:
    cpu: 500m
    memory: 512Mi
  requests:
    cpu: 100m
    memory: 256Mi
```

**Production**:
```yaml
resources:
  limits:
    cpu: 2000m
    memory: 2Gi
  requests:
    cpu: 500m
    memory: 1Gi
```

## Related Documentation

- [ANALYTICS_ARCHITECTURE.md](./ANALYTICS_ARCHITECTURE.md) - Analytics service integration
- [CONFIGURATION.md](./CONFIGURATION.md) - Configuration management and environment variables
- [DEPLOYMENT.md](./DEPLOYMENT.md) - Deployment workflows and CI/CD pipelines
- [README.md](../README.md) - Development setup and getting started

## Additional Resources

- [OpenShift Documentation](https://docs.openshift.com/)
- [nginx Documentation](https://nginx.org/en/docs/)
- [Angular Documentation](https://angular.io/docs)
- [Keycloak Documentation](https://www.keycloak.org/documentation)
