# Architecture

## Overview

This project is a Cloudflare Worker that serves multiple custom pages for Zero Trust. All pages are bundled into a single worker (`main.js`) via the build script.

## Components

### Gateway Block Page (`/cf-gateway/`)
Static HTML page served when Cloudflare Gateway blocks a request. Cloudflare SWG appends query parameters (`cf_site_uri`, `cf_policy_name`, `cf_request_category_names`, etc.) which the page parses and displays to the user.

### Access Info Page (`/cf-access/`)
Dynamic page that displays authenticated user information and explains **why the user was denied**. Uses Cloudflare Access JWT for authentication and fetches device/posture data plus Access application policies via the Cloudflare API.

### DNS Analytics Dashboard (`/cf-dns-dashboard/`)
Real-time DNS analytics dashboard. Fetches data from Cloudflare's GraphQL Analytics API (`gatewayResolverQueriesAdaptiveGroups`) and renders charts using Chart.js. Supports Live mode with 10-second auto-refresh.

## Authentication Flow (cf-access)

### Initial Authentication
```
User → Protected Resource (e.g., intranet.example.com)
  ↓
Cloudflare Access validates/redirects to login
  ↓
User authenticates → Cloudflare sets cookies:
  - CF_Authorization (HttpOnly, Secure, Domain=.example.com)
  ↓
Redirect to original resource with valid session
```

### Accessing cf-access Page
```
User → access.example.com/cf-access
  ↓
Browser sends CF_Authorization cookie (wildcard domain)
  ↓
Cloudflare adds Cf-Access-Jwt-Assertion header
  ↓
Worker serves page → JavaScript fetches data
  ↓
No re-authentication needed ✓
```

## Key Components

### Cookies

**CF_Authorization**
- JWT token (HttpOnly, Secure)
- Domain: `.example.com` (wildcard - works across all subdomains)
- Automatically sent by browser for same-domain requests

### Headers

**Cf-Access-Jwt-Assertion**
- Added by Cloudflare Access automatically
- Contains user identity claims (email, groups, device_id)
- Used by worker for server-side authentication

### API Endpoints

#### `/cf-access/api/userdetails` (Worker API)
- Combines identity, device details, and posture data
- Validates `Cf-Access-Jwt-Assertion` header
- Fetches from `/cdn-cgi/access/get-identity` and Cloudflare API

#### `/cf-access/api/denyreason` (Worker API)
- Explains why the user was denied by evaluating Access application policies against the user's identity
- Validates `Cf-Access-Jwt-Assertion` header (401 if missing)
- Query parameter: `original_url` — the URL the user was blocked from (appended by the Access block page redirect)
- Requires `BEARER_TOKEN` with **Access: Apps and Policies Read** (policy evaluation) and **Access: Audit Logs Read** (failed sign-in history); degrades gracefully without them

**Flow:**
1. Fetches identity via `/cdn-cgi/access/get-identity` (email, groups, `user_uuid`, `device_id`, `account_id`)
2. Fetches device posture via Cloudflare API and collects failing checks
3. Resolves the Access application matching `original_url` (`/accounts/{id}/access/apps`, falling back to `/zones/{zone_id}/access/apps` via hostname)
4. Fetches the app's policies and Access groups, then evaluates `include`/`exclude`/`require` rules locally against the user's email, groups, country (`request.cf.country`), and IP (`CF-Connecting-IP`)
5. Queries GraphQL `accessLoginRequestsAdaptiveGroups` for the user's failed logins in the last 15 minutes and resolves application names

**Reason types returned:** `blocked_by_deny_policy`, `no_allow_policy_matched`, `requirement_not_met`, `posture_check_failed`, `session_issue`, `limited`

**Response structure:**
```json
{
  "reason": { "type": "no_allow_policy_matched", "headline": "...", "details": "...", "errorCode": 10204 },
  "app": { "name": "...", "domain": "...", "id": "..." },
  "requestedUrl": "https://intranet.example.com",
  "user": { "email": "...", "name": "...", "groups": ["..."], "country": "TH" },
  "requirements": [ { "policyName": "...", "description": "...", "satisfied": false, "kind": "include", "userValue": "Your groups: ..." } ],
  "failingPostureChecks": [ { "name": "...", "type": "..." } ],
  "failedLogins": [ { "datetime": "...", "applicationName": "...", "identityProvider": "...", "country": "..." } ],
  "capabilities": { "policyEvaluation": true, "loginHistory": true, "devicePosture": true }
}
```

Evaluation is best-effort: Cloudflare does not expose which specific policy failed, so the worker derives it from the app's policies and the user's identity. Rules that cannot be evaluated locally (MFA, external evaluation, service tokens) are surfaced as unmet additional requirements rather than silently ignored.

#### `/dns/api/*` (DNS Dashboard APIs)
- `monthly-stats` - Total queries, allowed/blocked counts
- `30day` - Query trends over time
- `top-allowed`, `top-blocked` - Category breakdowns
- `top-queries`, `blocked-domains` - Domain analysis
- `live-logs` - Real-time DNS query logs
- `geography`, `geography-blocked` - Country distribution

## Worker Implementation

### Route Handling
```javascript
if (path === '/cf-access/api/userdetails') {
  return handleUserDetails(request, env);
} else if (path === '/cf-access/api/denyreason') {
  return handleDenyReason(request, env);
} else if (path.startsWith('/dns/api/')) {
  return handleDNSAPI(request, env);
}
```

### Key Functions

**handleDenyReason(request, env)**

Explains why the user was denied: resolves the Access app from `original_url`, evaluates its policies against the user's identity/groups/country/IP, correlates failing device posture checks, and fetches recent failed sign-in events. Returns a structured reason (see `/cf-access/api/denyreason` above).

**handleUserDetails(request, env)**

Combines identity, device, and posture data into a single API response.

**Flow:**
1. Validates `Cf-Access-Jwt-Assertion` header (returns 401 if missing)
2. Extracts `device_id` from JWT payload using `getDeviceIdFromToken()`
3. Fetches identity data from `/cdn-cgi/access/get-identity`
4. Extracts `account_id` from identity response
5. If `BEARER_TOKEN` is configured, fetches device and posture data from Cloudflare API
6. Returns combined JSON response

**Required Variables:**
| Variable | Source | Description |
|----------|--------|-------------|
| `jwtAssertion` | `Cf-Access-Jwt-Assertion` header | JWT token added by Cloudflare Access |
| `device_id` | JWT payload or identity data | Unique device identifier |
| `account_id` | Identity response | Cloudflare account ID |
| `BEARER_TOKEN` | Worker secret (env) | API token for Cloudflare API calls |

**API Calls Made:**

1. **Identity API** (always called)
   ```
   GET /cdn-cgi/access/get-identity
   Headers: Cookie (CF_Authorization forwarded)
   Returns: User email, name, groups, device sessions, account_id
   ```

2. **Device Details API** (requires BEARER_TOKEN)
   ```
   GET https://api.cloudflare.com/client/v4/accounts/{account_id}/devices/{device_id}
   Headers: Authorization: Bearer {BEARER_TOKEN}
   Returns: Device name, model, OS version, serial number, manufacturer
   ```

3. **Device Posture API** (requires BEARER_TOKEN)
   ```
   GET https://api.cloudflare.com/client/v4/accounts/{account_id}/devices/{device_id}/posture/check
   Headers: Authorization: Bearer {BEARER_TOKEN}
   Returns: Posture check results (Crowdstrike, OS version, disk encryption, etc.)
   ```

**Response Structure:**
```json
{
  "identity": { "email": "...", "name": "...", "groups": [...], "account_id": "..." },
  "device": { "name": "...", "model": "...", "os_version": "...", "serial_number": "..." },
  "posture": { "result": [...] }
}
```

**handleLiveLogs(request, env)**
- Queries GraphQL for recent DNS logs
- Groups by queryName, categoryIds, resolverDecision, datetimeMinute
- Returns aggregated log entries

### Why Use Worker Proxy?

1. **Cookie forwarding** - Browser cookies need explicit forwarding
2. **API aggregation** - Combines multiple API calls
3. **Token security** - Keeps Bearer/API tokens server-side
4. **Error handling** - Centralized error management

## Codex Frontend Alignment

This project is a vanilla HTML/CSS/JS Worker (not React/Kumo), so React-specific Codex mandates do not apply. However, the following Codex frontend architecture principles have been adopted:

### Semantic HTML
- All pages use proper landmarks: `<header>`, `<nav>`, `<main>`, `<section>`, `<aside>`, `<footer>`
- Skip-to-content links on every page for keyboard navigation
- Tables use `<thead>`, `<tbody>`, and `scope="col"` on headers

### Accessibility (WCAG 2.1 AA)
- **Focus states**: All interactive elements have `focus-visible` outlines using `var(--accent-primary)`
- **ARIA attributes**: `aria-label` on buttons/links, `aria-pressed` on toggle buttons, `aria-expanded`/`aria-controls` on collapsibles, `role="dialog"` and `aria-modal` on modals
- **Keyboard navigation**: Modal focus trap (Tab/Shift+Tab cycles within modal), Escape key closes modals, focus returns to trigger element on close
- **Screen reader support**: `aria-live="polite"` for live status updates, `role="status"` on loading indicators, `aria-hidden="true"` on decorative SVGs and spacers, `role="alert"` on error banners

### Explicit State Handling
- **Loading**: Spinner indicators with `role="status"` and descriptive `aria-label`
- **Error**: User-friendly error messages (never raw error codes/messages); error banner with retry button on the DNS dashboard
- **Empty**: "No queries found" and "Waiting for DNS queries..." messages for empty states

### Styling
- Inline styles migrated to named CSS classes (`.nav-brand`, `.nav-title`, `.sidebar`, `.main-content`, `.chart-grid-2`, `.section-group-purple`, etc.)
- CSS custom properties (design tokens) used consistently across all pages
- Responsive breakpoints via `@media` queries

### Navigation
- Semantic `<a href>` for navigation links, `<button>` for actions/mutations
- Collapsible sections use proper `<button>` elements (not clickable `<h2>` or `<div>`)

### Anti-Patterns Avoided
- No raw `error.message` or API error codes shown to users
- No `undefined`-as-loading pattern — explicit loading states everywhere
- No CSS-in-JS — all styles in `<style>` blocks or Tailwind utilities

## References

- [Cloudflare Access Documentation](https://developers.cloudflare.com/cloudflare-one/identity/authorization-cookie/)
- [Workers Documentation](https://developers.cloudflare.com/workers/)
- [GraphQL Analytics API](https://developers.cloudflare.com/analytics/graphql-api/)
- [Cloudflare Codex Frontend Guidelines](https://codex.cloudflare.dev/engineering/codex/frontend/)
