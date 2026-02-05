# Analytics Architecture - Penguin Analytics Integration

## Overview

The EPIC platform integrates with **Penguin Analytics**, a dedicated microservice for capturing user interaction events and generating insights through time-series analysis. The analytics system is designed for high-volume event ingestion with minimal performance impact on the core application.

## Service Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                   User Interactions                          │
│  (page views, clicks, form submissions, navigation)         │
└─────────────────────────────────────────────────────────────┘
                           │
                           ▼
           ┌───────────────────────────────┐
           │  Frontend (Angular)           │
           │  AnalyticsService             │
           │  penguin-analytics-plugin.ts  │
           └───────────────────────────────┘
                           │
                           │ POST /analytics
                           │ { eventType, timestamp, sessionId, ... }
                           ▼
           ┌───────────────────────────────┐
           │  OpenShift Route (/)          │
           │  → rproxy (nginx)             │
           └───────────────────────────────┘
                           │
                           │ proxy_pass
                           ▼
           ┌───────────────────────────────┐
           │  penguin-analytics-api        │
           │  Node.js/Express              │
           │  Port 3001                    │
           └───────────────────────────────┘
                           │
                           │ SQL INSERT
                           ▼
           ┌───────────────────────────────┐
           │  TimescaleDB                  │
           │  PostgreSQL + time-series     │
           │  Hypertables for events       │
           └───────────────────────────────┘
                           │
                           │ SQL queries
                           ▼
           ┌───────────────────────────────┐
           │  Metabase                     │
           │  Analytics dashboards         │
           │  Data visualization           │
           └───────────────────────────────┘
```

## Why /analytics is Separate from /api

### Key Reasons

**1. Microservice Independence**
- Penguin-analytics is a **completely separate service** with its own:
  - Codebase and repository (`bcgov/penguin-analytics`)
  - Database (TimescaleDB, not MongoDB)
  - Deployment lifecycle and versioning
  - Scaling characteristics
  - Development team

**2. No Authentication Required**
- Analytics endpoints are **anonymous** and don't require Keycloak JWT
- eagle-public: Fully anonymous tracking (no user identification)
- eagle-admin: Tracks authenticated users but stores anonymized GUIDs
- Separating from `/api` clarifies that no auth headers are needed

**3. Performance Isolation**
- Analytics is **write-heavy** with high-volume event ingestion
- Time-series database optimized for inserts (not MongoDB's use case)
- Analytics failures should not impact core API operations
- Independent scaling based on event volume, not API traffic

**4. Technology Choice**
- **TimescaleDB**: Purpose-built for time-series data
  - Automatic partitioning by time
  - Efficient compression of old data
  - Fast aggregation queries for dashboards
- **MongoDB**: Document database optimized for EPIC project data
  - Not ideal for high-volume time-series writes
  - Different backup/retention strategies

**5. Same-Origin for Ad Blocker Bypass**
- Using `/analytics` on same domain prevents CORS preflight requests
- Ad blockers often block third-party analytics domains
- Same-origin requests are less likely to be blocked
- Browser security features work seamlessly

**6. Routing Flexibility**
- Can route to different analytics backends per environment
- Could switch analytics providers without frontend changes
- Test/staging can use separate analytics databases
- Production analytics isolated from dev/test noise

### Comparison: /api vs /analytics

| Aspect | `/api` | `/analytics` |
|--------|--------|--------------|
| **Routing** | Direct OpenShift route | Through rproxy |
| **Authentication** | Keycloak JWT required (except `/api/public`) | No authentication |
| **Service** | eagle-api (Node.js) | penguin-analytics-api (Node.js) |
| **Database** | MongoDB | TimescaleDB (PostgreSQL) |
| **Request Pattern** | Read/write CRUD operations | Write-heavy event ingestion |
| **Response Time** | 100-500ms (database queries) | < 50ms (fire-and-forget) |
| **Caching** | Minimal (dynamic data) | None (write endpoint) |
| **Data Retention** | Permanent (project records) | Time-series (compressed after 30 days) |

## Penguin Analytics API

**Repository**: `bcgov/penguin-analytics`  
**Port**: 3001  
**Database**: TimescaleDB (PostgreSQL 14 + time-series extension)

### Endpoints

**POST /analytics** - Single event ingestion
```bash
curl -X POST https://eagle-dev.apps.silver.devops.gov.bc.ca/analytics \
  -H "Content-Type: application/json" \
  -d '{
    "timestamp": "2026-02-03T20:00:00.000Z",
    "eventType": "Page Viewed",
    "sessionId": "550e8400-e29b-41d4-a716-446655440000",
    "sourceApp": "eagle-public",
    "userId": null,
    "metadata": {
      "page": "/projects/123",
      "referrer": "https://google.com"
    }
  }'

# Response: 201 Created
{
  "success": true,
  "data": {
    "id": "456",
    "timestamp": "2026-02-03T20:00:00.000Z",
    "eventType": "Page Viewed",
    "sessionId": "550e8400-e29b-41d4-a716-446655440000",
    "createdAt": "2026-02-03T20:00:05.123Z"
  }
}
```

**POST /analytics/batch** - Batch event ingestion
```bash
curl -X POST https://eagle-dev.apps.silver.devops.gov.bc.ca/analytics/batch \
  -H "Content-Type: application/json" \
  -d '{
    "events": [
      { "timestamp": "...", "eventType": "Page Viewed", ... },
      { "timestamp": "...", "eventType": "Link Clicked", ... },
      { "timestamp": "...", "eventType": "Button Clicked", ... }
    ]
  }'

# Response: 201 Created
{
  "success": true,
  "inserted": 3,
  "data": [...]
}
```

**GET /analytics/health** - Health check
```bash
curl https://eagle-dev.apps.silver.devops.gov.bc.ca/analytics/health

# Response: 200 OK
{
  "status": "ok",
  "database": "connected",
  "timestamp": "2026-02-03T20:00:00.000Z"
}
```

### Event Schema

**Required Fields**:
```typescript
interface AnalyticsEvent {
  timestamp: string;      // ISO 8601 format
  eventType: string;      // e.g., "Page Viewed", "Link Clicked"
  sessionId: string;      // UUID v4
  sourceApp: string;      // "eagle-public" or "eagle-admin"
}
```

**Optional Fields**:
```typescript
interface AnalyticsEvent {
  userId?: string | null;     // User GUID (only for eagle-admin)
  metadata?: object;          // Custom event data
  userAgent?: string;         // Browser user agent
  ipAddress?: string;         // Client IP (anonymized)
  referrer?: string;          // HTTP referrer
}
```

**Event Types** (examples):
- `Page Viewed` - User navigated to a page
- `Link Clicked` - User clicked a hyperlink
- `Button Clicked` - User clicked a button
- `Form Submitted` - User submitted a form
- `User Identified` - User logged in (eagle-admin only)
- `Activity Ping` - Heartbeat indicating user is active
- `Search Performed` - User executed a search query

### TimescaleDB Storage

**Hypertable**: `analytics_events`

```sql
CREATE TABLE analytics_events (
  id SERIAL PRIMARY KEY,
  timestamp TIMESTAMPTZ NOT NULL,
  event_type VARCHAR(100) NOT NULL,
  session_id UUID NOT NULL,
  source_app VARCHAR(50) NOT NULL,
  user_id UUID,
  metadata JSONB,
  user_agent TEXT,
  ip_address INET,
  referrer TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Convert to hypertable (time-series optimization)
SELECT create_hypertable('analytics_events', 'timestamp');

-- Indexes for common queries
CREATE INDEX idx_session_id ON analytics_events(session_id, timestamp DESC);
CREATE INDEX idx_event_type ON analytics_events(event_type, timestamp DESC);
CREATE INDEX idx_source_app ON analytics_events(source_app, timestamp DESC);
```

**Time-series Features**:
- **Automatic partitioning**: Data partitioned by time (chunks of 7 days)
- **Compression**: Old chunks compressed (3:1 ratio typical)
- **Retention policies**: Auto-delete data older than 2 years
- **Continuous aggregates**: Pre-computed hourly/daily summaries

## Frontend Integration

### eagle-public (Anonymous Tracking)

**File**: `eagle-public/src/app/services/analytics/analytics.service.ts`

**Initialization**:
```typescript
import { AnalyticsService } from './services/analytics/analytics.service';

export const appConfig: ApplicationConfig = {
  providers: [
    {
      provide: APP_INITIALIZER,
      useFactory: (analytics: AnalyticsService) => () => analytics.initialize(),
      deps: [AnalyticsService],
      multi: true
    }
  ]
};
```

**Configuration**:
```typescript
@Injectable({ providedIn: 'root' })
export class AnalyticsService {
  constructor(
    private configService: ConfigService,
    private http: HttpClient
  ) {}

  async initialize(): Promise<void> {
    const config = this.configService.getConfig();
    const analyticsUrl = config.ANALYTICS_API_URL || '/analytics';
    
    // Initialize @analytics/core with penguin-analytics plugin
    this.analytics = Analytics({
      app: 'eagle-public',
      plugins: [
        penguinAnalytics({
          endpoint: analyticsUrl,
          httpClient: this.http,
          sourceApp: 'eagle-public'
        })
      ]
    });
  }

  // Track page view
  page(properties?: object): void {
    this.analytics.page(properties);
  }

  // Track custom event
  track(eventName: string, properties?: object): void {
    this.analytics.track(eventName, properties);
  }
}
```

**Penguin Analytics Plugin**:
```typescript
// eagle-public/src/app/services/analytics/penguin-analytics-plugin.ts

export function penguinAnalytics(options: PenguinOptions): AnalyticsPlugin {
  return {
    name: 'penguin-analytics',
    
    page({ payload }) {
      // Send page view event
      const event = {
        timestamp: new Date().toISOString(),
        eventType: 'Page Viewed',
        sessionId: getSessionId(),
        sourceApp: options.sourceApp,
        metadata: {
          page: payload.properties.path,
          title: payload.properties.title,
          referrer: document.referrer
        }
      };
      
      return sendEvent(options.endpoint, event, options.httpClient);
    },
    
    track({ payload }) {
      // Send custom event
      const event = {
        timestamp: new Date().toISOString(),
        eventType: payload.event,
        sessionId: getSessionId(),
        sourceApp: options.sourceApp,
        metadata: payload.properties
      };
      
      return sendEvent(options.endpoint, event, options.httpClient);
    }
  };
}
```

**Session Management**:
```typescript
function getSessionId(): string {
  // Check sessionStorage for existing session
  let sessionId = sessionStorage.getItem('analytics_session_id');
  
  if (!sessionId) {
    // Generate new UUID v4
    sessionId = crypto.randomUUID();
    sessionStorage.setItem('analytics_session_id', sessionId);
  }
  
  return sessionId;
}
```

**Auto-Tracking**:
```typescript
// Automatically track clicks on links and buttons
@Directive({
  selector: 'a, button',
  standalone: true
})
export class AnalyticsTrackingDirective {
  @HostListener('click', ['$event'])
  onClick(event: MouseEvent): void {
    const element = event.target as HTMLElement;
    const eventType = element.tagName === 'A' ? 'Link Clicked' : 'Button Clicked';
    
    this.analytics.track(eventType, {
      text: element.textContent,
      href: element.getAttribute('href'),
      id: element.id
    });
  }
}
```

### eagle-admin (Authenticated Tracking)

**File**: `eagle-admin/src/app/services/analytics/analytics.service.ts`

**Key Difference**: Includes user identification after Keycloak login

```typescript
@Injectable({ providedIn: 'root' })
export class AnalyticsService {
  constructor(
    private configService: ConfigService,
    private keycloakService: KeycloakService,
    private http: HttpClient
  ) {}

  async initialize(): Promise<void> {
    // Initialize analytics (same as eagle-public)
    this.analytics = Analytics({ ... });
    
    // After Keycloak authentication, identify user
    const profile = await this.keycloakService.loadUserProfile();
    
    if (profile) {
      this.identify(profile.id);  // User GUID from Keycloak
    }
  }

  identify(userId: string): void {
    this.analytics.identify(userId, {
      // No PII stored - only the anonymized user ID
    });
  }
}
```

**User Identification Flow**:
```
1. User logs in via Keycloak
    ↓
2. Keycloak returns JWT with user GUID
    ↓
3. AnalyticsService.identify(userGuid)
    ↓
4. POST /analytics
    {
      eventType: "User Identified",
      userId: "bb4c2f7c-17d4-41fc-bc22-c292d5388373",  // Keycloak GUID
      sessionId: "550e8400-e29b-41d4-a716-446655440000"
    }
    ↓
5. Subsequent events include userId field
```

**Privacy Considerations**:
- **No PII stored**: Only Keycloak-generated GUIDs
- **No email, name, or username** in analytics events
- **IP anonymization**: Last octet removed (e.g., `192.168.1.0`)
- **User-agent**: Stored for browser analytics, no fingerprinting
- **Opt-out**: Admins can disable analytics in browser settings

## rproxy nginx Configuration

**File**: `eao-nginx/conf.d/server.conf.tmpl`

```nginx
location /analytics {
    # Proxy to penguin-analytics-api
    proxy_pass ${NGINX__EPIC__PROXY__ANALYTICS}/analytics;
    
    # HTTP/1.1 for keep-alive connections
    proxy_http_version 1.1;
    
    # Pass all request headers
    proxy_pass_request_headers on;
    
    # Timeouts (analytics should be fast)
    proxy_connect_timeout 5s;
    proxy_send_timeout 10s;
    proxy_read_timeout 10s;
    
    # No caching (write endpoint)
    proxy_cache off;
    
    # Client body size limit (prevent abuse)
    client_max_body_size 1m;
}
```

**Environment Variable**:
```bash
NGINX__EPIC__PROXY__ANALYTICS=http://penguin-analytics-api:3001
```

**Templating**: At container startup, `envsubst` replaces `${NGINX__EPIC__PROXY__ANALYTICS}` with the actual value.

## Request Flow Example

### Page View Tracking

```
1. User navigates to https://eagle-dev.apps.silver.devops.gov.bc.ca/projects
    ↓
2. Angular app loads, ConfigService fetches /api/config
    ↓
3. AnalyticsService.initialize() with ANALYTICS_API_URL="/analytics"
    ↓
4. Angular Router fires NavigationEnd event
    ↓
5. AnalyticsService.page({ path: '/projects', title: 'Projects' })
    ↓
6. penguin-analytics-plugin constructs event:
    {
      timestamp: "2026-02-03T20:00:00.000Z",
      eventType: "Page Viewed",
      sessionId: "550e8400-e29b-41d4-a716-446655440000",
      sourceApp: "eagle-public",
      metadata: {
        page: "/projects",
        title: "Projects",
        referrer: "https://google.com"
      }
    }
    ↓
7. HTTP POST to /analytics
    ↓
8. OpenShift Route (/) → rproxy:8080
    ↓
9. nginx location /analytics → penguin-analytics-api:3001/analytics
    ↓
10. Express route handler validates event schema
    ↓
11. INSERT INTO analytics_events (timestamp, event_type, ...) VALUES (...)
    ↓
12. TimescaleDB stores in time-series hypertable
    ↓
13. Response: 201 Created { success: true, data: {...} }
    ↓
14. Frontend ignores response (fire-and-forget)
```

## Metabase Integration

**Service**: Metabase (open-source analytics dashboards)  
**Access**: Internal only (not exposed via OpenShift routes)

**Dashboards**:
- **User Activity**: Page views, sessions, active users
- **Navigation Patterns**: Most visited pages, user flows
- **Search Analytics**: Popular search terms, result clicks
- **Admin Activity**: Who is managing projects, documents uploaded

**Example Query** (Most Viewed Projects):
```sql
SELECT
  metadata->>'project_id' AS project_id,
  COUNT(*) AS view_count
FROM analytics_events
WHERE
  event_type = 'Page Viewed'
  AND source_app = 'eagle-public'
  AND metadata->>'page' LIKE '/projects/%'
  AND timestamp >= NOW() - INTERVAL '30 days'
GROUP BY metadata->>'project_id'
ORDER BY view_count DESC
LIMIT 20;
```

**Time-Series Query** (Daily Active Users):
```sql
SELECT
  time_bucket('1 day', timestamp) AS day,
  source_app,
  COUNT(DISTINCT session_id) AS daily_active_sessions
FROM analytics_events
WHERE
  timestamp >= NOW() - INTERVAL '90 days'
GROUP BY day, source_app
ORDER BY day DESC;
```

## Configuration Reference

### eagle-api Environment Variable

```bash
# Served via /api/config endpoint
ANALYTICS_API_URL=/analytics
```

**Deployment**:
```bash
# Set in OpenShift DeploymentConfig
oc set env dc/eagle-api ANALYTICS_API_URL=/analytics -n 6cdc9e-dev
oc set env dc/eagle-api ANALYTICS_API_URL=/analytics -n 6cdc9e-test
oc set env dc/eagle-api ANALYTICS_API_URL=/analytics -n 6cdc9e-prod
```

**Default** (if env var not set):
```javascript
// eagle-api/api/controllers/config.js
ANALYTICS_API_URL: process.env.ANALYTICS_API_URL || '/analytics'
```

### Frontend Environment (Local Development)

**eagle-public/src/env.js**:
```javascript
window.__env = {
  configEndpoint: false,  // Use env.js for local dev
  ANALYTICS_API_URL: 'http://localhost:3001/analytics',  // Local penguin-analytics
};
```

**eagle-public/src/env.js** (Production build):
```javascript
window.__env = {
  configEndpoint: true,  // Fetch from /api/config at runtime
  // ANALYTICS_API_URL will be loaded from eagle-api config endpoint
};
```

## Deployment

### penguin-analytics Helm Chart

**Repository**: `penguin-analytics/helm/penguin-analytics`

**Install**:
```bash
helm upgrade --install penguin-analytics ./helm/penguin-analytics \
  --namespace 6cdc9e-dev \
  --values helm/penguin-analytics/values-dev.yaml
```

**Key Values** (values-dev.yaml):
```yaml
namespace: 6cdc9e-dev

images:
  api:
    registry: image-registry.openshift-image-registry.svc:5000/6cdc9e-tools
    name: penguin-analytics-api
    tag: dev

database:
  host: penguin-analytics-db
  port: 5432
  name: penguin_analytics
  persistence:
    enabled: false  # Dev uses ephemeral storage

api:
  replicas: 1
  route:
    host: penguin-analytics-api-6cdc9e-dev.apps.silver.devops.gov.bc.ca
  resources:
    limits:
      cpu: 500m
      memory: 512Mi
```

**Production Values** (values-prod.yaml):
```yaml
database:
  persistence:
    enabled: true
    size: 20Gi
    storageClass: netapp-block-standard

api:
  replicas: 2
  resources:
    limits:
      cpu: 1000m
      memory: 1Gi
```

### rproxy Configuration

**Set analytics proxy target**:
```bash
oc set env dc/rproxy \
  NGINX__EPIC__PROXY__ANALYTICS=http://penguin-analytics-api:3001 \
  -n 6cdc9e-dev
```

**Rebuild rproxy** (after eao-nginx repo changes):
```bash
oc start-build rproxy -n 6cdc9e-tools --follow
```

## Performance Considerations

### Event Throttling

**Activity Pings** (heartbeat):
```typescript
// eagle-public/src/app/services/analytics/analytics.service.ts

private startActivityPing(): void {
  // Send heartbeat every 30 seconds when user is active
  interval(30000).subscribe(() => {
    if (this.isUserActive()) {
      this.track('Activity Ping', { timestamp: new Date().toISOString() });
    }
  });
}
```

**Batch Event Sending** (future optimization):
```typescript
// Queue events and send in batches every 5 seconds
private eventQueue: AnalyticsEvent[] = [];

queueEvent(event: AnalyticsEvent): void {
  this.eventQueue.push(event);
  
  if (this.eventQueue.length >= 10) {
    this.flushQueue();
  }
}

private flushQueue(): void {
  if (this.eventQueue.length === 0) return;
  
  this.http.post('/analytics/batch', { events: this.eventQueue })
    .subscribe(() => {
      this.eventQueue = [];
    });
}
```

### Database Optimization

**TimescaleDB Compression** (automatic):
```sql
-- Enable compression for chunks older than 7 days
ALTER TABLE analytics_events SET (
  timescaledb.compress,
  timescaledb.compress_segmentby = 'source_app, event_type'
);

SELECT add_compression_policy('analytics_events', INTERVAL '7 days');
```

**Retention Policy**:
```sql
-- Automatically drop chunks older than 2 years
SELECT add_retention_policy('analytics_events', INTERVAL '2 years');
```

### Response Time Targets

- **Event ingestion**: < 50ms (P95)
- **Batch ingestion**: < 200ms for 100 events (P95)
- **Health check**: < 10ms (P99)
- **Frontend impact**: Fire-and-forget, no blocking

## Troubleshooting

### Check Analytics Connectivity

```bash
# Test analytics endpoint
curl -X POST https://eagle-dev.apps.silver.devops.gov.bc.ca/analytics \
  -H "Content-Type: application/json" \
  -d '{
    "timestamp": "'$(date -u +%Y-%m-%dT%H:%M:%S.000Z)'",
    "eventType": "test",
    "sessionId": "test-123",
    "sourceApp": "curl"
  }'

# Expected: 201 Created with event data
```

### Check rproxy Logs

```bash
oc logs -n 6cdc9e-dev deployment/rproxy --tail=100 | grep analytics
```

### Check penguin-analytics Logs

```bash
oc logs -n 6cdc9e-dev deployment/penguin-analytics-api --tail=100
```

### Check Database Connectivity

```bash
oc exec -n 6cdc9e-dev deployment/penguin-analytics-api -- \
  psql -h penguin-analytics-db -U postgres -d penguin_analytics -c \
  "SELECT COUNT(*) FROM analytics_events WHERE timestamp > NOW() - INTERVAL '1 hour';"
```

### Browser Console Debugging

```javascript
// In browser console (eagle-public or eagle-admin)
// Check if analytics service is initialized
window.analytics  // Should show Analytics object

// Manually send test event
window.analytics.track('Test Event', { foo: 'bar' })
```

## Related Documentation

- [ARCHITECTURE.md](./ARCHITECTURE.md) - Overall platform architecture
- [CONFIGURATION.md](./CONFIGURATION.md) - Configuration management
- [penguin-analytics README](https://github.com/bcgov/penguin-analytics/blob/main/README.md) - Analytics service documentation
