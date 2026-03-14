const nodemailer = require('nodemailer');

const transporter = nodemailer.createTransport({
  host: 'smtp.gmail.com',
  port: 587,
  secure: false,
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS,
  },
  tls: { rejectUnauthorized: false },
});

const FROM = process.env.EMAIL_FROM || 'LibraSense <no-reply@srmist.edu.in>';

function formatTime(ts) {
  return new Date(ts).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: true });
}

const baseStyle = `
  font-family: 'Segoe UI', Arial, sans-serif;
  background: #0a0e1a;
  color: #e8edf5;
  padding: 0;
  margin: 0;
`;
const card = `
  max-width: 520px;
  margin: 32px auto;
  background: #111827;
  border-radius: 16px;
  overflow: hidden;
  border: 1px solid #1e2d45;
`;
const header = (color) => `
  background: ${color};
  padding: 28px 32px;
  text-align: center;
`;

// ── WELCOME EMAIL ──────────────────────────────────
async function sendWelcome({ name, email, roll }) {
  if (!process.env.EMAIL_USER) return;
  await transporter.sendMail({
    from: FROM, to: email,
    subject: '🎉 Welcome to LibraSense — SRM Library',
    html: `
    <body style="${baseStyle}">
      <div style="${card}">
        <div style="${header('#1a2d4a')}">
          <h1 style="color:#4d9fff;margin:0;font-size:28px;">📚 LibraSense</h1>
          <p style="color:#6b7a99;margin:8px 0 0;font-size:14px;">SRM Library Seat Management</p>
        </div>
        <div style="padding:32px;">
          <h2 style="color:#e8edf5;margin:0 0 8px;">Welcome, ${name}! 👋</h2>
          <p style="color:#6b7a99;line-height:1.7;">Your account is ready. You can now book and check in to library seats in real time.</p>
          <div style="background:#1a2235;border-radius:10px;padding:16px 20px;margin:24px 0;border:1px solid #1e2d45;">
            <p style="margin:0;color:#6b7a99;font-size:13px;">Roll Number</p>
            <p style="margin:4px 0 0;color:#4d9fff;font-size:18px;font-weight:700;font-family:monospace;">${roll}</p>
          </div>
          <p style="color:#6b7a99;font-size:13px;">Login with your registered email and password.</p>
        </div>
        <div style="padding:16px 32px;border-top:1px solid #1e2d45;text-align:center;">
          <p style="color:#6b7a99;font-size:12px;margin:0;">SRM Institute of Science and Technology · KTR Campus</p>
        </div>
      </div>
    </body>`,
  });
}

// ── BOOKING CONFIRMATION ───────────────────────────
async function sendBookingConfirmation({ name, email, seatId, durationMins, until }) {
  if (!process.env.EMAIL_USER) return;
  await transporter.sendMail({
    from: FROM, to: email,
    subject: `✅ Seat ${seatId} Reserved — LibraSense`,
    html: `
    <body style="${baseStyle}">
      <div style="${card}">
        <div style="${header('#0f2a1a')}">
          <p style="color:#00d68f;margin:0;font-size:36px;">✅</p>
          <h2 style="color:#00d68f;margin:8px 0 0;">Seat Reserved!</h2>
        </div>
        <div style="padding:32px;">
          <p style="color:#6b7a99;margin:0 0 20px;">Hi ${name}, your seat is confirmed.</p>
          <div style="background:#1a2235;border-radius:10px;padding:20px;border:1px solid #1e2d45;">
            <div style="display:flex;justify-content:space-between;margin-bottom:12px;">
              <span style="color:#6b7a99;font-size:13px;">Seat ID</span>
              <span style="color:#e8edf5;font-weight:700;font-family:monospace;font-size:16px;">${seatId}</span>
            </div>
            <div style="display:flex;justify-content:space-between;margin-bottom:12px;">
              <span style="color:#6b7a99;font-size:13px;">Duration</span>
              <span style="color:#e8edf5;font-weight:600;">${durationMins} minutes</span>
            </div>
            <div style="display:flex;justify-content:space-between;">
              <span style="color:#6b7a99;font-size:13px;">Reserved until</span>
              <span style="color:#ffd166;font-weight:600;">${formatTime(until)}</span>
            </div>
          </div>
          <p style="color:#6b7a99;font-size:13px;margin-top:20px;">
            ⚠️ Your reservation will auto-release if you don't check in before the time expires.
          </p>
        </div>
      </div>
    </body>`,
  });
}

// ── EXPIRY NOTIFICATION ────────────────────────────
async function sendExpiry({ name, email, seatId }) {
  if (!process.env.EMAIL_USER) return;
  await transporter.sendMail({
    from: FROM, to: email,
    subject: `⏰ Reservation for Seat ${seatId} Expired`,
    html: `
    <body style="${baseStyle}">
      <div style="${card}">
        <div style="${header('#2a1a0f')}">
          <p style="color:#ffd166;margin:0;font-size:36px;">⏰</p>
          <h2 style="color:#ffd166;margin:8px 0 0;">Reservation Expired</h2>
        </div>
        <div style="padding:32px;">
          <p style="color:#6b7a99;">Hi ${name}, your reservation for seat <strong style="color:#e8edf5;font-family:monospace;">${seatId}</strong> has expired and the seat has been released.</p>
          <p style="color:#6b7a99;font-size:13px;">You can make a new booking any time from the LibraSense portal.</p>
        </div>
      </div>
    </body>`,
  });
}

module.exports = { sendWelcome, sendBookingConfirmation, sendExpiry };
