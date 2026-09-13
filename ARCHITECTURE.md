# Architecture

## Overview

This project is a Cloudflare Worker that serves the **Cloudflare One Access custom error page** (`/cf-access/`). All page assets are bundled into a single worker (`main.js`) by the build script.

## Components

### Access Error Page (`/cf-access/`)
Dynamic page shown to users blocked by a Cloudflare Access policy. It explains **why the user was denied**, shows their identity and device details, and gives actionable next steps. Uses the Cloudflare Access JWT for authentication and fetches identity, device, posture, and Access policy data via Cloudflare APIs.

## Authentication Flow

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

### Accessing the Error Page
```
User blocked by Access policy → redirected to /cf-access/?original_url=<blocked app>
  ↓
Browser sends CF_Authorization cookie (wildcard domain)
  ↓
Cloudflare adds Cf-Access-Jwt-Assertion header
  ↓
Worker serves page → JavaScript fetches /cf-access/api/denyreason
  ↓
Page renders the deny reason, details, and next steps
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

#### `/cf-access/api/identity` (Worker API)
- Returns identity data from `/cdn-cgi/access/get-identity`

#### `/cf-access/api/userdetails` (Worker API)
- Combines identity, device details, and posture data into a single response
- Validates `Cf-Access-Jwt-Assertion` header
- If `BEARER_TOKEN` is configured, fetches device and posture data from the Cloudflare API

#### `/cf-access/api/denyreason` (Worker API)
- Explains why the user was denied by evaluating Access application policies against the user's identity
- Validates `Cf-Access-Jwt-Assertion` header (401 if missing)
- Query parameter: `original_url` — the URL the user was blocked from (appended by the Access block page redirect)
- Requires `BEARER_TOKEN` with **Access: Apps and Policies Read** (policy evaluation) and **Access: Audit Logs Read** (failed sign-in history); degrades gracefully without them

**Session sources:** the Access JWT is resolved from the `Cf-Access-Jwt-Assertion` header (page behind its own Access application) or, as a fallback, from the `CF_Authorization` session cookie sent by the browser when the Zero Trust cookie domain spans the page host. With the cookie fallback, identity is validated against the blocked application's `get-identity` endpoint (host resolved from `original_url`), because the session was issued for that application.

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
  "failingPostureChecks": [ { "name": "...", "type": "..." } ],
  "failedLogins": [ { "datetime": "...", "applicationName": "...", "identityProvider": "...", "country": "..." } ],
  "capabilities": { "policyEvaluation": true, "loginHistory": true, "devicePosture": true }
}
```

Evaluation is best-effort: Cloudflare does not expose which specific policy failed, so the worker derives the reason category from the app's policies and the user's identity. **Policy internals (names, rules, requirement text) are never included in the response** — the client only receives the reason category, the user's own identity, device, and posture status. The Posture card renders every check returned by the device posture API, and the user-facing copy for each reason type avoids naming policies or quoting their rules.

**Posture response shapes:** the device posture API returns a map keyed by rule ID (`result` object whose entries carry `rule_name`, `success`, and `error`), while some deployments expose the legacy `result.checks` array. Both the worker (`handleDenyReason`) and the page (`postureinfo.js`) accept either shape and read the display name from `rule_name`. Rules with `error: "Rule was not checked"` (the rule targets a different platform, e.g. an iOS rule on a Windows device) are rendered as *Not checked* and excluded from the failing-checks list so users are not told they failed a rule that never applied.

## Worker Implementation

### Route Handling
```javascript
if (path === '/cf-access/' || path === '/cf-access') {
  return serveAccessPage(url);
} else if (path === '/cf-access/api/denyreason') {
  return handleDenyReason(request, env);
} else if (path === '/cf-access/api/userdetails') {
  return handleUserDetails(request, env);
}
```

The `/` path redirects to `/cf-access/`; anything else returns 404.

### Key Functions

**handleDenyReason(request, env)**

Explains why the user was denied: resolves the Access app from `original_url`, evaluates its policies against the user's identity/groups/country/IP, correlates failing device posture checks, and fetches recent failed sign-in events.

**handleUserDetails(request, env)**

Combines identity, device, and posture data into a single API response.

**Flow:**
1. Validates `Cf-Access-Jwt-Assertion` header (returns 401 if missing)
2. Extracts `device_id` from JWT payload using `getDeviceIdFromToken()`
3. Fetches identity data from `/cdn-cgi/access/get-identity`
4. Extracts `account_id` from identity response
5. If `BEARER_TOKEN` is configured, fetches device and posture data from Cloudflare API
6. Returns combined JSON response

**Deny reason helpers**

| Function | Purpose |
|----------|---------|
| `normalizeUserGroups` | Normalizes group objects from the identity response |
| `buildEvalContext` | Builds the evaluation context (email, groups, country, IP) |
| `matchRule` | Matches a single policy rule against the user; returns true/false/null (null = cannot evaluate) |
| `describeRule` | Human-readable description of a policy rule |
| `userValueForRule` | "Your email/groups/country/IP" text shown next to each requirement |
| `evaluateAccessPolicies` | Evaluates all policies; returns matched Deny/Allow policy, requirement candidates, and requirement rows |
| `cfApiGetAll` | Paginated Cloudflare API GET helper |
| `findAccessApp` | Resolves the Access app for `original_url` (account apps, then zone apps) |
| `fetchAppPolicies` / `fetchAccessGroupsMap` | Policy and group lookups (account or zone scoped) |
| `fetchFailedAccessLogins` | GraphQL query for failed login events |
| `buildLimitedReasonDetails` | Fallback guidance when data is unavailable |

### Why Use a Worker Proxy?

1. **Cookie forwarding** - Browser cookies need explicit forwarding
2. **API aggregation** - Combines multiple API calls into one endpoint
3. **Token security** - Keeps the Bearer/API token server-side
4. **Error handling** - Centralized error management

## Build

`src/build.js` reads `src/pages/cf-access/index.html` and its scripts, escapes them for template literals, and injects them into `src/worker-template.js` placeholders to produce `main.js`:

| Placeholder | Content |
|-------------|---------|
| `__ACCESS_PAGE_HTML__` | The error page HTML |
| `__WARPINFO_JS__`, `__DEVICEINFO_JS__`, `__POSTUREINFO_JS__`, `__DENYREASON_JS__` | Client-side scripts served under `/cf-access/scripts/` |

## Frontend Conventions

This project is a vanilla HTML/CSS/JS Worker (not React), so React-specific mandates do not apply. The page follows these principles:

- **Semantic HTML** - proper landmarks (`<header>`, `<nav>`, `<main>`, `<footer>`), skip-to-content link, `scope` on table headers
- **Accessibility (WCAG 2.1 AA)** - `focus-visible` outlines, `aria-label`/`aria-expanded`/`aria-controls`, `role="status"` on loading spinners, `aria-hidden` on decorative SVGs
- **Explicit state handling** - loading spinners, user-friendly error states, hidden-when-empty sections
- **Design tokens** - CSS custom properties for theming with light/dark support
- **Escaping** - all server-provided strings are HTML-escaped via `esc()` before rendering

## References

- [Cloudflare Access Documentation](https://developers.cloudflare.com/cloudflare-one/identity/authorization-cookie/)
- [Access custom block pages](https://developers.cloudflare.com/cloudflare-one/reusable-components/custom-pages/access-block-page/)
- [Access login events via GraphQL](https://developers.cloudflare.com/analytics/graphql-api/tutorials/querying-access-login-events/)
- [Workers Documentation](https://developers.cloudflare.com/workers/)
