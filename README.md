# Cloudflare Zero Trust — DNS Filtering & Custom Pages

DNS filtering visibility and custom pages for Cloudflare Zero Trust, deployed as a single Cloudflare Worker.

[![Deploy to Cloudflare Workers](https://deploy.workers.cloudflare.com/button)](https://deploy.workers.cloudflare.com/?url=https://github.com/leelakanakala/cfone-custom-pages)

## Prerequisites

- **Cloudflare Account** with Zero Trust enabled
- **API Tokens** (see [Configuration](#configuration) below)
- **Node.js 18+** (for local development only)

For Cloudflare Workers setup, see the [Workers Documentation](https://developers.cloudflare.com/workers/get-started/guide/).

---

## DNS Filtering

### DNS Analytics Dashboard (`/cf-dns-dashboard/`)

Real-time DNS filtering analytics powered by Cloudflare's GraphQL API. Monitor, investigate, and report on all Gateway DNS activity from a single dashboard.

**Highlights:**
- **Live DNS Logs** — streaming query log with 10-second auto-refresh
- **DNS Query Timeline** — query volume over selectable windows (Live, 1h, 24h, 7d, 30d)
- **Top 20 Allowed / Blocked Categories** — category-level breakdown
- **Top 20 Queried Domains** — most-queried domain names
- **Top 20 Blocked Domains** — blocked domain analysis
- **Newly Observed Domains** — first-seen domain detection
- **Geography Analysis** — query distribution by country
- **Action Breakdown** — allowed vs blocked pie chart
- **Application Analysis** — traffic by application type
- **PDF Export** — one-click report generation via html2canvas + jsPDF

![DNS Analytics Dashboard](src/img/dns-dashboard.png)

### Gateway Block Page (`/cf-gateway/`)

Custom block page displayed by Cloudflare Secure Web Gateway when a DNS or HTTP policy blocks a request. Parses Gateway query parameters to show the blocked URL, matched categories, and policy details. Supports light/dark themes.

![Gateway Block Page](src/img/gw-block-page.png)

---

## Custom Pages

### Access Info Page (`/cf-access/`)

Dynamic "Access Denied" page that tells each user **why** Cloudflare Access blocked them, in addition to showing their identity and device information.

**Deny reason enrichment:**

- **"Why you were denied" card** — resolves the Access application from the redirect's `original_url` parameter, fetches its policies, and evaluates them against the user's identity:
  - `blocked_by_deny_policy` — a Block (Deny) policy matched your account/network (names the policy and its trigger)
  - `no_allow_policy_matched` — no Allow policy includes you (shows each policy's requirements vs. your email, groups, country, and IP)
  - `requirement_not_met` — your account is allowed, but an additional requirement (MFA, client certificate) was not satisfied
  - `posture_check_failed` — your device failed required posture checks (CrowdStrike, OS updates, disk encryption)
  - `session_issue` — requirements met, but the session was rejected or expired
- **Recent failed sign-ins** — the user's failed Access login events from the last 15 minutes (application, identity provider, country, reason)
- **"What to do next"** — actionable next steps, plus **Contact IT** / **Copy details** buttons prefilled with the full context (reason, error code, application, email, failing checks)
- **Graceful degradation** — without an API token (or missing permissions) the page still shows identity, device, and posture data with generic guidance

**Also displays:** WARP connection status, device details, device posture checks, and raw debug JSON.

![Access Info Page](src/img/access-block-page.png)

### User Coaching Page (`/coaching/`)

Placeholder for security awareness coaching — will be served when Gateway policies use the "coach" action instead of a hard block.

---

## Configuration

### Required Secrets

Set these using `wrangler secret put <SECRET_NAME>`:

| Secret | Required For | Permissions |
|--------|--------------|-------------|
| `DNS_DASHBOARD_API_TOKEN` | DNS Dashboard | Account → Zero Trust → Read |
| `DNS_DASHBOARD_ACCOUNT_ID` | DNS Dashboard | Your Cloudflare Account ID |
| `BEARER_TOKEN` | Access Info Page | Zero Trust → Devices → Read, Device Posture → Read. For full deny reasons also add: Access → Apps & Policies → Read, Access → Audit Logs → Read |

### DNS Dashboard Setup

1. Create API token with **Account → Zero Trust → Read** permission
2. Set secrets:
   ```bash
   wrangler secret put DNS_DASHBOARD_API_TOKEN
   wrangler secret put DNS_DASHBOARD_ACCOUNT_ID
   ```

### Gateway Block Page Setup

1. Navigate to **Zero Trust** → **Gateway** → **Firewall Policies**
2. Edit your block policy
3. Set **Block page** to: `https://your-domain.com/cf-gateway/`

### Access Info Page Setup

1. Configure Cloudflare Access for your domain
2. Set cookie domain to `.example.com` (wildcard for SSO)
3. Configure `BEARER_TOKEN` secret for device/posture data
4. For full deny reasons, add these permissions to the `BEARER_TOKEN`:
   - **Access → Apps & Policies → Read** — per-policy evaluation
   - **Access → Audit Logs → Read** — failed sign-in history
   - **Zone → Access: Apps and Policies → Read** and **Zone → Zone → Read** — only needed if your Access apps are zone-scoped
5. In each Access application, set both the **Identity failure block page** and the **Non-identity failure block page** to *Custom Redirect URL* pointing at `https://your-domain.com/cf-access/` — Access appends the `original_url` parameter that the page uses to resolve the application and its policies
6. Optional: set the `IT_SUPPORT_EMAIL` constant in `src/pages/cf-access/index.html` to your support address so the Contact IT button is prefilled

## Project Structure

```
cfone-custom-pages/
├── src/
│   ├── pages/
│   │   ├── cf-dns-dashboard/       # DNS analytics dashboard
│   │   │   ├── index.html
│   │   │   └── categoryList.js
│   │   ├── cf-gateway/block.html   # Gateway block page
│   │   ├── cf-access/             # Access denied/info page
│   │   │   ├── index.html
│   │   │   └── scripts/
│   │   │       ├── warpinfo.js
│   │   │       ├── deviceinfo.js
│   │   │       ├── postureinfo.js
│   │   │       └── denyreason.js
│   │   └── coaching/index.html     # User coaching page
│   ├── worker-template.js
│   └── build.js
├── main.js (auto-generated)
├── wrangler.example.jsonc
└── ARCHITECTURE.md
```

## Development

```bash
npm install
cp wrangler.example.jsonc wrangler.jsonc
# Edit wrangler.jsonc with your routes

npm run build    # Build worker
npm run dev      # Local development
npm run deploy   # Deploy to Cloudflare
```

## Documentation

- [ARCHITECTURE.md](./ARCHITECTURE.md) — Technical architecture details
- [Cloudflare Workers Docs](https://developers.cloudflare.com/workers/)
- [Zero Trust Docs](https://developers.cloudflare.com/cloudflare-one/)
