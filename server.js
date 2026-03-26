const express = require("express");
const cors = require("cors");
const mysql = require("mysql2");
const multer = require("multer");
const fs = require("fs");
const path = require("path");
require("dotenv").config();
const ImageKit = require("imagekit");

const app = express();
app.use(cors());
app.use(express.json());

/* ---------------- DB CONNECTION ---------------- */
const db = mysql.createPool({
    host: process.env.DB_HOST,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
    port: Number(process.env.DB_PORT),
    ssl: {
        ca: fs.readFileSync(path.join(__dirname, "ca.pem"))
    }
});

/* ---------------- MULTER CONFIG (memory storage for ImageKit) ---------------- */
const upload = multer({
    storage: multer.memoryStorage(), // keep file in memory
    limits: { fileSize: 5 * 1024 * 1024 }, // 5 MB max
    fileFilter: (req, file, cb) => {
        if (!file.mimetype.startsWith("image/")) {
            cb(new Error("Only image files are allowed"));
        } else {
            cb(null, true);
        }
    }
});

/* ---------------- IMAGEKIT CONFIG ---------------- */
const imagekit = new ImageKit({
    publicKey: process.env.IMAGEKIT_PUBLIC_KEY,
    privateKey: process.env.IMAGEKIT_PRIVATE_KEY,
    urlEndpoint: process.env.IMAGEKIT_URL_ENDPOINT
});

/* ---------------- IMAGE UPLOAD ROUTE ---------------- */
app.post("/api/admin/upload", upload.single("image"), async (req, res) => {
    try {
        if (!req.file) {
            return res.status(400).json({ success: false, message: "No file uploaded" });
        }

        const result = await imagekit.upload({
            file: req.file.buffer,
            fileName: Date.now() + "-" + req.file.originalname,
            folder: "uploads"
        });

        res.json({
            success: true,
            path: result.url // save this URL to your database
        });
    } catch (err) {
        console.error("ImageKit upload error:", err);
        res.status(500).json({ success: false, message: "Upload failed" });
    }
});

/* ---------------- LOGIN ---------------- */
app.post("/api/admin/login", (req, res) => {
    const { username, password } = req.body;
    if (!username || !password) return res.status(400).json({ success: false });

    const sql = `SELECT id, username, password FROM admins WHERE username = ? LIMIT 1`;
    db.query(sql, [username], (err, results) => {
        if (err) return res.status(500).json({ success: false });
        if (!results.length || results[0].password !== password) return res.status(401).json({ success: false });

        res.json({ success: true });
    });
});

/* ---------------- LIST TABLES ---------------- */
app.get("/api/admin/tables", (req, res) => {
    db.query("SHOW TABLES", (err, results) => {
        if (err) return res.status(500).json([]);
        const tables = results.map(r => Object.values(r)[0]);
        res.json(tables);
    });
});

/* ---------------- GET TABLE ROWS ---------------- */
app.get("/api/admin/table/:name", (req, res) => {
    const table = req.params.name;
    if (!/^[a-zA-Z0-9_]+$/.test(table)) return res.status(400).json({ error: "Invalid table name" });

    const sql = `SELECT * FROM \`${table}\` LIMIT 200`;
    db.query(sql, (err, rows) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json(rows);
    });
});

/* ---------------- CREATE ROW ---------------- */
app.post("/api/admin/table/:name", (req, res) => {
    const table = req.params.name;
    const data = req.body;
    if (!/^[a-zA-Z0-9_]+$/.test(table) || !Object.keys(data).length) return res.status(400).json({ message: "Invalid table or no data" });

    const cols = Object.keys(data).map(f => `\`${f}\``).join(",");
    const placeholders = Object.keys(data).map(() => "?").join(",");
    const values = Object.values(data);

    const sql = `INSERT INTO \`${table}\` (${cols}) VALUES (${placeholders})`;
    db.query(sql, values, (err, result) => {
        if (err) return res.status(500).json({ message: "Insert failed" });
        res.json({ success: true, insertId: result.insertId });
    });
});

/* ---------------- UPDATE ROW ---------------- */
app.put("/api/admin/table/:name/:idField/:id", (req, res) => {
    const { name, idField, id } = req.params;
    const data = req.body;
    if (!/^[a-zA-Z0-9_]+$/.test(name) || !/^[a-zA-Z0-9_]+$/.test(idField) || !Object.keys(data).length) {
        return res.status(400).json({ message: "Invalid parameters or no data" });
    }

    const set = Object.keys(data).map(f => `\`${f}\` = ?`).join(", ");
    const values = [...Object.values(data), id];

    const sql = `UPDATE \`${name}\` SET ${set} WHERE \`${idField}\` = ?`;
    db.query(sql, values, (err) => {
        if (err) return res.status(500).json({ message: "Update failed" });
        res.json({ success: true });
    });
});

/* ---------------- DELETE ROW ---------------- */
app.delete("/api/admin/table/:name/:idField/:id", (req, res) => {
    const { name, idField, id } = req.params;
    if (!/^[a-zA-Z0-9_]+$/.test(name) || !/^[a-zA-Z0-9_]+$/.test(idField)) {
        return res.status(400).json({ message: "Invalid parameters" });
    }

    const sql = `DELETE FROM \`${name}\` WHERE \`${idField}\` = ?`;
    db.query(sql, [id], (err) => {
        if (err) return res.status(500).json({ message: "Delete failed" });
        res.json({ success: true });
    });
});

/* ---------------- CUSTOM API ---------------- */
app.get("/api/admin/projects", (req, res) => {
    db.query("SELECT * FROM projects", (err, results) => {
        if (err) return res.status(500).json({ error: "Database query failed" });
        res.json(results);
    });
});

/* ---------------- START SERVER ---------------- */
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log("Server running on http://localhost:" + PORT);
});