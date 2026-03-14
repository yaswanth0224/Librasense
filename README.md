# 📚 LibraSense v2 — Full Stack Library Seat System

**· Smart Campus App · SRM KTR**

---

## 🗂️ Project Structure

```
librasense-v2/
├── backend/
│   ├── server.js        ← Express API server
│   ├── mailer.js        ← Email notifications
│   ├── .env             ← Your secrets (never commit this)
│   └── package.json
└── frontend/
    └── public/
        └── index.html   ← Complete single-file frontend
```

---

## ✅ Features

| Feature | Details |
|---|---|
| 🔐 Auth | Register / Login with JWT tokens |
| 🗺️ Live seat map | 40 seats across 3 zones, updates every 10s |
| ✅ QR Check-in | Unique QR per seat, scan to check in |
| 📅 Advance booking | Reserve with auto-release timer |
| ⏰ Auto-release | Cron job frees expired reservations every minute |
| 📧 Emails | Welcome, booking confirmation, expiry alerts |
| ⚙️ Admin dashboard | Override seats, view all users, all bookings |
| 📊 Analytics | Hourly activity chart, zone occupancy, top seats |

---

## 🚀 Setup in 10 Minutes

### Step 1 — Install Node.js
Download from: https://nodejs.org (choose LTS version)

### Step 2 — Install dependencies
```bash
cd librasense-v2/backend
npm install
```

### Step 3 — Configure email (Gmail)
1. Go to your Google Account → Security → 2-Step Verification → App Passwords
2. Create a new App Password for "Mail"
3. Edit `backend/.env`:

```env
PORT=3000
JWT_SECRET=pick_any_random_string_here_make_it_long

EMAIL_USER=yourgmail@gmail.com
EMAIL_PASS=xxxx xxxx xxxx xxxx   ← 16-char app password (no spaces)
EMAIL_FROM=LibraSense <yourgmail@gmail.com>

ADMIN_EMAIL=admin@srmist.edu.in
ADMIN_PASSWORD=Admin@srmist
```

### Step 4 — Run the server
```bash
cd backend
npm start
```
You'll see: `🚀 LibraSense running at http://localhost:3000`

### Step 5 — Open chrome
Go to: **https://librasense.onrender.com/**

---

## 👤 Default Admin Login
```
Email:    admin@srmist.edu.in
Password: Admin@srmist
```
*(Change these in .env before demo)*

---

## 📱 QR Code Flow

Each seat has a unique QR code that encodes:
```
https://your-app.onrender.com?seat=A03
```

When scanned:
- If not logged in → redirected to login → then to that seat
- If logged in → seat detail opens automatically

## 🏗️ API Endpoints

| Method | Route | Auth | Description |
|---|---|---|---|
| POST | /api/auth/register | ❌ | Create account |
| POST | /api/auth/login | ❌ | Get JWT token |
| GET  | /api/seats | ✅ | All seats |
| POST | /api/seats/:id/checkin | ✅ | Check in |
| POST | /api/seats/:id/checkout | ✅ | Check out |
| POST | /api/bookings | ✅ | Create booking |
| GET  | /api/bookings/mine | ✅ | My bookings |
| DELETE | /api/bookings/:id | ✅ | Cancel booking |
| GET  | /api/admin/analytics | 🔐 Admin | Analytics data |
| GET  | /api/admin/users | 🔐 Admin | All users |
| PUT  | /api/admin/seats/:id | 🔐 Admin | Override seat |

---

## 🗺️ Real-World Deployment Plan

> "In real deployment at SRM, we would:
> 1. Print QR stickers for every seat
> 2. Connect to SRM student database for roll verification  
> 3. Host on college servers
> 4. Integrate with SRM portal via API
> 5. Add mobile app via React Native"

---

*Built for · SRM Institute of Science and Technology · March 2026*
