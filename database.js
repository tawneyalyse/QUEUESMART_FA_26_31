const sqlite3 = require("sqlite3").verbose();
const bcrypt = require("bcrypt");
const path = require("path");
const db = new sqlite3.Database(path.join(__dirname, "queuesmart.db"));

db.serialize(() => {
  db.run(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      email TEXT UNIQUE NOT NULL,
      password TEXT NOT NULL,
      role TEXT NOT NULL DEFAULT 'User'
        CHECK (role IN ('User', 'Administrator'))
    )
  `);
});
module.exports = { db, bcrypt };
