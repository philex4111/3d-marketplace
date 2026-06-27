# MESH 3D Marketplace

A full-stack marketplace for 3D artists to sell models to game developers and digital creators. Buyers preview assets in an interactive WebGL viewer before purchase; sellers upload optimized display files and deliver full source packages through secure, time-limited downloads.

## Overview

MESH is built around how 3D asset marketplaces actually work: lightweight `.glb` previews for browsing, private `.zip` archives for purchased source files, and payments that work both locally and globally. The platform takes a **15% commission** on sales and keeps egress costs low by serving previews from Cloudflare R2 while vaulting source files behind pre-signed URLs that expire after **15 minutes**.

Creators get a seller dashboard for uploads, sales tracking, and monetization tools. Platform admins get moderation, escrow, payouts, and earnings visibility through a dedicated admin panel.

## Features

### For buyers
- Browse and search the marketplace by category, tags, and price
- Orbit, zoom, and inspect models in a real-time **Three.js / React Three Fiber** viewer
- Pay via **M-Pesa STK Push**, **PayPal**, or **USDT** (Tron / Ethereum)
- Download purchased source files through verified, expiring download links

### For sellers
- **Dual-file upload system**: public `.glb`/`.gltf` for preview, private `.zip` for source delivery
- Direct-to-R2 uploads with a backend proxy fallback when browser CORS blocks storage
- Auto-generated thumbnails and **AI-assisted tagging** (local keyword extraction first; external APIs for advanced tasks)
- Seller dashboard: asset management, sales history, profile, and payout settings (M-Pesa / crypto wallet)
- **Monetization**: featured listing slots, Pro subscriptions, and AI credit packs

### For admins
- Asset moderation queue (approve, reject, suspend)
- User management (ban / unban)
- Escrow queue and manual or scheduled seller payouts
- Platform health metrics and earnings summary (commissions, featured slots, Pro, credits)
- Advert slot management

## Tech stack

| Layer | Technologies |
|-------|--------------|
| **Frontend** | React 18, Vite, React Router, Tailwind CSS, Zustand |
| **3D viewer** | Three.js, `@react-three/fiber`, `@react-three/drei` |
| **Backend** | Python, FastAPI, Uvicorn |
| **Database & auth** | Supabase (PostgreSQL + JWT auth) |
| **Storage** | Cloudflare R2 (public display bucket + private vault bucket) |
| **Payments** | M-Pesa Daraja API, PayPal REST + webhooks, USDT via TronGrid / Etherscan |
| **AI** | Local tag parser + Meshy / Leonardo APIs (credit-gated) |

## Architecture

```
┌─────────────┐     JWT auth      ┌─────────────┐
│   React     │ ◄──────────────► │   Supabase   │
│   (Vite)    │                   │  Auth + DB   │
└──────┬──────┘                   └──────▲───────┘
       │ REST API                        │
       ▼                                 │
┌─────────────┐   pre-signed URLs  ┌─────┴───────┐
│   FastAPI   │ ◄────────────────► │ Cloudflare  │
│   Backend   │                    │     R2      │
└──────┬──────┘                    └─────────────┘
       │
       ├── M-Pesa / PayPal / Crypto payment providers
       └── Meshy / Leonardo (AI credits)
```

**Upload flow:** the frontend requests pre-signed PUT URLs from the API, uploads the display GLB to the public bucket and the source ZIP to the private vault, then creates the asset record in Supabase. Purchases are recorded as transactions; download requests verify ownership before issuing a short-lived vault URL.

## Project structure

```
3d-marketplace/
├── backend/
│   └── app/
│       ├── controllers/   # Business logic (payments, admin, files, monetization)
│       ├── core/          # Settings and middleware setup
│       ├── middleware/    # JWT auth and admin guards
│       ├── routes/        # FastAPI route definitions
│       ├── services/      # R2 storage, AI tools, payouts
│       └── workers/       # Scheduled payout cron
├── frontend/
│   └── src/
│       ├── components/    # Layout, viewer, dashboard UI
│       ├── pages/         # Home, Marketplace, ProductView, Dashboard, Admin
│       ├── services/      # API and Supabase clients
│       └── store/         # Zustand user state
└── README.md
```

## Getting started

### Prerequisites
- Node.js 18+
- Python 3.11+ (3.14 supported with sync Supabase client)
- Supabase project (URL, anon key, service role key, JWT secret)
- Cloudflare R2 bucket credentials (optional for local smoke testing without uploads)

### Backend

```bash
cd backend
python -m venv venv
venv\Scripts\activate        # Windows
pip install -r requirements.txt
# Configure backend/.env (see backend/app/core/config.py for all variables)
uvicorn app.main:app --reload --port 8000
```

API docs (development): [http://localhost:8000/docs](http://localhost:8000/docs)

### Frontend

```bash
cd frontend
npm install
# Configure frontend/.env (Supabase URL, anon key, API base URL)
npm run dev
```

App: [http://localhost:5173](http://localhost:5173)

## Key routes

| Path | Description |
|------|-------------|
| `/` | Landing page with hero 3D viewer |
| `/marketplace` | Browse published assets |
| `/asset/:slug` | Product detail with viewer and checkout |
| `/dashboard` | Seller dashboard (auth required) |
| `/admin` | Admin panel (admin auth required) |

## Environment configuration

Backend settings are defined in `backend/app/core/config.py`. Important groups:

- **Supabase** — database and JWT validation
- **Cloudflare R2** — `R2_PUBLIC_BUCKET`, `R2_PRIVATE_BUCKET`, credentials
- **M-Pesa** — consumer key/secret, shortcode, passkey, callback URL
- **PayPal** — client ID/secret, webhook ID, sandbox/live mode
- **Crypto** — platform USDT wallet addresses, TronGrid / Etherscan API keys
- **AI** — Meshy and Leonardo API keys
- **Admin** — `ADMIN_EMAIL` for admin route access

## Platform economics

- **15%** platform fee on asset sales
- **$0** egress on downloads (R2-backed delivery model)
- Additional revenue from featured listings, Pro subscriptions, and AI credit packs

## License

Private project — add a license here if you plan to open-source or distribute it.
