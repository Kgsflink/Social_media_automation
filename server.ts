import express from "express";
import { createServer as createViteServer } from "vite";
import path from "path";
import { fileURLToPath } from "url";
import dotenv from "dotenv";
import { Octokit } from "octokit";
import { GoogleGenAI } from "@google/genai";
import cron from "node-cron";
import Database from "better-sqlite3";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const JWT_SECRET = process.env.JWT_SECRET || "super-secret-key";
const db = new Database("database.sqlite");

// Initialize Database
db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    email TEXT UNIQUE,
    password TEXT,
    displayName TEXT,
    role TEXT DEFAULT 'user',
    isVerified INTEGER DEFAULT 0,
    isDisabled INTEGER DEFAULT 0,
    githubToken TEXT,
    reelsPerBatch INTEGER DEFAULT 2,
    uploadSchedule TEXT DEFAULT '0 */6 * * *',
    postedVideos TEXT DEFAULT '[]',
    createdAt DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS logs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    userId INTEGER,
    message TEXT,
    timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY(userId) REFERENCES users(id)
  );
`);

async function startServer() {
  const app = express();
  const PORT = 3000;

  app.use(express.json());

  const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY! });

  // --- Middleware ---
  const authenticate = (req: any, res: any, next: any) => {
    const token = req.headers.authorization?.split(" ")[1];
    if (!token) return res.status(401).json({ error: "Unauthorized" });
    try {
      const decoded = jwt.verify(token, JWT_SECRET) as any;
      req.user = decoded;
      next();
    } catch (err) {
      res.status(401).json({ error: "Invalid token" });
    }
  };

  const isAdmin = (req: any, res: any, next: any) => {
    if (req.user.role !== "admin") return res.status(403).json({ error: "Forbidden" });
    next();
  };

  // --- Helper Functions ---
  async function generateCaption(videoName: string) {
    try {
      const prompt = `Generate a viral, engaging social media caption and 10 trending hashtags for a video titled "${videoName}". The caption should be suitable for YouTube Shorts, Instagram Reels, and Facebook. Return only the caption and tags.`;
      const result = await ai.models.generateContent({
        model: "gemini-3-flash-preview",
        contents: prompt
      });
      return result.text || `Check out this amazing video: ${videoName} #trending #viral`;
    } catch (error) {
      return `Check out this amazing video: ${videoName} #trending #viral`;
    }
  }

  async function addLog(userId: number, message: string) {
    const stmt = db.prepare("INSERT INTO logs (userId, message) VALUES (?, ?)");
    stmt.run(userId, `[${new Date().toISOString()}] ${message}`);
  }

  async function processUserAutomation(user: any) {
    if (!user.isVerified || user.isDisabled || !user.githubToken) return;

    const octokit = new Octokit({ auth: user.githubToken });
    const REPO_OWNER = "krishnaTech75";
    const REPO_NAME = "Research_videos";
    const REPO_PATH = "Videos";

    await addLog(user.id, `Starting automation cycle...`);

    try {
      const { data: contents } = await octokit.rest.repos.getContent({
        owner: REPO_OWNER,
        repo: REPO_NAME,
        path: REPO_PATH,
      });

      if (!Array.isArray(contents)) throw new Error("Invalid repo path");

      const videos = contents.filter(file => file.name.endsWith(".mp4") || file.name.endsWith(".mov"));
      const postedVideos = JSON.parse(user.postedVideos || "[]");
      const nextVideos = videos.filter(v => !postedVideos.includes(v.sha)).slice(0, user.reelsPerBatch || 1);

      if (nextVideos.length === 0) {
        await addLog(user.id, "No new videos to post.");
      } else {
        for (const video of nextVideos) {
          await addLog(user.id, `Processing: ${video.name}`);
          const caption = await generateCaption(video.name);
          await addLog(user.id, `Generated AI Caption for ${video.name}`);
          postedVideos.push(video.sha);
        }
        const updateStmt = db.prepare("UPDATE users SET postedVideos = ? WHERE id = ?");
        updateStmt.run(JSON.stringify(postedVideos), user.id);
      }

      await addLog(user.id, `Cycle complete. Processed ${nextVideos.length} videos.`);
    } catch (error: any) {
      await addLog(user.id, `Error: ${error.message}`);
    }
  }

  // --- API Routes ---

  // Auth
  app.post("/api/auth/register", async (req, res) => {
    const { email, password, displayName } = req.body;
    const hashedPassword = await bcrypt.hash(password, 10);
    try {
      // First user or specific admin email is admin
      const userCount = db.prepare("SELECT COUNT(*) as count FROM users").get() as any;
      const isAdminEmail = email === "krishna_tech_guru_30oct@cloudshell";
      const role = (userCount.count === 0 || isAdminEmail) ? "admin" : "user";
      const isVerified = (userCount.count === 0 || isAdminEmail) ? 1 : 0;

      const stmt = db.prepare("INSERT INTO users (email, password, displayName, role, isVerified) VALUES (?, ?, ?, ?, ?)");
      const result = stmt.run(email, hashedPassword, displayName, role, isVerified);
      res.json({ id: result.lastInsertRowid });
    } catch (err) {
      res.status(400).json({ error: "User already exists" });
    }
  });

  app.post("/api/auth/login", async (req, res) => {
    const { email, password } = req.body;
    const user = db.prepare("SELECT * FROM users WHERE email = ?").get(email) as any;
    if (!user || !(await bcrypt.compare(password, user.password))) {
      return res.status(401).json({ error: "Invalid credentials" });
    }
    if (user.isDisabled) return res.status(403).json({ error: "Account disabled" });

    const token = jwt.sign({ id: user.id, email: user.email, role: user.role }, JWT_SECRET, { expiresIn: "7d" });
    const { password: _, ...userWithoutPassword } = user;
    res.json({ token, user: userWithoutPassword });
  });

  app.get("/api/auth/me", authenticate, (req: any, res) => {
    const user = db.prepare("SELECT * FROM users WHERE id = ?").get(req.user.id) as any;
    const { password: _, ...userWithoutPassword } = user;
    res.json(userWithoutPassword);
  });

  // User Config
  app.post("/api/user/config", authenticate, (req: any, res) => {
    const { githubToken, reelsPerBatch, uploadSchedule } = req.body;
    const stmt = db.prepare("UPDATE users SET githubToken = ?, reelsPerBatch = ?, uploadSchedule = ? WHERE id = ?");
    stmt.run(githubToken, reelsPerBatch, uploadSchedule, req.user.id);
    res.json({ message: "Config updated" });
  });

  app.get("/api/user/logs", authenticate, (req: any, res) => {
    const logs = db.prepare("SELECT * FROM logs WHERE userId = ? ORDER BY timestamp DESC LIMIT 50").all(req.user.id);
    res.json(logs);
  });

  app.post("/api/user/trigger", authenticate, async (req: any, res) => {
    const user = db.prepare("SELECT * FROM users WHERE id = ?").get(req.user.id);
    await processUserAutomation(user);
    res.json({ message: "Triggered" });
  });

  // Admin
  app.get("/api/admin/users", authenticate, isAdmin, (req, res) => {
    const users = db.prepare("SELECT id, email, displayName, role, isVerified, isDisabled, createdAt FROM users").all();
    res.json(users);
  });

  app.post("/api/admin/users/:id/verify", authenticate, isAdmin, (req, res) => {
    const { isVerified } = req.body;
    db.prepare("UPDATE users SET isVerified = ? WHERE id = ?").run(isVerified ? 1 : 0, req.params.id);
    res.json({ message: "Status updated" });
  });

  app.post("/api/admin/users/:id/disable", authenticate, isAdmin, (req, res) => {
    const { isDisabled } = req.body;
    db.prepare("UPDATE users SET isDisabled = ? WHERE id = ?").run(isDisabled ? 1 : 0, req.params.id);
    res.json({ message: "Status updated" });
  });

  // --- Cron ---
  cron.schedule("0 * * * *", async () => {
    const users = db.prepare("SELECT * FROM users WHERE isVerified = 1 AND isDisabled = 0").all();
    for (const user of users) {
      // In a real app, check if uploadSchedule matches current time
      await processUserAutomation(user);
    }
  });

  // --- Vite Middleware ---
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
