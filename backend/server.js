/**
 * RentEase off-chain API
 *  - Stores lease PDFs and returns their SHA-256 hash (the hash is saved on-chain).
 *  - Stores maintenance requests (kept off-chain: cheap, editable, not sensitive for consensus).
 * Data is persisted in a simple JSON file so there is nothing extra to install.
 *
 * NOTE: requests are not wallet-authenticated in this demo. For production, have the client
 * sign a message with MetaMask and verify the signature here with ethers.verifyMessage.
 */
const express = require("express");
const cors = require("cors");
const multer = require("multer");
const crypto = require("crypto");
const fs = require("fs");
const path = require("path");

const PORT = process.env.PORT || 5000;
const ORIGIN = process.env.CLIENT_ORIGIN || "http://localhost:5173";
const DATA_DIR = path.join(__dirname, "data");
const UPLOAD_DIR = path.join(__dirname, "uploads");
const DB_FILE = path.join(DATA_DIR, "db.json");
fs.mkdirSync(DATA_DIR, { recursive: true });
fs.mkdirSync(UPLOAD_DIR, { recursive: true });

const readDb = () => {
  try {
    return JSON.parse(fs.readFileSync(DB_FILE, "utf8"));
  } catch {
    return { documents: {}, maintenance: [] };
  }
};
const writeDb = (db) => fs.writeFileSync(DB_FILE, JSON.stringify(db, null, 2));
const isAddress = (a) => typeof a === "string" && /^0x[a-fA-F0-9]{40}$/.test(a);

const STATUSES = ["Open", "In Progress", "Resolved"];
const PRIORITIES = ["Low", "Medium", "High"];

const app = express();
app.use(cors({ origin: ORIGIN }));
app.use(express.json({ limit: "100kb" }));

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: (req, file, cb) =>
    file.mimetype === "application/pdf" ? cb(null, true) : cb(new Error("Only PDF files are allowed")),
});

app.get("/api/health", (req, res) => res.json({ ok: true, time: new Date().toISOString() }));

// ── Documents ─────────────────────────────────────────────
app.post("/api/documents", upload.single("file"), (req, res) => {
  if (!req.file) return res.status(400).json({ error: "No file uploaded" });
  const hash = crypto.createHash("sha256").update(req.file.buffer).digest("hex");
  fs.writeFileSync(path.join(UPLOAD_DIR, `${hash}.pdf`), req.file.buffer);
  const db = readDb();
  db.documents[hash] = { name: req.file.originalname, size: req.file.size, uploadedAt: Date.now() };
  writeDb(db);
  res.status(201).json({ hash, name: req.file.originalname, size: req.file.size });
});

app.get("/api/documents/:hash", (req, res) => {
  const { hash } = req.params;
  if (!/^[a-f0-9]{64}$/.test(hash)) return res.status(400).json({ error: "Invalid hash" });
  const file = path.join(UPLOAD_DIR, `${hash}.pdf`);
  if (!fs.existsSync(file)) return res.status(404).json({ error: "Document not found" });
  const meta = readDb().documents[hash];
  res.download(file, meta?.name || `lease-${hash.slice(0, 8)}.pdf`);
});

// ── Maintenance requests ──────────────────────────────────
app.get("/api/maintenance", (req, res) => {
  const { tenant, owner, leaseId } = req.query;
  let items = readDb().maintenance;
  if (tenant) items = items.filter((m) => m.tenant === String(tenant).toLowerCase());
  if (owner) items = items.filter((m) => m.owner === String(owner).toLowerCase());
  if (leaseId) items = items.filter((m) => String(m.leaseId) === String(leaseId));
  res.json(items.sort((a, b) => b.createdAt - a.createdAt));
});

app.post("/api/maintenance", (req, res) => {
  const { leaseId, tenant, owner, title, description, priority } = req.body || {};
  if (!leaseId || !isAddress(tenant) || !isAddress(owner)) {
    return res.status(400).json({ error: "leaseId, tenant and owner are required" });
  }
  if (!title || String(title).length > 120) {
    return res.status(400).json({ error: "Title is required (max 120 characters)" });
  }
  const item = {
    id: crypto.randomUUID(),
    leaseId: Number(leaseId),
    tenant: tenant.toLowerCase(),
    owner: owner.toLowerCase(),
    title: String(title).trim(),
    description: String(description || "").slice(0, 1000),
    priority: PRIORITIES.includes(priority) ? priority : "Medium",
    status: "Open",
    createdAt: Date.now(),
    updatedAt: Date.now(),
  };
  const db = readDb();
  db.maintenance.push(item);
  writeDb(db);
  res.status(201).json(item);
});

app.patch("/api/maintenance/:id", (req, res) => {
  const { status } = req.body || {};
  if (!STATUSES.includes(status)) return res.status(400).json({ error: "Invalid status" });
  const db = readDb();
  const item = db.maintenance.find((m) => m.id === req.params.id);
  if (!item) return res.status(404).json({ error: "Request not found" });
  item.status = status;
  item.updatedAt = Date.now();
  writeDb(db);
  res.json(item);
});

// eslint-disable-next-line no-unused-vars
app.use((err, req, res, next) => res.status(400).json({ error: err.message }));

app.listen(PORT, () => console.log(`RentEase API running on http://localhost:${PORT}`));
