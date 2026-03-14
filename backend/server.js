require('dotenv').config();
const express      = require('express');
const cors         = require('cors');
const path         = require('path');
const fs           = require('fs');
const cron         = require('node-cron');
const { v4: uuid } = require('uuid');
const bcrypt       = require('bcryptjs');
const jwt          = require('jsonwebtoken');
const mailer       = require('./mailer');

const app  = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, '../frontend/public')));

// ─────────────────────────────────────────────
//  JSON FILE DATABASE — survives restarts
// ─────────────────────────────────────────────
const DB_PATH = path.join(__dirname, 'db.json');

function loadDB() {
  try {
    if (fs.existsSync(DB_PATH))
      return JSON.parse(fs.readFileSync(DB_PATH, 'utf8'));
  } catch (e) { console.error('db.json read error:', e.message); }
  return null;
}
function saveDB() {
  try { fs.writeFileSync(DB_PATH, JSON.stringify(DB, null, 2), 'utf8'); }
  catch (e) { console.error('db.json write error:', e.message); }
}

// ─────────────────────────────────────────────
//  REAL SRM KTR LIBRARY LAYOUT
//  Based on official 360° virtual tour
//  3 Floors — 112 seats total
//
//  GROUND FLOOR (Level 0)
//    GR — General Reading Hall
//         8 × 4-seater group tables = 32 seats (GR-T01 to GR-T08, each A/B/C/D)
//
//  LEVEL 1
//    LR — Reading Hall (Long Tables)
//         4 × 8-seater long tables = 32 seats (LR-T01 to LR-T04, each A-H)
//    RS — Reference & Stacks (Single Carrel)
//         16 single carrel desks (RS-T01 to RS-T16)
//
//  LEVEL 2
//    SC — Individual Study Carrels
//         20 single carrel desks (SC-T01 to SC-T20)
//    DW — Digital / Computer Workstations
//         12 computer workstations (DW-T01 to DW-T12)
// ─────────────────────────────────────────────
const SRM_ZONES = {
  GR: { name: 'General Reading Hall',        floor: 'Ground Floor', type: 'group',    noise: 'moderate' },
  LR: { name: 'Reading Hall',                floor: 'Level 1',      type: 'long',     noise: 'moderate' },
  RS: { name: 'Reference & Stacks',          floor: 'Level 1',      type: 'carrel',   noise: 'silent'   },
  SC: { name: 'Individual Study Carrels',    floor: 'Level 2',      type: 'carrel',   noise: 'silent'   },
  DW: { name: 'Digital Workstations',        floor: 'Level 2',      type: 'computer', noise: 'moderate' },
};

// Seat definitions per zone
// GR: 8 tables × 4 seats (A,B,C,D)
// LR: 4 tables × 8 seats (A-H)
// RS: 16 single seats
// SC: 20 single seats
// DW: 12 single seats
function buildSeatId(zone, table, seat) {
  if (seat) return `${zone}-T${String(table).padStart(2,'0')}${seat}`;
  return `${zone}-T${String(table).padStart(2,'0')}`;
}

function makeSeats() {
  const seats = {};
  const info = SRM_ZONES;

  // Ground Floor — General Reading Hall: 8 group tables × 4 seats
  for (let t = 1; t <= 8; t++) {
    for (const s of ['A','B','C','D']) {
      const id = buildSeatId('GR', t, s);
      seats[id] = { id, zone:'GR', table:`GR-T${String(t).padStart(2,'0')}`, seatLabel:s, type:'group', zoneName:info.GR.name, floor:info.GR.floor, status:'available', userId:null, userName:null, userRoll:null, since:null, until:null, note:null };
    }
  }
  // Level 1 — Reading Hall: 4 long tables × 8 seats
  for (let t = 1; t <= 4; t++) {
    for (const s of ['A','B','C','D','E','F','G','H']) {
      const id = buildSeatId('LR', t, s);
      seats[id] = { id, zone:'LR', table:`LR-T${String(t).padStart(2,'0')}`, seatLabel:s, type:'long', zoneName:info.LR.name, floor:info.LR.floor, status:'available', userId:null, userName:null, userRoll:null, since:null, until:null, note:null };
    }
  }
  // Level 1 — Reference & Stacks: 16 single carrels
  for (let t = 1; t <= 16; t++) {
    const id = buildSeatId('RS', t, '');
    seats[id] = { id, zone:'RS', table:id, seatLabel:'', type:'carrel', zoneName:info.RS.name, floor:info.RS.floor, status:'available', userId:null, userName:null, userRoll:null, since:null, until:null, note:null };
  }
  // Level 2 — Individual Study Carrels: 20 single
  for (let t = 1; t <= 20; t++) {
    const id = buildSeatId('SC', t, '');
    seats[id] = { id, zone:'SC', table:id, seatLabel:'', type:'carrel', zoneName:info.SC.name, floor:info.SC.floor, status:'available', userId:null, userName:null, userRoll:null, since:null, until:null, note:null };
  }
  // Level 2 — Digital Workstations: 12 computer seats
  for (let t = 1; t <= 12; t++) {
    const id = buildSeatId('DW', t, '');
    seats[id] = { id, zone:'DW', table:id, seatLabel:'', type:'computer', zoneName:info.DW.name, floor:info.DW.floor, status:'available', userId:null, userName:null, userRoll:null, since:null, until:null, note:null };
  }
  return seats;
}

// ─────────────────────────────────────────────
//  INIT DATABASE
// ─────────────────────────────────────────────
let DB = {
  users:{}, seats:{}, bookings:{}, logs:[],
  announcements:[],
  noise:{ GR:'moderate', LR:'moderate', RS:'silent', SC:'silent', DW:'moderate' },
};

const saved = loadDB();
if (saved) {
  DB.users         = saved.users         || {};
  DB.bookings      = saved.bookings      || {};
  DB.logs          = saved.logs          || [];
  DB.announcements = saved.announcements || [];
  DB.noise         = saved.noise         || { GR:'moderate', LR:'moderate', RS:'silent', SC:'silent', DW:'moderate' };
  DB.seats = makeSeats();
  Object.values(DB.bookings).forEach(b => {
    if (b.status === 'active' && DB.seats[b.seatId]) {
      const s = DB.seats[b.seatId];
      s.status='reserved'; s.userId=b.userId; s.userName=b.name; s.userRoll=b.roll; s.since=b.from; s.until=b.until;
    }
    if (b.status === 'checked-in' && DB.seats[b.seatId]) {
      const s = DB.seats[b.seatId];
      s.status='occupied'; s.userId=b.userId; s.userName=b.name; s.userRoll=b.roll; s.since=b.from;
    }
  });
  console.log(`✅ Loaded db.json — ${Object.keys(DB.users).length} users, ${Object.keys(DB.bookings).length} bookings`);
} else {
  DB.seats = makeSeats();
  console.log('📋 Fresh start — no db.json found');
}

if (!Object.values(DB.users).find(u => u.role === 'admin')) {
  const adminId = uuid();
  DB.users[adminId] = {
    id:adminId, name:'Admin', roll:'ADMIN001',
    email: process.env.ADMIN_EMAIL || 'admin@srmist.edu.in',
    password: bcrypt.hashSync(process.env.ADMIN_PASSWORD || 'Admin@1234', 10),
    role:'admin', createdAt:Date.now(),
  };
  saveDB();
}

// ─────────────────────────────────────────────
//  MIDDLEWARE
// ─────────────────────────────────────────────
function auth(req, res, next) {
  const token = req.headers.authorization?.split(' ')[1];
  if (!token) return res.status(401).json({ error:'No token' });
  try { req.user = jwt.verify(token, process.env.JWT_SECRET); next(); }
  catch { res.status(401).json({ error:'Invalid token' }); }
}
function adminOnly(req, res, next) {
  if (req.user.role !== 'admin') return res.status(403).json({ error:'Admin only' });
  next();
}

// ─────────────────────────────────────────────
//  AUTH
// ─────────────────────────────────────────────
app.post('/api/auth/register', async (req, res) => {
  const { name, roll, email, password } = req.body;
  if (!name||!roll||!email||!password) return res.status(400).json({ error:'All fields required' });
  const exists = Object.values(DB.users).find(u => u.roll===roll.toUpperCase()||u.email===email);
  if (exists) return res.status(409).json({ error:'Roll number or email already registered' });
  const id = uuid();
  DB.users[id] = { id, name, roll:roll.toUpperCase(), email, password:await bcrypt.hash(password,10), role:'student', createdAt:Date.now() };
  saveDB();
  const token = jwt.sign({ id, name, roll:roll.toUpperCase(), email, role:'student' }, process.env.JWT_SECRET, { expiresIn:'7d' });
  mailer.sendWelcome({ name, email, roll }).catch(console.error);
  res.json({ token, user:{ id, name, roll:roll.toUpperCase(), email, role:'student' } });
});

app.post('/api/auth/login', async (req, res) => {
  const { email, password } = req.body;
  const user = Object.values(DB.users).find(u => u.email===email);
  if (!user||!(await bcrypt.compare(password, user.password)))
    return res.status(401).json({ error:'Invalid email or password' });
  const token = jwt.sign({ id:user.id, name:user.name, roll:user.roll, email:user.email, role:user.role }, process.env.JWT_SECRET, { expiresIn:'7d' });
  res.json({ token, user:{ id:user.id, name:user.name, roll:user.roll, email:user.email, role:user.role } });
});

app.get('/api/auth/me', auth, (req, res) => {
  const user = DB.users[req.user.id];
  if (!user) return res.status(404).json({ error:'User not found' });
  const { password:_, ...safe } = user;
  res.json(safe);
});

// ─────────────────────────────────────────────
//  SEATS
// ─────────────────────────────────────────────
app.get('/api/seats', auth, (req, res) => res.json(Object.values(DB.seats)));

app.post('/api/seats/:id/checkin', auth, (req, res) => {
  const id = decodeURIComponent(req.params.id);
  const seat = DB.seats[id];
  if (!seat) return res.status(404).json({ error:'Seat not found' });
  if (seat.status==='occupied') return res.status(409).json({ error:'Seat already occupied' });
  if (seat.status==='reserved' && seat.userId!==req.user.id && req.user.role!=='admin')
    return res.status(403).json({ error:'This seat is reserved by another student' });
  Object.values(DB.bookings).forEach(b => {
    if (b.seatId===seat.id && b.userId===req.user.id && b.status==='active') b.status='checked-in';
  });
  seat.status='occupied'; seat.userId=req.user.id; seat.userName=req.user.name; seat.userRoll=req.user.roll; seat.since=Date.now(); seat.until=null;
  addLog(seat.id,'checkin',req.user.name,req.user.roll);
  saveDB();
  res.json({ success:true, seat });
});

app.post('/api/seats/:id/checkout', auth, (req, res) => {
  const id = decodeURIComponent(req.params.id);
  const seat = DB.seats[id];
  if (!seat) return res.status(404).json({ error:'Seat not found' });
  if (seat.status==='available') return res.status(409).json({ error:'Seat is already free' });
  if (seat.userId!==req.user.id && req.user.role!=='admin') return res.status(403).json({ error:'Not your seat' });
  const who=seat.userName, roll=seat.userRoll;
  Object.values(DB.bookings).forEach(b => {
    if (b.seatId===seat.id && b.userId===seat.userId && b.status==='checked-in') b.status='completed';
  });
  freeSeat(seat.id); addLog(seat.id,'checkout',who,roll); saveDB();
  res.json({ success:true, seat:DB.seats[seat.id] });
});

// ─────────────────────────────────────────────
//  BOOKINGS
// ─────────────────────────────────────────────
app.post('/api/bookings', auth, (req, res) => {
  const { seatId, durationMins } = req.body;
  if (!seatId||!durationMins) return res.status(400).json({ error:'seatId and durationMins required' });
  const seat = DB.seats[seatId];
  if (!seat) return res.status(404).json({ error:'Seat not found' });
  if (seat.status!=='available') return res.status(409).json({ error:`Seat ${seatId} is not available` });
  const existing = Object.values(DB.bookings).find(b => b.userId===req.user.id && ['active','checked-in'].includes(b.status));
  if (existing) return res.status(409).json({ error:'You already have an active booking. Cancel it first.' });
  const from=Date.now(), until=from+durationMins*60*1000, id=uuid();
  DB.bookings[id] = { id, seatId, userId:req.user.id, name:req.user.name, roll:req.user.roll, email:req.user.email, from, until, durationMins, status:'active' };
  seat.status='reserved'; seat.userId=req.user.id; seat.userName=req.user.name; seat.userRoll=req.user.roll; seat.since=from; seat.until=until;
  addLog(seatId,'reserved',req.user.name,req.user.roll); saveDB();
  mailer.sendBookingConfirmation({ name:req.user.name, email:req.user.email, seatId, durationMins, until }).catch(console.error);
  res.json({ success:true, booking:DB.bookings[id], seat });
});

app.get('/api/bookings/mine', auth, (req, res) => {
  res.json(Object.values(DB.bookings).filter(b => b.userId===req.user.id));
});

app.delete('/api/bookings/:id', auth, (req, res) => {
  const booking = DB.bookings[req.params.id];
  if (!booking) return res.status(404).json({ error:'Booking not found' });
  if (booking.userId!==req.user.id && req.user.role!=='admin') return res.status(403).json({ error:'Not your booking' });
  booking.status='cancelled'; freeSeat(booking.seatId); addLog(booking.seatId,'cancelled',booking.name,booking.roll); saveDB();
  res.json({ success:true });
});

// ─────────────────────────────────────────────
//  ANNOUNCEMENTS
// ─────────────────────────────────────────────
app.get('/api/announcements', auth, (req, res) => {
  res.json(DB.announcements.filter(a=>!a.deleted).sort((a,b)=>b.createdAt-a.createdAt));
});
app.post('/api/announcements', auth, adminOnly, (req, res) => {
  const { title, body, type } = req.body;
  if (!title||!body) return res.status(400).json({ error:'title and body required' });
  const ann = { id:uuid(), title, body, type:type||'info', createdAt:Date.now(), createdBy:req.user.name, deleted:false };
  DB.announcements.unshift(ann);
  if (DB.announcements.length>20) DB.announcements=DB.announcements.slice(0,20);
  saveDB(); res.json({ success:true, announcement:ann });
});
app.delete('/api/announcements/:id', auth, adminOnly, (req, res) => {
  const ann = DB.announcements.find(a=>a.id===req.params.id);
  if (!ann) return res.status(404).json({ error:'Not found' });
  ann.deleted=true; saveDB(); res.json({ success:true });
});

// ─────────────────────────────────────────────
//  NOISE
// ─────────────────────────────────────────────
app.get('/api/noise', auth, (req, res) => res.json(DB.noise));
app.put('/api/noise/:zone', auth, adminOnly, (req, res) => {
  const { zone } = req.params, { level } = req.body;
  if (!['silent','moderate','noisy'].includes(level)) return res.status(400).json({ error:'Invalid level' });
  if (DB.noise[zone]===undefined) return res.status(404).json({ error:'Zone not found' });
  DB.noise[zone]=level; saveDB(); res.json({ success:true, noise:DB.noise });
});

// ─────────────────────────────────────────────
//  ADMIN
// ─────────────────────────────────────────────
app.get('/api/admin/users', auth, adminOnly, (req, res) => {
  res.json(Object.values(DB.users).map(({password:_,...u})=>u));
});
app.get('/api/admin/bookings', auth, adminOnly, (req, res) => res.json(Object.values(DB.bookings)));

app.put('/api/admin/seats/:id', auth, adminOnly, (req, res) => {
  const id = decodeURIComponent(req.params.id);
  const seat = DB.seats[id];
  if (!seat) return res.status(404).json({ error:'Seat not found' });
  const { status, note } = req.body;
  if (!['available','occupied','reserved','maintenance'].includes(status)) return res.status(400).json({ error:'Invalid status' });
  if (status==='available') freeSeat(seat.id); else { seat.status=status; if(note) seat.note=note; }
  addLog(seat.id,`admin-override:${status}`,'Admin','ADMIN'); saveDB();
  res.json({ success:true, seat:DB.seats[seat.id] });
});

app.get('/api/admin/analytics', auth, adminOnly, (req, res) => {
  const seatList=Object.values(DB.seats), logs=DB.logs, users=Object.values(DB.users), bookings=Object.values(DB.bookings);
  const zones={};
  seatList.forEach(s => {
    if (!zones[s.zone]) zones[s.zone]={ total:0, occupied:0, reserved:0, available:0, maintenance:0, name:s.zoneName, floor:s.floor, noise:DB.noise[s.zone]||'moderate' };
    zones[s.zone].total++; zones[s.zone][s.status]=(zones[s.zone][s.status]||0)+1;
  });
  const hourly=Array(24).fill(0);
  logs.filter(l=>l.ts>Date.now()-86400000).forEach(l=>{ hourly[new Date(l.ts).getHours()]++; });
  const seatAct={};
  logs.forEach(l=>{ seatAct[l.seatId]=(seatAct[l.seatId]||0)+1; });
  const topSeats=Object.entries(seatAct).sort((a,b)=>b[1]-a[1]).slice(0,5).map(([id,count])=>({id,count}));
  const studentStats={};
  bookings.forEach(b => {
    if (!studentStats[b.userId]) studentStats[b.userId]={ name:b.name, roll:b.roll, total:0, checkins:0, cancelled:0, expired:0 };
    studentStats[b.userId].total++;
    if (['completed','checked-in'].includes(b.status)) studentStats[b.userId].checkins++;
    if (b.status==='cancelled') studentStats[b.userId].cancelled++;
    if (b.status==='expired') studentStats[b.userId].expired++;
  });
  res.json({
    summary:{ totalSeats:seatList.length, available:seatList.filter(s=>s.status==='available').length, occupied:seatList.filter(s=>s.status==='occupied').length, reserved:seatList.filter(s=>s.status==='reserved').length, totalUsers:users.filter(u=>u.role==='student').length, totalBookings:bookings.length, activeBookings:bookings.filter(b=>b.status==='active').length, completedToday:bookings.filter(b=>b.status==='completed'&&b.from>Date.now()-86400000).length },
    zones, hourly, topSeats, topStudents:Object.values(studentStats).sort((a,b)=>b.total-a.total).slice(0,10),
    recentLogs:logs.slice(-20).reverse(),
  });
});

app.get('/debug', (req,res) => res.json({
  users:Object.values(DB.users).map(({password:_,...u})=>u),
  seats:Object.values(DB.seats), bookings:Object.values(DB.bookings),
  announcements:DB.announcements, noise:DB.noise, logs:DB.logs.slice(-30),
}));

// ─────────────────────────────────────────────
//  HELPERS
// ─────────────────────────────────────────────
function freeSeat(seatId) {
  const s=DB.seats[seatId]; if(!s) return;
  s.status='available'; s.userId=s.userName=s.userRoll=s.since=s.until=s.note=null;
}
function addLog(seatId,action,who,roll) {
  DB.logs.push({ seatId, action, who, roll, ts:Date.now() });
  if (DB.logs.length>500) DB.logs.shift();
}

// ─────────────────────────────────────────────
//  CRON — auto-release expired reservations
// ─────────────────────────────────────────────
cron.schedule('* * * * *', () => {
  const now=Date.now(); let changed=false;
  Object.values(DB.seats).forEach(seat => {
    if (seat.status==='reserved' && seat.until && seat.until<now) {
      const name=seat.userName, email=DB.users[seat.userId]?.email;
      addLog(seat.id,'auto-released',name,seat.userRoll); freeSeat(seat.id);
      Object.values(DB.bookings).forEach(b => { if(b.seatId===seat.id&&b.status==='active') b.status='expired'; });
      if (email) mailer.sendExpiry({ name, email, seatId:seat.id }).catch(console.error);
      changed=true;
    }
  });
  if (changed) saveDB();
});

app.get('*', (req,res) => res.sendFile(path.join(__dirname,'../frontend/public/index.html')));

app.listen(PORT, () => {
  console.log(`\n🚀 LibraSense running at http://localhost:${PORT}`);
  console.log(`📁 Database: ${DB_PATH}`);
  console.log(`💺 Seats: ${Object.keys(DB.seats).length} total across 5 zones on 3 floors`);
  console.log(`   Ground: GR (${Object.keys(DB.seats).filter(k=>k.startsWith('GR')).length} seats)`);
  console.log(`   Level1: LR (${Object.keys(DB.seats).filter(k=>k.startsWith('LR')).length}) + RS (${Object.keys(DB.seats).filter(k=>k.startsWith('RS')).length})`);
  console.log(`   Level2: SC (${Object.keys(DB.seats).filter(k=>k.startsWith('SC')).length}) + DW (${Object.keys(DB.seats).filter(k=>k.startsWith('DW')).length})`);
  console.log(`👥 Students: ${Object.values(DB.users).filter(u=>u.role==='student').length} registered\n`);
});
