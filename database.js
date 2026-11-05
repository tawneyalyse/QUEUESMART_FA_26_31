const mysql = require("mysql2/promise");
const bcrypt = require("bcrypt");

const db = mysql.createPool({
  host: "localhost",
  port: 3306,
  user: "root",
  password: "Piper2020",
  database: "queuesmart",
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0
});

module.exports = { db, bcrypt };
