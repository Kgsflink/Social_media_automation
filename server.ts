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
    youtubeTokens TEXT, -- JSON string of tokens
    metaTokens TEXT,    -- JSON string of tokens
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

  CREATE TABLE IF NOT EXISTS uploaded_videos (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    userId INTEGER,
    videoName TEXT,
    videoSha TEXT,
    platform TEXT, -- 'youtube', 'instagram', 'facebook'
    platformVideoId TEXT,
    caption TEXT,
    status TEXT, -- 'success', 'failed'
    timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY(userId) REFERENCES users(id)
  );
`);

import { google } from "googleapis";
import axios from "axios";

const YOUTUBE_CLIENT_ID = process.env.YOUTUBE_CLIENT_ID;
const YOUTUBE_CLIENT_SECRET = process.env.YOUTUBE_CLIENT_SECRET;
const META_CLIENT_ID = process.env.META_CLIENT_ID;
const META_CLIENT_SECRET = process.env.META_CLIENT_SECRET;

const oauth2Client = new google.auth.OAuth2(
  YOUTUBE_CLIENT_ID,
  YOUTUBE_CLIENT_SECRET,
  "" // Redirect URI will be set dynamically
);

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

  async function uploadToYouTube(userId: number, videoUrl: string, title: string, description: string, tokens: any) {
    try {
      const auth = new google.auth.OAuth2(YOUTUBE_CLIENT_ID, YOUTUBE_CLIENT_SECRET);
      auth.setCredentials(tokens);
      const youtube = google.youtube({ version: "v3", auth });

      const videoResponse = await axios.get(videoUrl, { responseType: "stream" });

      const res = await youtube.videos.insert({
        part: ["snippet", "status"],
        requestBody: {
          snippet: {
            title: title.substring(0, 100),
            description,
            categoryId: "22", // People & Blogs
          },
          status: {
            privacyStatus: "public",
            selfDeclaredMadeForKids: false,
          },
        },
        media: {
          body: videoResponse.data,
        },
      });

      return res.data.id;
    } catch (error: any) {
      console.error("YouTube Upload Error:", error.response?.data || error.message);
      throw error;
    }
  }

  async function uploadToInstagram(userId: number, videoUrl: string, caption: string, tokens: any) {
    try {
      const { access_token, instagram_business_account_id } = tokens;
      
      // 1. Create Media Container
      const containerRes = await axios.post(`https://graph.facebook.com/v19.0/${instagram_business_account_id}/media`, {
        media_type: "REELS",
        video_url: videoUrl,
        caption,
        access_token
      });

      const containerId = containerRes.data.id;

      // 2. Wait for processing (polling)
      let status = "IN_PROGRESS";
      while (status === "IN_PROGRESS") {
        await new Promise(r => setTimeout(r, 5000));
        const statusRes = await axios.get(`https://graph.facebook.com/v19.0/${containerId}`, {
          params: { fields: "status_code", access_token }
        });
        status = statusRes.data.status_code;
      }

      if (status !== "FINISHED") throw new Error(`Instagram processing failed with status: ${status}`);

      // 3. Publish
      const publishRes = await axios.post(`https://graph.facebook.com/v19.0/${instagram_business_account_id}/media_publish`, {
        creation_id: containerId,
        access_token
      });

      return publishRes.data.id;
    } catch (error: any) {
      console.error("Instagram Upload Error:", error.response?.data || error.message);
      throw error;
    }
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
        const youtubeTokens = user.youtubeTokens ? JSON.parse(user.youtubeTokens) : null;
        const metaTokens = user.metaTokens ? JSON.parse(user.metaTokens) : null;

        for (const video of nextVideos) {
          await addLog(user.id, `Processing: ${video.name}`);
          const caption = await generateCaption(video.name);
          
          // Get download URL
          const { data: videoData } = await octokit.rest.repos.getContent({
            owner: REPO_OWNER,
            repo: REPO_NAME,
            path: video.path,
          }) as any;
          const videoUrl = videoData.download_url;

          // Upload to YouTube
          if (youtubeTokens) {
            try {
              const ytId = await uploadToYouTube(user.id, videoUrl, video.name, caption, youtubeTokens);
              db.prepare("INSERT INTO uploaded_videos (userId, videoName, videoSha, platform, platformVideoId, caption, status) VALUES (?, ?, ?, ?, ?, ?, ?)")
                .run(user.id, video.name, video.sha, "youtube", ytId, caption, "success");
              await addLog(user.id, `Successfully posted to YouTube: ${ytId}`);
            } catch (err: any) {
              await addLog(user.id, `YouTube Upload Failed: ${err.message}`);
            }
          }

          // Upload to Instagram
          if (metaTokens && metaTokens.instagram_business_account_id) {
            try {
              const igId = await uploadToInstagram(user.id, videoUrl, caption, metaTokens);
              db.prepare("INSERT INTO uploaded_videos (userId, videoName, videoSha, platform, platformVideoId, caption, status) VALUES (?, ?, ?, ?, ?, ?, ?)")
                .run(user.id, video.name, video.sha, "instagram", igId, caption, "success");
              await addLog(user.id, `Successfully posted to Instagram: ${igId}`);
            } catch (err: any) {
              await addLog(user.id, `Instagram Upload Failed: ${err.message}`);
            }
          }

          postedVideos.push(video.sha);
          await addLog(user.id, `Finished processing ${video.name}`);
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

  // Social Auth URLs
  app.get("/api/auth/youtube/url", authenticate, (req: any, res) => {
    const redirectUri = `${req.protocol}://${req.get("host")}/api/auth/youtube/callback`;
    const authUrl = oauth2Client.generateAuthUrl({
      access_type: "offline",
      scope: ["https://www.googleapis.com/auth/youtube.upload"],
      redirect_uri: redirectUri,
      state: req.user.id.toString(),
      prompt: "consent"
    });
    res.json({ url: authUrl });
  });

  app.get("/api/auth/meta/url", authenticate, (req: any, res) => {
    const redirectUri = `${req.protocol}://${req.get("host")}/api/auth/meta/callback`;
    const params = new URLSearchParams({
      client_id: META_CLIENT_ID!,
      redirect_uri: redirectUri,
      scope: "instagram_basic,instagram_content_publish,pages_show_list,pages_read_engagement",
      response_type: "code",
      state: req.user.id.toString()
    });
    res.json({ url: `https://www.facebook.com/v19.0/dialog/oauth?${params.toString()}` });
  });

  // Callbacks
  app.get("/api/auth/youtube/callback", async (req, res) => {
    const { code, state } = req.query;
    const userId = parseInt(state as string);
    const redirectUri = `${req.protocol}://${req.get("host")}/api/auth/youtube/callback`;
    
    try {
      const { tokens } = await oauth2Client.getToken({
        code: code as string,
        redirect_uri: redirectUri
      });
      db.prepare("UPDATE users SET youtubeTokens = ? WHERE id = ?").run(JSON.stringify(tokens), userId);
      res.send(`<html><body><script>window.opener.postMessage({ type: 'OAUTH_SUCCESS', platform: 'youtube' }, '*'); window.close();</script></body></html>`);
    } catch (err) {
      res.status(500).send("YouTube Auth Failed");
    }
  });

  app.get("/api/auth/meta/callback", async (req, res) => {
    const { code, state } = req.query;
    const userId = parseInt(state as string);
    const redirectUri = `${req.protocol}://${req.get("host")}/api/auth/meta/callback`;

    try {
      // 1. Exchange code for access token
      const tokenRes = await axios.get("https://graph.facebook.com/v19.0/oauth/access_token", {
        params: {
          client_id: META_CLIENT_ID,
          client_secret: META_CLIENT_SECRET,
          redirect_uri: redirectUri,
          code
        }
      });
      const accessToken = tokenRes.data.access_token;

      // 2. Get Instagram Business Account ID
      const pagesRes = await axios.get("https://graph.facebook.com/v19.0/me/accounts", {
        params: { access_token: accessToken }
      });
      const page = pagesRes.data.data[0]; // Take first page
      if (!page) throw new Error("No Facebook page found");

      const igRes = await axios.get(`https://graph.facebook.com/v19.0/${page.id}`, {
        params: { fields: "instagram_business_account", access_token: accessToken }
      });
      const igId = igRes.data.instagram_business_account?.id;
      if (!igId) throw new Error("No Instagram Business account linked to this page");

      const metaTokens = { access_token: accessToken, instagram_business_account_id: igId };
      db.prepare("UPDATE users SET metaTokens = ? WHERE id = ?").run(JSON.stringify(metaTokens), userId);
      res.send(`<html><body><script>window.opener.postMessage({ type: 'OAUTH_SUCCESS', platform: 'meta' }, '*'); window.close();</script></body></html>`);
    } catch (err: any) {
      console.error(err.response?.data || err.message);
      res.status(500).send("Meta Auth Failed");
    }
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

  app.get("/api/user/uploads", authenticate, (req: any, res) => {
    const uploads = db.prepare("SELECT * FROM uploaded_videos WHERE userId = ? ORDER BY timestamp DESC").all(req.user.id);
    res.json(uploads);
  });

  app.delete("/api/user/uploads/:id", authenticate, (req: any, res) => {
    db.prepare("DELETE FROM uploaded_videos WHERE id = ? AND userId = ?").run(req.params.id, req.user.id);
    res.json({ message: "Deleted" });
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
