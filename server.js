const express = require("express");
const cors = require("cors");
const mysql = require("mysql2");
require("dotenv").config();

const app = express();

app.use(cors());
app.use(express.json());

/* ---------------- DB CONNECTION ---------------- */
const db = mysql.createPool({
  host: process.env.DB_HOST,
  port: process.env.DB_PORT,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,

  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0,

  ssl: {
    rejectUnauthorized: false // required for Aiven
  }
});

/* ---------------- TEST CONNECTION ---------------- */
db.getConnection((err, connection) => {
  if (err) {
    console.error("❌ Database connection failed:", err);
  } else {
    console.log("✅ Connected to Aiven MySQL!");
    connection.release();
  }
});

app.get("/api/projects", (req, res) => {
  db.query("SELECT * FROM projects", (err, results) => {
    if (err) {
      return res.status(500).json(err);
    }
    res.json(results);
  });
});

/* ---------------- SAMPLE ROUTE ---------------- */
app.get("/", (req, res) => {
  res.send("Server is running 🚀");
});

/* ---------------- TEST QUERY ROUTE ---------------- */
app.get("/test-db", (req, res) => {
  db.query("SELECT 1 + 1 AS result", (err, results) => {
    if (err) {
      return res.status(500).json(err);
    }
    res.json(results);
  });
});

/* ---------------- START SERVER ---------------- */
const PORT = process.env.PORT || 5000;

app.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
});