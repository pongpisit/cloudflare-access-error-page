# Cloudflare One — Access Custom Error Page

A dynamic **"Access Denied"** page for Cloudflare Zero Trust, deployed as a single Cloudflare Worker. When Cloudflare Access blocks a user, this page tells them **exactly why** — which policy, group, country, or device posture requirement they failed — in plain language, and gives them actionable next steps.

[![Deploy to Cloudflare Workers](https://deploy.workers.cloudflare.com/button)](https://deploy.workers.cloudflare.com/?url=https://github.com/pongpisit/cloudflare-access-error-page)

## How it works

```
User → Access-protected application
  ↓ blocked by an Access policy
Cloudflare Access redirects to this page with ?original_url=<blocked app>
  ↓
Worker page (/cf-access/) → fetches /cf-access/api/denyreason?original_url=...
  ↓
Worker resolves the reason:
  1. Matches the Access application for original_url
  2. Fetches its policies (Allow / Block) and Access groups
  3. Evaluates include / exclude / require rules against the
     user's email, groups, country and IP
  4. Correlates failing device posture checks
  5. Fetches the user's failed Access sign-ins (last 15 minutes)
  ↓
User sees a plain-language reason, what to do next, and their details
```

## What the blocked user sees

**"Why you were denied" card** — the exact reason, one of:

| Reason type | Meaning |
|-------------|---------|
| `blocked_by_deny_policy` | A Block (Deny) policy matched your account or network — the policy name and trigger are shown |
| `no_allow_policy_matched` | You authenticated, but no Allow policy includes your account — each policy's requirements are compared against your identity |
| `requirement_not_met` | Your account is allowed, but an extra requirement (MFA, client certificate) was not satisfied |
| `posture_check_failed` | Your device failed required posture checks (CrowdStrike, OS updates, disk encryption) |
| `session_issue` | You meet the requirements, but your session was rejected or expired |
| `limited` | Detailed reason unavailable — the API token is missing permissions; the page still shows everything else |

- **Requirements breakdown** — e.g. *Policy "Engineering-only" requires members of Access group "Engineering" — your groups: Sales, Marketing*
- **Failing posture checks** — listed with fix hints
- **Recent failed sign-ins** — the user's failed Access login events from the last 15 minutes (application, identity provider, country, reason)
- **What to do next** — actionable steps, plus **Contact IT** / **Copy details** buttons prefilled with the full context (reason, error code, application, email, failing checks)
- **Your details** — identity (name, email, groups, WARP status), device, posture, and raw debug JSON
- Light/dark themes, keyboard accessible (WCAG 2.1 AA patterns)

Everything degrades gracefully: with no API token (or missing permissions) the page still works, showing identity and posture data with generic guidance.

## Prerequisites

- Cloudflare account with **Zero Trust (Cloudflare One)** enabled
- A hostname to serve this page on, itself behind Cloudflare Access with cookie domain `.example.com` (wildcard, so the session carries over)
- Node.js 18+ (local development only)

## Setup

### 1. Deploy the Worker

```bash
npm install
cp wrangler.example.jsonc wrangler.jsonc   # edit the route pattern for your domain
npm run deploy
```

### 2. Create the API token and secret

Create an API token (Cloudflare dashboard → My Profile → API Tokens) with:

| Permission | Used for |
|------------|----------|
| Account → Access: Apps and Policies → Read | Resolve the application and evaluate its policies |
| Account → Access: Audit Logs → Read | Recent failed sign-ins (GraphQL) |
| Account → Zero Trust: Devices → Read | Device details |
| Account → Zero Trust: Device Posture → Read | Device posture checks |
| Zone → Zone → Read + Zone → Access: Apps and Policies → Read | Only if your Access apps are zone-scoped |

Then set it as a Worker secret:

```bash
wrangler secret put BEARER_TOKEN
```

### 3. Point your Access applications at the page

In each Access application (Zero Trust → Applications → your app):

1. Under **Additional settings**, find the block page options.
2. Set **Identity failure block page** → **Custom Redirect URL** → `https://your-domain.com/cf-access/`
3. Set **Non-identity failure block page** → **Custom Redirect URL** → `https://your-domain.com/cf-access/`

Access appends the `original_url` parameter to the redirect — the page uses it to resolve the application and its policies. Both settings matter:

- **Identity failure page** — shown after login when an identity rule (email, user group) blocks the user
- **Non-identity failure page** — shown before login when a non-identity rule (country, IP, device posture) blocks the user

> The *Custom Redirect URL* option works on **all** Zero Trust plans. (The inline *Custom Page Template* is Pay-as-you-go/Enterprise only, and is not used here.)

### 4. Optional customization

- Set `IT_SUPPORT_EMAIL` in `src/pages/cf-access/index.html` so the **Contact IT** button is prefilled with your support address
- Branding, logo, and copy can be edited in the same file

## How the reason is determined

Cloudflare does not expose which specific policy failed. This page derives it:

1. `original_url` from the Access redirect identifies the application
2. The application's policies are fetched from the Cloudflare API
3. `include` / `exclude` / `require` rules are evaluated locally against the user's identity, groups, country (`request.cf.country`) and IP (`CF-Connecting-IP`)
4. Failing device posture checks and recent failed sign-ins are correlated

Rules that cannot be evaluated locally (MFA, service tokens, external evaluation) are surfaced as unmet additional requirements instead of silently ignored.

## Project structure

```
cloudflare-access-error-page/
├── src/
│   ├── pages/cf-access/           # The Access error page
│   │   ├── index.html             # Page UI (reason card, tiles, failed sign-ins)
│   │   └── scripts/               # Client-side data fetchers
│   │       ├── warpinfo.js
│   │       ├── deviceinfo.js
│   │       ├── postureinfo.js
│   │       └── denyreason.js
│   ├── worker-template.js         # Worker source (routes + /cf-access/api/*)
│   └── build.js                   # Bundles pages into main.js
├── main.js (auto-generated)
├── wrangler.example.jsonc
└── ARCHITECTURE.md                # Full technical documentation
```

## Development

```bash
npm install
cp wrangler.example.jsonc wrangler.jsonc
# Edit wrangler.jsonc with your route

npm run build    # Build worker
npm run dev      # Local development
npm run deploy   # Deploy to Cloudflare
```

## Documentation

- [ARCHITECTURE.md](./ARCHITECTURE.md) — Technical architecture, API endpoints, and evaluation flow
- [Cloudflare Access custom block pages](https://developers.cloudflare.com/cloudflare-one/reusable-components/custom-pages/access-block-page/)
- [Access login events via GraphQL](https://developers.cloudflare.com/analytics/graphql-api/tutorials/querying-access-login-events/)
- [Cloudflare Workers Docs](https://developers.cloudflare.com/workers/)
