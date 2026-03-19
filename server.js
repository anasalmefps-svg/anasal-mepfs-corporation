const express = require("express");
const cors = require("cors");
const mysql = require("mysql2");
const multer = require("multer");
const path = require("path");
const fs = require("fs");
require("dotenv").config();

const app = express();

app.use(cors());
app.use(express.json());
app.use(express.static("public"));
app.use("/uploads", express.static(path.join(__dirname, "public/uploads")));

/* ---------------- DB ---------------- */

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

/* ---------------- MULTER CONFIG ---------------- */

const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        cb(null, path.join(__dirname, "public/uploads"));
    },
    filename: (req, file, cb) => {
        const ext = path.extname(file.originalname);
        const name = Date.now() + "-" + Math.round(Math.random() * 1e9) + ext;
        cb(null, name);
    }
});

const upload = multer({
    storage,
    limits: { fileSize: 5 * 1024 * 1024 },
    fileFilter: (req, file, cb) => {
        if (!file.mimetype.startsWith("image/")) {
            cb(new Error("Only image files are allowed"));
        } else {
            cb(null, true);
        }
    }
});

/* ---------------- IMAGE UPLOAD ---------------- */

app.post("/api/admin/upload", upload.single("image"), (req, res) => {
    if (!req.file) {
        return res.status(400).json({ success: false, message: "No file uploaded" });
    }

    res.json({
        success: true,
        path: "/uploads/" + req.file.filename
    });
});

/* ---------------- LOGIN ---------------- */

app.post("/api/admin/login", (req, res) => {
    const { username, password } = req.body;

    if (!username || !password) {
        return res.status(400).json({ success: false });
    }

    const sql = `
        SELECT id, username, password
        FROM admins
        WHERE username = ?
        LIMIT 1
    `;

    db.query(sql, [username], (err, results) => {
        if (err) return res.status(500).json({ success: false });

        if (!results.length) {
            return res.status(401).json({ success: false });
        }

        if (results[0].password !== password) {
            return res.status(401).json({ success: false });
        }

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

    if (!/^[a-zA-Z0-9_]+$/.test(table)) {
        return res.status(400).json({ error: "Invalid table name" });
    }

    const sql = `SELECT * FROM \`${table}\` LIMIT 200`;

    db.query(sql, (err, rows) => {
        if (err) {
            console.error("GET TABLE ERROR:", table, err);
            return res.status(500).json({ error: err.message });
        }

        res.json(rows);
    });
});

/* ---------------- CREATE ---------------- */

app.post("/api/admin/table/:name", (req, res) => {
    const table = req.params.name;
    const data = req.body;

    if (!/^[a-zA-Z0-9_]+$/.test(table)) {
        return res.status(400).json({ message: "Invalid table" });
    }

    const fields = Object.keys(data);

    if (!fields.length) {
        return res.status(400).json({ message: "No data" });
    }

    const cols = fields.map(f => `\`${f}\``).join(",");
    const placeholders = fields.map(() => "?").join(",");
    const values = fields.map(f => data[f]);

    const sql = `
        INSERT INTO \`${table}\` (${cols})
        VALUES (${placeholders})
    `;

    db.query(sql, values, (err, result) => {
        if (err) {
            console.error(err);
            return res.status(500).json({ message: "Insert failed" });
        }

        res.json({ success: true, insertId: result.insertId });
    });
});

/* ---------------- UPDATE ---------------- */

app.put("/api/admin/table/:name/:idField/:id", (req, res) => {
    const { name, idField, id } = req.params;
    const data = req.body;

    if (
        !/^[a-zA-Z0-9_]+$/.test(name) ||
        !/^[a-zA-Z0-9_]+$/.test(idField)
    ) {
        return res.status(400).json({ message: "Invalid parameters" });
    }

    const fields = Object.keys(data);

    if (!fields.length) {
        return res.status(400).json({ message: "No data" });
    }

    const set = fields.map(f => `\`${f}\` = ?`).join(", ");
    const values = fields.map(f => data[f]);
    values.push(id);

    const sql = `
        UPDATE \`${name}\`
        SET ${set}
        WHERE \`${idField}\` = ?
    `;

    db.query(sql, values, (err) => {
        if (err) {
            console.error(err);
            return res.status(500).json({ message: "Update failed" });
        }

        res.json({ success: true });
    });
});

/* ---------------- DELETE ---------------- */

app.delete("/api/admin/table/:name/:idField/:id", (req, res) => {
    const { name, idField, id } = req.params;

    if (
        !/^[a-zA-Z0-9_]+$/.test(name) ||
        !/^[a-zA-Z0-9_]+$/.test(idField)
    ) {
        return res.status(400).json({ message: "Invalid parameters" });
    }

    const sql = `
        DELETE FROM \`${name}\`
        WHERE \`${idField}\` = ?
    `;

    db.query(sql, [id], (err) => {
        if (err) {
            console.error(err);
            return res.status(500).json({ message: "Delete failed" });
        }

        res.json({ success: true });
    });
});

/* ---------------- CUSTOM API ---------------- */

app.get("/api/admin/projects", (req, res) => {
    const query = "SELECT * FROM projects";

    db.query(query, (err, results) => {
        if (err) {
            console.error(err);
            return res.status(500).json({ error: "Database query failed" });
        }

        res.json(results);
    });
});

/* ---------------- START ---------------- */

const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
    console.log("Server running on http://localhost:" + PORT);
});