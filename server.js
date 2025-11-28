require("dotenv").config();
const express = require("express");
const cors = require("cors");
const multer = require("multer");
const fs = require("fs");
const fsp = require("fs/promises");
const path = require("path");
const mime = require("mime-types");
const mongoose = require("mongoose");
const jwt = require("jsonwebtoken");
const ejs = require("ejs");

const app = express();
app.use(express.json({ limit: "20mb" }));
app.use('/storage', express.static(path.join(__dirname, 'storage')));
// app.use(
//     cors({
//         origin: ['*'],
//         methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
//         credentials: true,
//     })
// );
app.use(cors())

// -------------------- ENV CONFIG --------------------
const PORT = process.env.PORT || 4013;
const BASE_URL = process.env.BASE_URL || `http://localhost:4013`;
// const JWT_SECRET = process.env.JWT_SECRET || "supersecret";
// const API_KEY = process.env.API_KEY;
// const expireTime = { expiresIn: "5m" };
// const IS_PROD =
//     process.env.VERCEL === "1" || process.env.NODE_ENV === "production";

// // -------------------- STORAGE PATHS --------------------
// const STORAGE_DIR = IS_PROD ? "/tmp/storage" : path.join(__dirname, "storage");
// const ORIGINALS_DIR = path.join(STORAGE_DIR, "originals");
// const PDF_DIR = path.join(STORAGE_DIR, "pdf");
// const SIGNED_DIR = path.join(STORAGE_DIR, "signed");


// (async () => {
//     await fsp.mkdir(STORAGE_DIR, { recursive: true });
//     await fsp.mkdir(ORIGINALS_DIR, { recursive: true });
//     await fsp.mkdir(PDF_DIR, { recursive: true });
//     await fsp.mkdir(SIGNED_DIR, { recursive: true });
// })();

const IS_PROD =
    process.env.VERCEL === "1" || process.env.NODE_ENV === "production";

const STORAGE_DIR = /*IS_PROD ? "/tmp/storage" :*/ path.join(__dirname, "storage");
const ORIGINALS_DIR = path.join(STORAGE_DIR, "originals");
const PDF_DIR = path.join(STORAGE_DIR, "pdf");
const SIGNED_DIR = path.join(STORAGE_DIR, "signed");

// if (!IS_PROD) {
    app.use('/storage', express.static(path.join(__dirname, "storage")));
// }

async function prepareStorage() {
    try {
        await fsp.mkdir(STORAGE_DIR, { recursive: true });
        await fsp.mkdir(ORIGINALS_DIR, { recursive: true });
        await fsp.mkdir(PDF_DIR, { recursive: true });
        await fsp.mkdir(SIGNED_DIR, { recursive: true });
        console.log("✔ Storage folders created:", STORAGE_DIR);
    } catch (err) {
        console.error("❌ Failed to create storage folders:", err);
    }
}
prepareStorage();

app.get("/", (req, res) => {
    res.json({ message: `Welcome to e_sign api.` });
});

const { verifyApiKey } = require("./middleware/helper");
if (process.env.ACCESS_API_KEY == true || process.env.ACCESS_API_KEY === "true") {
    app.use("/api", verifyApiKey);
}

// const loggerMiddleware = require('./middleware/loggerMiddleware');
// app.use(loggerMiddleware);

app.use('/api', require('./route/eSignRoutes'));
require('./config/db');

app.use((err, req, res, next) => {
    if (!err) return next();
    console.error(
        "Unhandled error middleware caught:",
        err && err.stack ? err.stack : err
    );
    const message =
        err.message || (err.code ? String(err.code) : "Server error");
    res.status(500).json({ error: message });
});


// -------------------- START --------------------
app.listen(PORT, () =>
    console.log(`🚀 Server running at ${BASE_URL} (API key protected)`)
);