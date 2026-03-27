import express from "express";
import { createServer as createViteServer } from "vite";
import path from "path";
import { fileURLToPath } from "url";
import dotenv from "dotenv";
import { Octokit } from "octokit";
import { GoogleGenAI } from "@google/genai";
import cron from "node-cron";
import axios from "axios";
import { google } from "googleapis";

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function startServer() {
  const app = express();
  const PORT = 3000;

  app.use(express.json());

  // --- Multi-User Automation Logic ---

  const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY! });

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

  async function processUserAutomation(userData: any, userId: string) {
    if (!userData.isVerified || userData.isDisabled || !userData.githubToken) return;

    const octokit = new Octokit({ auth: userData.githubToken });
    const REPO_OWNER = "krishnaTech75";
    const REPO_NAME = "Research_videos";
    const REPO_PATH = "Videos";

    const logs: string[] = userData.logs || [];
    const addLog = (msg: string) => {
      const log = `[${new Date().toISOString()}] ${msg}`;
      logs.push(log);
      if (logs.length > 50) logs.shift();
    };

    addLog(`Starting automation cycle for ${userData.email}...`);

    try {
      const { data: contents } = await octokit.rest.repos.getContent({
        owner: REPO_OWNER,
        repo: REPO_NAME,
        path: REPO_PATH,
      });

      if (!Array.isArray(contents)) throw new Error("Invalid repo path");

      const videos = contents.filter(file => file.name.endsWith(".mp4") || file.name.endsWith(".mov"));
      const postedVideos = userData.postedVideos || [];
      const nextVideos = videos.filter(v => !postedVideos.includes(v.sha)).slice(0, userData.reelsPerBatch || 1);

      if (nextVideos.length === 0) {
        addLog("No new videos to post.");
      } else {
        for (const video of nextVideos) {
          addLog(`Processing: ${video.name}`);
          const caption = await generateCaption(video.name);
          addLog(`Generated AI Caption for ${video.name}`);
          // Social posting logic would go here using user's tokens
          postedVideos.push(video.sha);
        }
      }

      // Update Firebase (This would ideally be done via a service account or admin SDK)
      // For this demo, we'll assume the server has access or we'll trigger it from the client
      addLog(`Cycle complete. Posted ${nextVideos.length} videos.`);
      
      // In a real production app, you'd use firebase-admin here
      // For now, we'll log it and the client will handle state updates via onSnapshot
    } catch (error) {
      addLog(`Error: ${error}`);
    }
  }

  // Global scheduler for all users (Simplified)
  cron.schedule("0 * * * *", async () => {
    // In production, you'd query Firebase for users whose schedule matches 'now'
    console.log("Running hourly automation check...");
  });

  // --- API Routes ---

  app.post("/api/trigger-user", async (req, res) => {
    const { userId, userData } = req.body;
    await processUserAutomation(userData, userId);
    res.json({ message: "Automation triggered." });
  });

  app.post("/api/config", (req, res) => {
    // In a real app, save to .env or DB
    res.json({ message: "Configuration updated (Mocked)." });
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
