# CrossCubes — Deployment Runbook

## 0. Working on it locally (the team)

| App | Folder | Local address | Settings file (copy from) |
|---|---|---|---|
| API | `backend/` | http://localhost:4400 | `backend/.env` (`.env.example`) |
| Guest site | `frontend/` | http://localhost:4000 | `.env.local` (`.env.local.example`) |
| HQ admin | `admin-web/` | http://localhost:4005/admin/login | `.env.local` (`.env.local.example`) |
| Partner portal | `partner-web/` | http://localhost:4010 | `.env.local` (`.env.local.example`) |
| City panel | `crosscubes-hub/` | http://localhost:4030 | `.env.local` (`.env.local.example`) |
| Mobile apps | `mobile/apps/*` | Expo | `.env.local` (`.env.local.example`) |

1. In each folder: `npm ci`, then copy the example settings file as shown.
2. Start a local MongoDB replica set and Redis (commands are in `backend/.env.example`), then `npm run dev` in `backend/` and in each site.
3. Use Stripe **test** keys only. With no Stripe key the API takes payments through a built-in mock.
4. Every app has a `.env.production.example` listing what production needs; real values live only on the server and in Vercel, never in Git.

CatoDrive uses ports 3000–3030 and 8080, so both projects can run side by side.

CrossCubes runs on its own server, database, Redis and file storage, separate from CatoDrive.
For now it shares two CatoDrive accounts: **Stripe** (payments) and the **email sender**.
API on **AWS EC2**, websites on **Vercel**, DNS on **Cloudflare** (`crosscubes.com`).

The API refuses to start in production with unsafe settings (wildcard CORS, short or
placeholder secrets, half-set S3). Work through the checklist and it starts.

| Piece | Where | Name |
|---|---|---|
| API | EC2, Ubuntu 22.04, us-east-1 | `api.crosscubes.com`, pm2 process `crosscubes-api` |
| Database | MongoDB Atlas, its own project + cluster, US region | database `crosscubes` |
| Redis | Upstash or ElastiCache, its own instance | key prefix `crosscubes` |
| Files | S3 bucket of its own, Block Public Access ON | e.g. `crosscubes-media` |
| Guest site | Vercel, root `frontend/` | `crosscubes.com`, `www.crosscubes.com` |
| Partner portal | Vercel, root `partner-web/` | `partners.crosscubes.com` |
| City operator panel | Vercel, root `crosscubes-hub/` | `hub.crosscubes.com/<secret>` |
| HQ admin | Vercel, root `admin-web/` | `admin.crosscubes.com/<secret>` |

---

## 1. API server — EC2

### 1.1 Instance
- Ubuntu 22.04 LTS, t3.small to start (t3.medium if more than a few cities are live). Region us-east-1.
- An Elastic IP attached, so the address never changes.
- Security group inbound: 22 from your IP only, 80 and 443 from anywhere. Never 4400.
- Install Node 20, nginx, certbot and pm2:
```bash
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt-get install -y nodejs nginx certbot python3-certbot-nginx git fonts-dejavu-core fontconfig
sudo npm i -g pm2
```

### 1.2 App
```bash
git clone https://github.com/DEVUP-VENTURE-GROUP/crosscubes-host.git && cd crosscubes-host/backend
npm ci
cp .env.production.example .env && nano .env   # fill in the blanks, see 1.3; never commit this file
npm run build
pm2 start dist/main.js --name crosscubes-api
pm2 save && pm2 startup   # run the command it prints, so it survives reboots
```
Update later: `git pull && npm ci && npm run build && pm2 restart crosscubes-api --update-env`.

### 1.3 Production `.env`
| Setting | Value |
|---|---|
| `NODE_ENV` | `production` |
| `APP_NAME` / `BRAND_NAME` | `CrossCubes` |
| `APP_KEY` | `crosscubes` — tags every Stripe payment so CatoDrive's and CrossCubes' payments never mix. Never change it. |
| `PUBLIC_API_URL` | `https://api.crosscubes.com` |
| `WEB_URL` | `https://www.crosscubes.com` |
| `PARTNER_WEB_URL` | `https://partners.crosscubes.com` |
| `HUB_WEB_URL` | `https://hub.crosscubes.com/<hub slug>` |
| `CORS_ORIGINS` | `https://crosscubes.com,https://www.crosscubes.com,https://partners.crosscubes.com,https://hub.crosscubes.com,https://admin.crosscubes.com` |
| `ADMIN_SLUG` | your secret admin path; same as the admin site's `NEXT_PUBLIC_ADMIN_SLUG` |
| `MONGO_URI` | the CrossCubes Atlas cluster, database `crosscubes` |
| `REDIS_URL` | the CrossCubes Redis; `REDIS_PREFIX=crosscubes` |
| `JWT_ACCESS_SECRET`, `JWT_REFRESH_SECRET`, `PASSWORD_PEPPER`, `VISITOR_HASH_SALT` | new values, each `openssl rand -hex 32`. Never reuse CatoDrive's. |
| `ADMIN_EMAIL` / `ADMIN_PASSWORD` | the first HQ login; password 12+ characters |
| `AWS_REGION`, `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`, `S3_BUCKET` | an IAM user that can only use the CrossCubes bucket |
| `STRIPE_SECRET_KEY`, `STRIPE_PUBLISHABLE_KEY` | CatoDrive's Stripe keys (shared for now) |
| `STRIPE_WEBHOOK_SECRET` | from the **new** CrossCubes webhook endpoint (section 5), not CatoDrive's |
| `EMAIL_*` / `SMTP_*`, `EMAIL_FROM` | CatoDrive's email account; `EMAIL_FROM` shows `CrossCubes <…@catodrive.com>` |
| `SMS_*` | CatoDrive's Twilio for now |
| `TRUST_PROXY_HOPS` | `1` with Cloudflare grey cloud, `2` once the orange cloud is on |
| `WHEELBASE_DEALER_ID` | the Wheelbase account the cars are insured under (CatoDrive's for now). Optional: staff can set or change it in Admin → Car Insurance, which wins over this value. While it is set, every trip is booked and paid through the Wheelbase widget on the car page and the CrossCubes checkout refuses bookings. |
| `WHEELBASE_WEBHOOK_SECRET` | 64 random hex characters (`openssl rand -hex 32`). The Zapier zap sends it in the `X-CrossCubes-Secret` header; without it every Wheelbase booking is refused. Set up the zap as in 1.3a. |
| `HOST_WEB_URL`, `INSURANCE_WEB_URL` | leave out; CrossCubes has no host site or insurer portal |

### 1.3a Wheelbase: cars, dates and bookings

With the dealer ID set, the server reads Wheelbase on its own, every "Read Wheelbase every (minutes)" in Admin → Car Insurance (default 15):

- **Cars.** Every listing in the account becomes a live CrossCubes car in the city whose area covers its location, under that city's fleet account (the hub's `operatorHostId`), with Wheelbase's photos, price and description, kept in step on every read. A listing outside every city, in a city without a fleet account, or missing a detail is listed under "listings not added yet" with the reason. A car deleted in CrossCubes is not added back. Switch: "Add Wheelbase cars automatically".
- **Dates.** Each car's taken days are copied from Wheelbase, so date search only shows free cars. This needs the server on a US network; Wheelbase refuses requests from India.

Guests book and pay inside the Wheelbase widget, which sends nothing back to CrossCubes, so a Zapier zap forwards each reservation's guest and amount for the city statement.

1. In Zapier, create a zap. Trigger: **Wheelbase → New or Updated Reservation**, and connect the Wheelbase account (dealer 4879882).
2. Action: **Webhooks by Zapier → POST**. URL: `https://<api domain>/api/v1/integrations/wheelbase/reservations`. Payload type: `json`.
3. Header: `X-CrossCubes-Secret` = the server's `WHEELBASE_WEBHOOK_SECRET`.
4. Data fields, mapped from the trigger: `reservationId` (reservation id), `rentalId` (rental id), `status`, `from` (pickup date), `to` (return date), `amount` (rental price before tax and insurance), `currency`, `renterName`, `updatedAt`.
5. Test the zap. The booking shows under Admin → Car Insurance → Wheelbase bookings.

The receiver is idempotent and ignores out-of-order updates, so Zapier retries are safe.

### 1.4 Nginx and HTTPS
`/etc/nginx/sites-available/crosscubes-api`:
```nginx
server {
  server_name api.crosscubes.com;
  client_max_body_size 2m;
  location / {
    proxy_pass http://127.0.0.1:4400;
    proxy_set_header Host $host;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
    proxy_http_version 1.1;
    proxy_set_header Upgrade $http_upgrade;
    proxy_set_header Connection "upgrade";
  }
}
```
```bash
sudo ln -s /etc/nginx/sites-available/crosscubes-api /etc/nginx/sites-enabled/
sudo nginx -t && sudo systemctl reload nginx
sudo certbot --nginx -d api.crosscubes.com
```

### 1.5 Health checks
- `GET /api/v1/system/health` → 200 when the process is up.
- `GET /api/v1/system/ready` → 200 only when Mongo and Redis are reachable.

---

## 2. Websites — Vercel (four projects)

Every project: `NEXT_PUBLIC_API_URL=https://api.crosscubes.com/api/v1`, `NEXT_PUBLIC_SITE_URL=https://www.crosscubes.com`,
`NEXT_PUBLIC_PARTNER_URL=https://partners.crosscubes.com`, the Maps key, and the Stripe publishable key where payments are taken.

| Project | Root | Domain | Extra settings |
|---|---|---|---|
| `crosscubes-web` | `frontend/` | `crosscubes.com`, `www` | — |
| `crosscubes-partners` | `partner-web/` | `partners.crosscubes.com` | — |
| `crosscubes-hub` | `crosscubes-hub/` | `hub.crosscubes.com` | `CROSSCUBES_HUB_SLUG` (long random secret; the build refuses to run without it) |
| `crosscubes-admin` | `admin-web/` | `admin.crosscubes.com` | `NEXT_PUBLIC_ADMIN_SLUG` = backend `ADMIN_SLUG` |

Keep the slugs out of this repo.

---

## 3. Cloudflare — DNS for crosscubes.com

| Type | Name | Target | Proxy |
|---|---|---|---|
| A | `api` | EC2 Elastic IP | grey cloud until certbot has issued, then orange (and `TRUST_PROXY_HOPS=2`) |
| CNAME | `@`, `www` | Vercel target for `crosscubes-web` | per Vercel |
| CNAME | `partners` | Vercel target for `crosscubes-partners` | per Vercel |
| CNAME | `hub` | Vercel target for `crosscubes-hub` | per Vercel |
| CNAME | `admin` | Vercel target for `crosscubes-admin` | per Vercel |

With the orange cloud on, set SSL/TLS to **Full (strict)**.

---

## 4. S3 — bucket CORS
Browsers upload photos and papers straight to S3, so the bucket must allow the sites:
```json
[{
  "AllowedOrigins": ["https://crosscubes.com", "https://www.crosscubes.com", "https://partners.crosscubes.com", "https://hub.crosscubes.com", "https://admin.crosscubes.com"],
  "AllowedMethods": ["PUT", "GET"],
  "AllowedHeaders": ["*"],
  "MaxAgeSeconds": 3000
}]
```

---

## 5. Stripe — shared with CatoDrive
- In CatoDrive's Stripe dashboard add a **second** webhook endpoint: `https://api.crosscubes.com/api/v1/payments/webhooks/stripe`,
  with the same events as CatoDrive's endpoint. Put its signing secret in `STRIPE_WEBHOOK_SECRET`.
- Both systems receive every event on the account. CrossCubes tags its payments `app: crosscubes` and skips
  anything untagged or tagged for another system, so CatoDrive's payments and refunds are never booked here.
- Card statements show CatoDrive's business name until CrossCubes has its own Stripe account.

---

## 6. First-boot checks
```bash
curl https://api.crosscubes.com/api/v1/system/ready     # {"mongo":true,"redis":true}
```
1. Sign in to `admin.crosscubes.com/<ADMIN_SLUG>/login`.
2. Send a test email and text: `POST /api/v1/notifications/test` (super_admin).
3. One city licence paid with a real card, then refunded.
4. One partner sign-up through to the dashboard.

## 7. Ops
- Logs: `pm2 logs crosscubes-api`.
- Rotate `JWT_*` and `ADMIN_PASSWORD` on a schedule; they are read at boot.
- The audit log is append-only; never edit the `auditlogs` collection.
- Scaling: `pm2 start dist/main.js -i max --name crosscubes-api` once there is real traffic; keep
  `MONGO_MAX_POOL × workers` under the Atlas tier's connection limit.
