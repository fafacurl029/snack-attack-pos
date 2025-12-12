# Snack Attack — Food Ordering + POS + Inventory + Kitchen Display (Render-ready)

This is a complete, deployable web app for **Snack Attack** with:
- Customer ordering + tracking
- Staff POS (cash + change, GCash)
- Kitchen display screen
- Admin dashboard (users, products, inventory, reports)
- CSV + Excel export
- Printable thermal-style receipt (80mm)

## Default Accounts (change after first login)
- **Admin**: `admin` / `Admin@12345`
- **Staff**: `staff` / `Staff@12345`
- **Kitchen**: `kitchen` / `Kitchen@12345`

---

## Run Locally

1) Install Node.js (18+)
2) Clone / unzip this repo
3) Create `.env` from `.env.example`
4) Install + run:

```bash
npm install
npm start
```

Open:
- Customer ordering: `http://localhost:3000/`
- Login: `http://localhost:3000/login.html`
- POS: `http://localhost:3000/pos.html`
- Kitchen: `http://localhost:3000/kitchen.html`
- Admin: `http://localhost:3000/admin.html`

Data is stored in `./data/` by default (SQLite database + uploads + sessions).

---

## Deploy to Render using GitHub (recommended)

### A) Push to GitHub
1. Create a new GitHub repo (public or private)
2. Upload all files from this project (or push with git)

### B) Create a Render Web Service
1. Go to Render → **New** → **Web Service**
2. Connect your GitHub repo
3. Settings:
   - **Environment**: Node
   - **Build Command**: `npm install`
   - **Start Command**: `npm start`

### C) Add Environment Variables (Render → Environment)
- `NODE_ENV` = `production`
- `DATA_DIR` = `/var/data`
- `SESSION_SECRET` = generate a long random string (Render can generate)
- `PORT` = `10000` (Render sets this; keep if needed)

### D) Add a Persistent Disk (IMPORTANT for SQLite)
Render → your service → **Disks**:
- Add Disk
- **Mount Path**: `/var/data`
- **Size**: 1GB

Deploy. After deploy, open your Render URL.

---

## How QR/GCash Settings Work
Admin → **Settings** tab:
- Update GCash number
- Upload QR image (stored under `DATA_DIR/uploads/`)

---

## Reports Export
Admin → Reports:
- Export CSV
- Export Excel (.xlsx)

---

## Troubleshooting

### “Not authenticated”
You must login at `/login.html`. If you opened POS/Admin/Kitchen directly in a new browser session,
login first, then reopen the page.

### SQLite data disappears on Render
You did not attach a **Persistent Disk** OR `DATA_DIR` isn’t set to `/var/data`.

### Uploads not showing
Make sure `DATA_DIR` points to a writable directory and that the disk is mounted on Render.

---

## Security Notes
- Passwords are hashed using bcrypt
- Role-based route protection (Admin/Staff/Kitchen)
- Login is rate-limited
- Session cookie is HTTP-only

You must change default passwords after deployment.
