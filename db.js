const fs = require("fs");
const path = require("path");

const DB_PATH = path.join(__dirname, "db.json");

const EMPTY_DB = {
  users: [],       // { id, email, passwordHash, name, createdAt }
  habits: [],       // { id, userId, name, emoji, color, frequency, createdAt }
  checkins: [],      // { id, userId, habitId, date (YYYY-MM-DD) }
  workouts: []       // { id, userId, type, durationMin, calories, notes, date, createdAt }
};

function load() {
  if (!fs.existsSync(DB_PATH)) {
    fs.writeFileSync(DB_PATH, JSON.stringify(EMPTY_DB, null, 2));
  }
  try {
    return JSON.parse(fs.readFileSync(DB_PATH, "utf-8"));
  } catch {
    return JSON.parse(JSON.stringify(EMPTY_DB));
  }
}

function save(db) {
  fs.writeFileSync(DB_PATH, JSON.stringify(db, null, 2));
}

module.exports = { load, save };
