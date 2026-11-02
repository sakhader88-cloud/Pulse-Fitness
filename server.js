const express = require("express");
const session = require("express-session");
const bcrypt = require("bcryptjs");
const crypto = require("crypto");
const path = require("path");
const { load, save } = require("./db");

const app = express();
const PORT = process.env.PORT || 4400;

app.use(express.json());
app.use(express.static(path.join(__dirname, "public")));

app.use(session({
  secret: process.env.SESSION_SECRET || "pulse-dev-secret-change-in-production",
  resave: false,
  saveUninitialized: false,
  cookie: {
    maxAge: 30 * 24 * 60 * 60 * 1000, // 30 days
    httpOnly: true,
    sameSite: "lax"
  }
}));

function uid() {
  return crypto.randomUUID();
}

function todayStr() {
  return new Date().toISOString().slice(0, 10);
}

function requireAuth(req, res, next) {
  if (!req.session.userId) {
    return res.status(401).json({ error: "Not signed in." });
  }
  next();
}

function isValidEmail(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

function publicUser(u) {
  return { id: u.id, email: u.email, name: u.name, createdAt: u.createdAt };
}

// ============ AUTH ============

app.post("/api/auth/register", async (req, res) => {
  const { email, password, name } = req.body || {};

  if (!email || !isValidEmail(email)) {
    return res.status(400).json({ error: "A valid email is required." });
  }
  if (!password || password.length < 6) {
    return res.status(400).json({ error: "Password must be at least 6 characters." });
  }
  if (!name || !name.trim()) {
    return res.status(400).json({ error: "Name is required." });
  }

  const db = load();
  if (db.users.find(u => u.email.toLowerCase() === email.toLowerCase())) {
    return res.status(409).json({ error: "An account with this email already exists." });
  }

  const passwordHash = await bcrypt.hash(password, 10);
  const user = {
    id: uid(),
    email: email.trim(),
    name: name.trim(),
    passwordHash,
    createdAt: new Date().toISOString()
  };
  db.users.push(user);
  save(db);

  req.session.userId = user.id;
  res.status(201).json({ user: publicUser(user) });
});

app.post("/api/auth/login", async (req, res) => {
  const { email, password } = req.body || {};
  const db = load();
  const user = db.users.find(u => u.email.toLowerCase() === (email || "").toLowerCase());

  if (!user || !(await bcrypt.compare(password || "", user.passwordHash))) {
    return res.status(401).json({ error: "Incorrect email or password." });
  }

  req.session.userId = user.id;
  res.json({ user: publicUser(user) });
});

app.post("/api/auth/logout", (req, res) => {
  req.session.destroy(() => res.json({ success: true }));
});

app.get("/api/auth/me", (req, res) => {
  if (!req.session.userId) return res.json({ user: null });
  const db = load();
  const user = db.users.find(u => u.id === req.session.userId);
  if (!user) return res.json({ user: null });
  res.json({ user: publicUser(user) });
});

// ============ HABITS ============

app.get("/api/habits", requireAuth, (req, res) => {
  const db = load();
  const habits = db.habits.filter(h => h.userId === req.session.userId);
  const today = todayStr();
  const withStatus = habits.map(h => ({
    ...h,
    doneToday: db.checkins.some(c => c.habitId === h.id && c.date === today)
  }));
  res.json(withStatus);
});

app.post("/api/habits", requireAuth, (req, res) => {
  const { name, emoji, color, frequency } = req.body || {};
  if (!name || !name.trim()) {
    return res.status(400).json({ error: "Habit name is required." });
  }
  const db = load();
  const habit = {
    id: uid(),
    userId: req.session.userId,
    name: name.trim(),
    emoji: emoji || "\u2728",
    color: color || "violet",
    frequency: frequency || "daily",
    createdAt: new Date().toISOString()
  };
  db.habits.push(habit);
  save(db);
  res.status(201).json(habit);
});

app.delete("/api/habits/:id", requireAuth, (req, res) => {
  const db = load();
  const habit = db.habits.find(h => h.id === req.params.id && h.userId === req.session.userId);
  if (!habit) return res.status(404).json({ error: "Habit not found." });

  db.habits = db.habits.filter(h => h.id !== req.params.id);
  db.checkins = db.checkins.filter(c => c.habitId !== req.params.id);
  save(db);
  res.json({ success: true });
});

// Toggle today's check-in for a habit
app.post("/api/habits/:id/checkin", requireAuth, (req, res) => {
  const db = load();
  const habit = db.habits.find(h => h.id === req.params.id && h.userId === req.session.userId);
  if (!habit) return res.status(404).json({ error: "Habit not found." });

  const today = todayStr();
  const existing = db.checkins.find(c => c.habitId === habit.id && c.date === today);

  if (existing) {
    db.checkins = db.checkins.filter(c => c.id !== existing.id);
    save(db);
    return res.json({ doneToday: false });
  }

  db.checkins.push({ id: uid(), userId: req.session.userId, habitId: habit.id, date: today });
  save(db);
  res.json({ doneToday: true });
});

// ============ WORKOUTS ============

app.get("/api/workouts", requireAuth, (req, res) => {
  const db = load();
  const workouts = db.workouts
    .filter(w => w.userId === req.session.userId)
    .sort((a, b) => new Date(b.date) - new Date(a.date));
  res.json(workouts);
});

app.post("/api/workouts", requireAuth, (req, res) => {
  const { type, durationMin, calories, notes, date } = req.body || {};
  if (!type || !type.trim()) {
    return res.status(400).json({ error: "Workout type is required." });
  }
  if (!durationMin || Number(durationMin) <= 0) {
    return res.status(400).json({ error: "Duration must be greater than 0." });
  }

  const db = load();
  const workout = {
    id: uid(),
    userId: req.session.userId,
    type: type.trim(),
    durationMin: Number(durationMin),
    calories: calories ? Number(calories) : null,
    notes: (notes || "").trim(),
    date: date || todayStr(),
    createdAt: new Date().toISOString()
  };
  db.workouts.push(workout);
  save(db);
  res.status(201).json(workout);
});

app.delete("/api/workouts/:id", requireAuth, (req, res) => {
  const db = load();
  const workout = db.workouts.find(w => w.id === req.params.id && w.userId === req.session.userId);
  if (!workout) return res.status(404).json({ error: "Workout not found." });

  db.workouts = db.workouts.filter(w => w.id !== req.params.id);
  save(db);
  res.json({ success: true });
});

// ============ STATS ============

app.get("/api/stats", requireAuth, (req, res) => {
  const db = load();
  const userId = req.session.userId;
  const habits = db.habits.filter(h => h.userId === userId);
  const checkins = db.checkins.filter(c => c.userId === userId);
  const workouts = db.workouts.filter(w => w.userId === userId);

  // Streak per habit: consecutive days (including today or yesterday) with a check-in
  const habitStreaks = habits.map(h => {
    const dates = new Set(checkins.filter(c => c.habitId === h.id).map(c => c.date));
    let streak = 0;
    let cursor = new Date();
    // allow streak to still count if today isn't done yet but yesterday was
    if (!dates.has(todayStr())) cursor.setDate(cursor.getDate() - 1);
    while (dates.has(cursor.toISOString().slice(0, 10))) {
      streak++;
      cursor.setDate(cursor.getDate() - 1);
    }
    return { habitId: h.id, name: h.name, emoji: h.emoji, streak };
  });

  // Last 7 days completion heatmap (fraction of habits done each day)
  const last7 = [];
  for (let i = 6; i >= 0; i--) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    const dateStr = d.toISOString().slice(0, 10);
    const doneCount = checkins.filter(c => c.date === dateStr).length;
    last7.push({
      date: dateStr,
      label: d.toLocaleDateString("en-US", { weekday: "short" }),
      completion: habits.length ? doneCount / habits.length : 0,
      doneCount
    });
  }

  const totalCheckinsEver = checkins.length;
  const totalWorkouts = workouts.length;
  const totalMinutes = workouts.reduce((sum, w) => sum + (w.durationMin || 0), 0);
  const totalCalories = workouts.reduce((sum, w) => sum + (w.calories || 0), 0);
  const bestStreak = habitStreaks.reduce((max, h) => Math.max(max, h.streak), 0);

  const todayDone = checkins.filter(c => c.date === todayStr()).length;
  const todayTotal = habits.length;

  res.json({
    habitStreaks,
    last7,
    totalCheckinsEver,
    totalWorkouts,
    totalMinutes,
    totalCalories,
    bestStreak,
    todayDone,
    todayTotal
  });
});

// SPA fallback (but never intercept API or manifest/service-worker requests)
app.get(/^(?!\/api)(?!.*\.(js|json|png|ico|webmanifest)$).*/, (req, res) => {
  res.sendFile(path.join(__dirname, "public", "index.html"));
});

app.listen(PORT, () => {
  console.log(`Pulse server running at http://localhost:${PORT}`);
});
