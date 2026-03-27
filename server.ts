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

  // --- AI & Automation Logic ---

  const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY! });

  // GitHub Configuration
  const GITHUB_TOKEN = process.env.GITHUB_TOKEN;
  const REPO_OWNER = "krishnaTech75";
  const REPO_NAME = "Research_videos";
  const REPO_PATH = "Videos";

  const octokit = new Octokit({ auth: GITHUB_TOKEN });

  // In-memory state (Replace with DB for production)
  let status = {
    lastRun: null,
    nextRun: null,
    postedVideos: [],
    logs: [],
    isAutomationRunning: false
  };

  const addLog = (message: string) => {
    const log = `[${new Date().toISOString()}] ${message}`;
    console.log(log);
    status.logs.push(log);
    if (status.logs.length > 100) status.logs.shift();
  };

  async function generateCaption(videoName: string) {
    try {
      const prompt = `Generate a viral, engaging social media caption and 10 trending hashtags for a video titled "${videoName}". The caption should be suitable for YouTube Shorts, Instagram Reels, and Facebook. Return only the caption and tags.`;
      const result = await ai.models.generateContent({
        model: "gemini-3-flash-preview",
        contents: prompt
      });
      return result.text || `Check out this amazing video: ${videoName} #trending #viral`;
    } catch (error) {
      addLog(`Error generating caption: ${error}`);
      return `Check out this amazing video: ${videoName} #trending #viral`;
    }
  }

  async function processAutomation() {
    if (status.isAutomationRunning) return;
    status.isAutomationRunning = true;
    addLog("Starting automation cycle...");

    try {
      // 1. Fetch videos from GitHub
      const { data: contents } = await octokit.rest.repos.getContent({
        owner: REPO_OWNER,
        repo: REPO_NAME,
        path: REPO_PATH,
      });

      if (!Array.isArray(contents)) {
        throw new Error("Invalid repository path or empty directory.");
      }

      const videos = contents.filter(file => 
        file.name.endsWith(".mp4") || file.name.endsWith(".mov")
      );

      addLog(`Found ${videos.length} videos in GitHub repository.`);

      // 2. Find a video that hasn't been posted yet
      const nextVideo = videos.find(v => !status.postedVideos.includes(v.sha));

      if (!nextVideo) {
        addLog("No new videos to post.");
        status.isAutomationRunning = false;
        return;
      }

      addLog(`Processing video: ${nextVideo.name}`);

      // 3. Generate AI Caption
      const caption = await generateCaption(nextVideo.name);
      addLog(`Generated AI Caption: ${caption.substring(0, 50)}...`);

      // 4. Social Media Posting (Stubs - Requires OAuth/API Setup)
      addLog("Attempting to post to social media platforms...");
      
      // YouTube Stub
      addLog("[YouTube] Posting video...");
      // Implementation would use googleapis and OAuth2 tokens
      
      // Instagram Stub
      addLog("[Instagram] Posting reel...");
      // Implementation would use Meta Graph API

      // 5. Update Status
      status.postedVideos.push(nextVideo.sha);
      status.lastRun = new Date().toISOString();
      addLog(`Successfully processed and "posted" ${nextVideo.name}`);

    } catch (error) {
      addLog(`Automation failed: ${error}`);
    } finally {
      status.isAutomationRunning = false;
    }
  }

  // Schedule: Every 6 hours
  cron.schedule("0 */6 * * *", () => {
    processAutomation();
  });

  // --- API Routes ---

  app.get("/api/status", (req, res) => {
    res.json(status);
  });

  app.post("/api/trigger", async (req, res) => {
    processAutomation();
    res.json({ message: "Automation triggered manually." });
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
