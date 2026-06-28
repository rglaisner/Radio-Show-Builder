import dotenv from "dotenv";
import express from "express";
import { createServer as createViteServer } from "vite";
import path from "path";

// Load .env then .env.local (local overrides) so GEMINI_API_KEY is available to the Express server.
dotenv.config({ path: path.join(process.cwd(), ".env") });
dotenv.config({ path: path.join(process.cwd(), ".env.local"), override: true });
import { API_BASE_URL } from "./server/lib/agentClient.ts";
import {
  cleanUpOldRunArtifacts,
  loadRunManifest,
  resolveRunFilePath,
} from "./server/lib/workspaceArchive.ts";
import { runGeneration, salvageFromCheckpoint } from "./server/lib/generationRunner.ts";
import { loadCheckpoint, cleanExpiredCheckpoints } from "./server/lib/checkpointStore.ts";
import { buildResumePrompt, buildPolicyResumePrompt } from "./server/lib/resumePrompt.ts";
import { parseShowConfigRequest } from "./src/showConfig.ts";
import { buildAgentPrompt, serializeShowConfig } from "./server/lib/showConfigPrompt.ts";
import {
  loadPolicyIncident,
  setIncidentRemediation,
  setIncidentStatus,
  cleanExpiredPolicyIncidents,
} from "./server/lib/policyIncidentStore.ts";
import { applyRemediationToSandbox } from "./server/lib/applyPolicyRemediation.ts";
import type { PolicyRemediationAction } from "./server/lib/policyTypes.ts";
import { ZodError } from "zod";
import { exec } from 'child_process';
import util from 'util';
import fs from "fs";
import { Storage } from "@google-cloud/storage";
import crypto from "crypto";
import admin from "firebase-admin";
import archiver from "archiver";

const execAsync = util.promisify(exec);

function getGeminiApiKey(): string | undefined {
  const key = process.env.GEMINI_API_KEY?.trim();
  return key || undefined;
}

async function probeGeminiApiAccess(apiKey: string): Promise<{ ok: true } | { ok: false; message: string }> {
  try {
    const response = await fetch(`${API_BASE_URL}/models?key=${encodeURIComponent(apiKey)}&pageSize=1`);
    if (response.ok) {
      return { ok: true };
    }
    const body = await response.text();
    const isQuotaError =
      response.status === 429 ||
      body.toLowerCase().includes("quota") ||
      body.toLowerCase().includes("resource_exhausted") ||
      body.toLowerCase().includes("spending cap");
    if (isQuotaError) {
      return {
        ok: false,
        message: `Gemini API Quota Limit Reached: ${body.slice(0, 500)}. Check billing at https://ai.studio/spend`,
      };
    }
    return { ok: false, message: `Gemini API probe failed (${response.status}): ${body.slice(0, 300)}` };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return { ok: false, message: `Gemini API probe failed: ${message}` };
  }
}

function getGcsBucketName(): string | null {
  const bucket = process.env.GCS_BUCKET_NAME;
  if (!bucket || typeof bucket !== "string" || bucket.trim() === "" || bucket.trim() === "undefined" || bucket.trim() === "null") {
    return null;
  }
  return bucket.trim();
}

function loadAgentFiles(dir: string, basePath: string): Array<{type: string, content: string, target: string}> {
  let files: Array<{type: string, content: string, target: string}> = [];
  if (!fs.existsSync(dir)) return files;

  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    const targetPath = path.posix.join(basePath, entry.name);
    if (entry.isDirectory()) {
      files = files.concat(loadAgentFiles(fullPath, targetPath));
    } else {
      files.push({
        type: "inline",
        content: fs.readFileSync(fullPath, "utf-8"),
        target: targetPath
      });
    }
  }
  return files;
}

const activeGenerations = new Map<string, AbortController>();

function cleanUpOldGenerations() {
  const outputDir = path.join(process.cwd(), 'output');
  if (!fs.existsSync(outputDir)) return;

  const maxAgeMs = 1 * 60 * 60 * 1000; // 1 hour threshold
  const now = Date.now();

  try {
    const items = fs.readdirSync(outputDir);
    for (const item of items) {
      if (item.startsWith('.')) continue; // ignore hidden items
      if (item === 'shares') continue; // DO NOT CLEAN UP SHARED EPISODES!
      if (item === 'runs') continue; // run artifact vault uses separate retention
      if (item === 'checkpoints') continue; // checkpoint store uses separate retention
      const itemPath = path.join(outputDir, item);
      const stats = fs.statSync(itemPath);
      
      if (stats.isDirectory()) {
        const age = now - stats.mtimeMs;
        if (age > maxAgeMs) {
          console.log(`[cleanup] Directory ${item} is older than 1 hour (${Math.round(age / 1000 / 60)} mins). Deleting to prevent storage bloat.`);
          try {
            fs.rmSync(itemPath, { recursive: true, force: true });
            const zipPath = `${itemPath}.zip`;
            if (fs.existsSync(zipPath)) {
              fs.unlinkSync(zipPath);
            }
          } catch (itemErr) {
            console.error(`[cleanup] Failed to delete ${itemPath}:`, itemErr);
          }
        }
      }
    }
  } catch (err) {
    console.error("[cleanup] Error cleaning up old generations:", err);
  }
}

async function startServer() {
  if (!getGeminiApiKey()) {
    console.warn(
      "[server] GEMINI_API_KEY is not set. Show generation will fail until you add it to .env.local"
    );
  }
  const app = express();
  const PORT = Number(process.env.PORT) || 3000;

  // Run initial cleanup on startup
  cleanUpOldGenerations();
  cleanUpOldRunArtifacts(7);
  cleanExpiredCheckpoints();
  cleanExpiredPolicyIncidents();

  app.use(express.json({ limit: '50mb' }));
  app.use('/output', express.static(path.join(process.cwd(), 'output')));

  // API routes FIRST
  app.post("/api/share", async (req, res) => {
    try {
      const { title, summary, transcript, prompt, duration, host, isBase64Encoded, date } = req.body;
      if (!title) {
        return res.status(400).json({ error: "Missing required metadata: title" });
      }

      const bucketName = getGcsBucketName();
      if (!bucketName) {
        console.log("[api/share] GCS_BUCKET_NAME is not configured. Sharing is disabled.");
        return res.status(400).json({ error: "Sharing is disabled because Google Cloud Storage is not configured." });
      }

      // Generate a deterministic 'shareId' based on content to check if it already exists
      const contentString = JSON.stringify({
        title,
        summary: summary || "",
        prompt: prompt || "",
        duration: duration || 0,
        host: host || "",
        transcript: transcript || []
      });
      const hash = crypto.createHash('sha256').update(contentString).digest('hex');
      const shareId = `show-${hash.substring(0, 16)}`;

      const storage = new Storage();
      const bucket = storage.bucket(bucketName);

      // Check if both the json metadata and the mp3 audio stream already exist
      const file = bucket.file(`shares/${shareId}.json`);
      const audioFile = bucket.file(`shares/${shareId}.mp3`);

      let alreadyExists = false;
      try {
        const [jsonExists] = await file.exists();
        if (jsonExists) {
          const [audioExists] = await audioFile.exists();
          if (audioExists) {
            alreadyExists = true;
          }
        }
      } catch (checkErr: any) {
        console.log(`[api/share] Pre-existence check bypassed on GCS: ${checkErr.message}`);
      }

      if (alreadyExists) {
        console.log(`[api/share] Show ${shareId} is already fully uploaded to GCS. Reusing existing files.`);
        return res.json({
          isSharingEnabled: true,
          useGcs: true,
          shareId,
          alreadyExists: true,
          uploadUrl: `/api/shares/${shareId}/upload/audio`,
          uploadCoverUrl: `/api/shares/${shareId}/upload/cover`,
          playbackUrl: `/api/shares/${shareId}/audio`,
          coverUrl: `/api/shares/${shareId}/cover`
        });
      }

      // Save the show metadata JSON directly to GCS
      const payload = {
        shareId,
        title,
        summary,
        transcript,
        prompt: prompt || "",
        duration: duration || 0,
        host: host || "",
        isBase64Encoded: isBase64Encoded || false,
        date: date || new Date().toLocaleDateString(),
        audioUrl: `/api/shares/${shareId}/audio`,
        coverImage: `/api/shares/${shareId}/cover`,
        createdAt: new Date().toISOString()
      };

      await file.save(JSON.stringify(payload, null, 2), {
        contentType: "application/json",
        resumable: false
      });

      console.log(`[api/share] Successfully created metadata on GCS for share ${shareId}`);
      res.json({
        isSharingEnabled: true,
        useGcs: true,
        shareId,
        alreadyExists: false,
        uploadUrl: `/api/shares/${shareId}/upload/audio`,
        uploadCoverUrl: `/api/shares/${shareId}/upload/cover`,
        playbackUrl: `/api/shares/${shareId}/audio`,
        coverUrl: `/api/shares/${shareId}/cover`
      });
    } catch (err: any) {
      console.error(`[api/share] Error initializing GCS dynamic stream or check:`, err);
      res.status(500).json({ error: `GCS publication failed: ${err.message || err}` });
    }
  });

  // Proxy upload route for audio file
  app.put("/api/shares/:id/upload/audio", async (req, res) => {
    try {
      const { id } = req.params;
      const bucketName = getGcsBucketName();
      if (!bucketName) {
        return res.status(400).json({ error: "GCS bucket not configured" });
      }

      const storage = new Storage();
      const bucket = storage.bucket(bucketName);
      const file = bucket.file(`shares/${id}.mp3`);

      console.log(`[Proxy GCS Upload] Starting direct audio stream for ${id}...`);
      const writeStream = file.createWriteStream({
        contentType: "audio/mpeg",
        resumable: false
      });

      req.pipe(writeStream);

      await new Promise<void>((resolve, reject) => {
        writeStream.on("finish", () => {
          console.log(`[Proxy GCS Upload] Audio save completed for share ${id}`);
          resolve();
        });
        writeStream.on("error", (err) => {
          console.error(`[Proxy GCS Upload] GCS audio stream error:`, err);
          reject(err);
        });
      });

      res.json({ success: true, useGcs: true });
    } catch (err: any) {
      console.error(`[Proxy GCS Upload] Handled error in audio:`, err);
      res.status(500).json({ error: err.message });
    }
  });

  // Proxy upload route for cover image
  app.put("/api/shares/:id/upload/cover", async (req, res) => {
    try {
      const { id } = req.params;
      const bucketName = getGcsBucketName();
      if (!bucketName) {
        return res.status(400).json({ error: "GCS bucket not configured" });
      }

      const storage = new Storage();
      const bucket = storage.bucket(bucketName);
      const file = bucket.file(`shares/${id}.png`);

      console.log(`[Proxy GCS Upload] Starting direct cover image stream for ${id}...`);
      const writeStream = file.createWriteStream({
        contentType: "image/png",
        resumable: false
      });

      req.pipe(writeStream);

      await new Promise<void>((resolve, reject) => {
        writeStream.on("finish", () => {
          console.log(`[Proxy GCS Upload] Cover save completed for share ${id}`);
          resolve();
        });
        writeStream.on("error", (err) => {
          console.error(`[Proxy GCS Upload] GCS cover stream error:`, err);
          reject(err);
        });
      });

      res.json({ success: true, useGcs: true });
    } catch (err: any) {
      console.error(`[Proxy GCS Upload] Handled error in cover:`, err);
      res.status(500).json({ error: err.message });
    }
  });

  // Stream proxy for playing audio
  app.get("/api/shares/:id/audio", async (req, res) => {
    try {
      const { id } = req.params;
      const bucketName = getGcsBucketName();
      if (!bucketName) {
        return res.status(400).send("GCS bucket not configured");
      }

      const storage = new Storage();
      const bucket = storage.bucket(bucketName);
      const file = bucket.file(`shares/${id}.mp3`);

      const [exists] = await file.exists();
      if (!exists) {
        return res.status(404).send("Audio file not found or still uploading");
      }

      try {
        const [metadata] = await file.getMetadata();
        res.setHeader("Content-Length", metadata.size);
      } catch (e) {}

      res.setHeader("Content-Type", "audio/mpeg");
      res.setHeader("Cache-Control", "public, max-age=31536000"); // Cache audio aggressively
      file.createReadStream().pipe(res);
    } catch (err: any) {
      console.error(`[Proxy GCS Read] Audio streaming error:`, err);
      res.status(500).send("Error reading audio file from GCS");
    }
  });

  // Stream proxy for loading cover images
  app.get("/api/shares/:id/cover", async (req, res) => {
    try {
      const { id } = req.params;
      const bucketName = getGcsBucketName();
      if (!bucketName) {
        return res.status(400).send("GCS bucket not configured");
      }

      const storage = new Storage();
      const bucket = storage.bucket(bucketName);
      const file = bucket.file(`shares/${id}.png`);

      const [exists] = await file.exists();
      if (!exists) {
        return res.status(404).send("Cover image not found");
      }

      try {
        const [metadata] = await file.getMetadata();
        res.setHeader("Content-Length", metadata.size);
      } catch (e) {}

      res.setHeader("Content-Type", "image/png");
      res.setHeader("Cache-Control", "public, max-age=31536000"); // Cache image aggressively
      file.createReadStream().pipe(res);
    } catch (err: any) {
      console.error(`[Proxy GCS Read] Cover image streaming error:`, err);
      res.status(500).send("Error reading cover image from GCS");
    }
  });

  app.post("/api/shares", (req, res) => {
    return res.status(403).json({ error: "Local sharing fallback has been completely disabled for security and GCS compliance." });
  });

  app.get("/api/shares/:id", async (req, res) => {
    try {
      const { id } = req.params;
      const bucketName = getGcsBucketName();
      if (!bucketName) {
        return res.status(400).json({ error: "Sharing is disabled. No GCS bucket configured." });
      }

      const storage = new Storage();
      const bucket = storage.bucket(bucketName);
      const file = bucket.file(`shares/${id}.json`);
      const [exists] = await file.exists();
      if (exists) {
        const [buffer] = await file.download();
        const showData = JSON.parse(buffer.toString("utf-8"));
        return res.json(showData);
      }

      return res.status(404).json({ error: "Shared show not found on GCS." });
    } catch (err: any) {
      console.log(`[api/shares] Error retrieving GCS share ${req.params.id}:`, err);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  app.post("/api/cancel-show", (req, res) => {
    const { generationId } = req.body;
    if (generationId && activeGenerations.has(generationId)) {
      console.log(`[cancel-show] Human requested abort for ${generationId}`);
      activeGenerations.get(generationId)?.abort();
      activeGenerations.delete(generationId);
      res.json({ success: true });
    } else {
      res.status(404).json({ error: "Not found or already completed" });
    }
  });

  app.get("/api/download-proxy", async (req, res) => {
    const targetUrl = req.query.url as string;
    if (!targetUrl) {
      res.status(400).send("Missing url parameter");
      return;
    }
    try {
      const response = await fetch(targetUrl);
      if (!response.ok) {
        res.status(response.status).send(`Failed to fetch: ${response.statusText}`);
        return;
      }
      res.setHeader("Content-Type", response.headers.get("Content-Type") || "application/octet-stream");
      res.setHeader("Access-Control-Allow-Origin", "*");
      
      const arrayBuffer = await response.arrayBuffer();
      const buffer = Buffer.from(arrayBuffer);
      res.send(buffer);
    } catch (err) {
      console.error("Download proxy failed:", err);
      res.status(500).send(`Internal server error: ${err instanceof Error ? err.message : String(err)}`);
    }
  });

  const QUOTA_CACHE_FILE = path.join(process.cwd(), 'output', 'quota_cache.json');
  const DEFAULT_QUOTA_LIMIT = 3;

  function getQuotaLimit(): number {
    const limitStr = process.env.DAILY_QUOTA_LIMIT;
    if (limitStr) {
      const parsed = parseInt(limitStr, 10);
      if (!isNaN(parsed)) {
        return parsed;
      }
    }
    return DEFAULT_QUOTA_LIMIT;
  }

  function getTodayStr(): string {
    return new Date().toISOString().split('T')[0];
  }

  let isFirebaseAdminInitialized = false;

  function ensureFirebaseAdmin() {
    if (!isFirebaseAdminInitialized) {
      try {
        admin.initializeApp();
        isFirebaseAdminInitialized = true;
        console.log("Firebase Admin initialized successfully (Application Default Credentials).");
      } catch (err: any) {
        console.warn("Could not retrieve Firebase Admin environment configuration from ADC:", err.message);
        try {
          const configPath = path.join(process.cwd(), 'firebase-applet-config.json');
          if (fs.existsSync(configPath)) {
            const config = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
            admin.initializeApp({
              projectId: config.projectId
            });
            isFirebaseAdminInitialized = true;
            console.log("Initialized Firebase Admin with project ID from config layout.");
          }
        } catch (innerErr: any) {
          console.error("Failed to initialize Firebase Admin with local config fallback:", innerErr.message);
        }
      }
    }
  }

  async function getUserHash(req: express.Request): Promise<string | null> {
    const authHeader = req.headers['authorization'];
    if (authHeader && typeof authHeader === 'string' && authHeader.startsWith('Bearer ')) {
      const token = authHeader.substring(7);
      try {
        ensureFirebaseAdmin();
        const decodedToken = await admin.auth().verifyIdToken(token);
        const uid = decodedToken.uid;
        if (uid && typeof uid === 'string' && uid.trim() !== '') {
          return crypto.createHash("sha256").update(uid.trim()).digest("hex");
        }
      } catch (err: any) {
        console.error("Error verifying Firebase ID token:", err.message);
      }
    }
    // Fallback during local development or unauthenticated preview testing
    return "dev-user-hash";
  }

  function getQuotaCount(userHash: string | null): number {
    if (!userHash) return 0;
    try {
      const outputDir = path.dirname(QUOTA_CACHE_FILE);
      if (!fs.existsSync(outputDir)) {
        fs.mkdirSync(outputDir, { recursive: true });
      }
      if (fs.existsSync(QUOTA_CACHE_FILE)) {
        const data = fs.readFileSync(QUOTA_CACHE_FILE, "utf-8");
        const cache = JSON.parse(data);
        const cacheKey = `${getTodayStr()}_${userHash}`;
        return cache[cacheKey] || 0;
      }
    } catch (err) {
      console.error("Error reading quota cache:", err);
    }
    return 0;
  }

  function incrementQuotaCount(userHash: string | null): void {
    if (!userHash) return;
    try {
      const outputDir = path.dirname(QUOTA_CACHE_FILE);
      if (!fs.existsSync(outputDir)) {
        fs.mkdirSync(outputDir, { recursive: true });
      }
      let cache: Record<string, number> = {};
      if (fs.existsSync(QUOTA_CACHE_FILE)) {
        try {
          const data = fs.readFileSync(QUOTA_CACHE_FILE, "utf-8");
          cache = JSON.parse(data);
        } catch (e) {
          console.error("Error parsing quota file cache on increment:", e);
        }
      }
      const cacheKey = `${getTodayStr()}_${userHash}`;
      cache[cacheKey] = (cache[cacheKey] || 0) + 1;
      fs.writeFileSync(QUOTA_CACHE_FILE, JSON.stringify(cache, null, 2), "utf-8");
    } catch (err) {
      console.error("Error incrementing quota cache:", err);
    }
  }

  app.get("/api/quota", async (req, res) => {
    if (process.env.NODE_ENV !== "production") {
      return res.json({ used: 0, limit: 999999 });
    }
    const userHash = await getUserHash(req);
    const limit = getQuotaLimit();
    if (!userHash) {
      return res.json({ used: 0, limit });
    }
    const count = getQuotaCount(userHash);
    return res.json({ used: count, limit });
  });

  app.post("/api/generate-show", async (req, res) => {
    // Run background cleanup list whenever a new show is request to optimize disk space
    cleanUpOldGenerations();
    cleanUpOldRunArtifacts(7);

    const { generationId } = req.body;

    let showConfig;
    try {
      showConfig = parseShowConfigRequest(req.body);
    } catch (error) {
      if (error instanceof ZodError) {
        return res.status(400).json({
          error: "Invalid show configuration",
          details: error.issues.map((issue) => ({
            path: issue.path.join("."),
            message: issue.message,
          })),
        });
      }
      return res.status(400).json({
        error: error instanceof Error ? error.message : "Invalid show configuration",
      });
    }

    if (process.env.NODE_ENV !== "production") {
      console.log(`[generate-show] Running in dev mode, skipping daily quota tracking.`);
    } else {
      const userHash = await getUserHash(req);
      if (userHash) {
        const count = getQuotaCount(userHash);
        const limit = getQuotaLimit();
        if (count >= limit) {
          return res.status(429).json({ error: `Daily limit of ${limit} shows reached. Please check back tomorrow!` });
        }
        // Deduct (increment) the quota immediately before starting the generation to prevent concurrent bypasses
        incrementQuotaCount(userHash);
      }
    }

    const prompt = buildAgentPrompt(showConfig);

    res.writeHead(200, {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    });

    const sendEvent = (event: any) => {
      res.write(`data: ${JSON.stringify(event)}\n\n`);
    };

    // Send a heartbeat every 15 seconds to keep the connection alive
    // (useful for proxies like VS Code port forwarding that drop idle connections)
    const heartbeatInterval = setInterval(() => {
      res.write(`:\n\n`); // SSE comment/ping
    }, 15000);

    let isFinished = false;
    const abortController = new AbortController();

    if (generationId) {
      activeGenerations.set(generationId, abortController);
    }

    req.on('aborted', () => {
      if (!isFinished) {
        console.log(`[generate-show] Client aborted request. Agent will continue running in background unless explicitly cancelled.`);
      }
      clearInterval(heartbeatInterval);
    });
    req.on('close', () => {
      clearInterval(heartbeatInterval);
    });

    try {
      console.log(
        `[generate-show] Request received for topic: "${showConfig.topic}", duration: "${showConfig.durationMinutes}", mood: "${showConfig.mood}", preset: "${showConfig.presetId ?? "none"}", generationId: "${generationId}"`
      );
      const geminiApiKey = getGeminiApiKey();
      console.log(`[generate-show] GEMINI_API_KEY presence verified: ${!!geminiApiKey}`);
      if (!geminiApiKey) {
        sendEvent({
          type: "error",
          message:
            "GEMINI_API_KEY is not configured. Add it to .env.local in the project root (see README). Get a key at https://aistudio.google.com/apikey",
        });
        res.end();
        return;
      }

      const apiProbe = await probeGeminiApiAccess(geminiApiKey);
      if (!apiProbe.ok) {
        sendEvent({ type: "error", message: apiProbe.ok === false ? apiProbe.message : "Gemini API probe failed" });
        res.end();
        return;
      }

      sendEvent({ type: "info", message: "Provisioning environment..." });

      console.log(`[generate-show] Loading agent files from filesystem path: ${path.join(process.cwd(), "agent")}`);
      const agentFiles = loadAgentFiles(path.join(process.cwd(), "agent"), "/.agents");
      agentFiles.push({
        type: "inline",
        content: serializeShowConfig(showConfig),
        target: "/workspace/data/show_config.json",
      });
      console.log(`[generate-show] Finished loading agent files recursively. Count: ${agentFiles.length} (includes show_config.json)`);

      const result = await runGeneration({
        generationId: generationId ?? `gen-${Date.now()}`,
        showConfig,
        prompt,
        apiKey: geminiApiKey,
        signal: abortController.signal,
        abortController,
        sendEvent,
        inlineSources: agentFiles.length > 0 ? agentFiles : undefined,
      });

      isFinished = true;
      const pausedPolicy = loadCheckpoint(generationId ?? "")?.status === "paused_policy";
      sendEvent({
        type: "status",
        status: result.showDelivered ? "completed" : pausedPolicy ? "paused_policy" : "failed",
      });
    } catch (err: any) {
      if (err.name === 'AbortError') {
        console.log(`[generate-show] Agent interaction aborted successfully.`);
      } else {
        console.error(`[generate-show] Error:`, err);
        sendEvent({ type: "error", message: err instanceof Error ? err.message : "Unknown error" });
      }
    } finally {
      isFinished = true;
      clearInterval(heartbeatInterval);
      if (generationId) {
        activeGenerations.delete(generationId);
      }
      res.end();
    }
  });

  app.get("/api/generation-checkpoint/:generationId", (req, res) => {
    cleanExpiredCheckpoints();
  cleanExpiredPolicyIncidents();
    const checkpoint = loadCheckpoint(req.params.generationId);
    if (!checkpoint) {
      return res.status(404).json({ error: "Checkpoint not found or expired" });
    }
    return res.json({
      generationId: checkpoint.generationId,
      lastCompletedStep: checkpoint.lastCompletedStep,
      canResume: checkpoint.canResume,
      completeness: checkpoint.completeness,
      environmentId: checkpoint.environmentId,
      status: checkpoint.status,
    });
  });

  app.post("/api/salvage-show", async (req, res) => {
    const { generationId } = req.body as { generationId?: string };
    if (!generationId) {
      return res.status(400).json({ error: "Missing generationId" });
    }

    const geminiApiKey = getGeminiApiKey();
    if (!geminiApiKey) {
      return res.status(500).json({
        error: "GEMINI_API_KEY is not configured.",
      });
    }

    res.writeHead(200, {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    });

    const sendEvent = (event: Record<string, unknown>) => {
      res.write(`data: ${JSON.stringify(event)}\n\n`);
    };

    try {
      const salvaged = await salvageFromCheckpoint(generationId, geminiApiKey, sendEvent);
      sendEvent({ type: "status", status: salvaged ? "completed" : "failed" });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown error";
      sendEvent({ type: "error", message });
      sendEvent({ type: "status", status: "failed" });
    } finally {
      res.end();
    }
  });

  app.post("/api/apply-policy-remediation", async (req, res) => {
    cleanExpiredCheckpoints();
    cleanExpiredPolicyIncidents();

    const body = req.body as {
      generationId?: string;
      incidentId?: string;
      actions?: PolicyRemediationAction[];
    };

    const { generationId, incidentId, actions } = body;
    if (!generationId || !incidentId || !actions?.length) {
      return res.status(400).json({ error: "Missing generationId, incidentId, or actions" });
    }

    const checkpoint = loadCheckpoint(generationId);
    if (!checkpoint) {
      return res.status(404).json({ error: "Checkpoint not found or expired" });
    }
    if (!checkpoint.environmentId) {
      return res.status(400).json({ error: "Checkpoint has no saved environment" });
    }

    const incident = loadPolicyIncident(generationId);
    if (!incident || incident.id !== incidentId) {
      return res.status(404).json({ error: "Policy incident not found" });
    }
    if (incident.status !== "awaiting_user" && incident.status !== "detected") {
      return res.status(400).json({ error: `Incident status is ${incident.status}, cannot apply` });
    }

    const geminiApiKey = getGeminiApiKey();
    if (!geminiApiKey) {
      return res.status(500).json({ error: "GEMINI_API_KEY is not configured." });
    }

    const applyResult = await applyRemediationToSandbox(
      checkpoint.environmentId,
      actions,
      geminiApiKey
    );

    if (!applyResult.ok) {
      return res.status(500).json({ error: applyResult.error ?? "Failed to apply remediation" });
    }

    let updatedConfig = checkpoint.showConfig;
    for (const action of actions) {
      if (action.type === "update_config_field" && action.target.configPath) {
        if (action.target.configPath === "topic") {
          updatedConfig = { ...updatedConfig, topic: action.proposed };
        } else if (action.target.configPath === "toneContext") {
          updatedConfig = { ...updatedConfig, toneContext: action.proposed };
        }
      }
    }

    const failedEventIds = actions
      .map((a) => a.target.eventId)
      .filter((id): id is string => typeof id === "string");

    const { updateCheckpoint } = await import("./server/lib/checkpointStore.ts");
    updateCheckpoint(generationId, {
      showConfig: updatedConfig,
      status: "running",
      policyIncidentId: incidentId,
      policyFailedEventIds:
        failedEventIds.length > 0 ? failedEventIds : checkpoint.policyFailedEventIds,
      canResume: true,
    });

    setIncidentRemediation(generationId, { actions });
    setIncidentStatus(generationId, "applied");

    return res.json({ ok: true, generationId, incidentId });
  });

  app.post("/api/resume-show", async (req, res) => {
    cleanExpiredCheckpoints();
    cleanExpiredPolicyIncidents();
    const { generationId, policyIncidentId } = req.body as {
      generationId?: string;
      policyIncidentId?: string;
    };
    if (!generationId) {
      return res.status(400).json({ error: "Missing generationId" });
    }

    const checkpoint = loadCheckpoint(generationId);
    if (!checkpoint) {
      return res.status(404).json({ error: "Checkpoint not found or expired" });
    }
    if (!checkpoint.environmentId) {
      return res.status(400).json({ error: "Checkpoint has no saved environment to resume" });
    }
    if (!checkpoint.canResume && checkpoint.lastCompletedStep >= 11 && checkpoint.status !== "paused_policy") {
      return res.status(400).json({ error: "This generation cannot be resumed; try salvage instead" });
    }

    const geminiApiKey = getGeminiApiKey();
    if (!geminiApiKey) {
      return res.status(500).json({
        error: "GEMINI_API_KEY is not configured.",
      });
    }

    const apiProbe = await probeGeminiApiAccess(geminiApiKey);
    if (!apiProbe.ok) {
      return res.status(503).json({ error: apiProbe.ok === false ? apiProbe.message : "Gemini API probe failed" });
    }

    res.writeHead(200, {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    });

    const sendEvent = (event: Record<string, unknown>) => {
      res.write(`data: ${JSON.stringify(event)}\n\n`);
    };

    const heartbeatInterval = setInterval(() => {
      res.write(`:\n\n`);
    }, 15000);

    const abortController = new AbortController();
    activeGenerations.set(generationId, abortController);

    req.on("close", () => clearInterval(heartbeatInterval));

    try {
      sendEvent({
        type: "info",
        message: `Resuming from step ${checkpoint.lastCompletedStep + 1}...`,
      });

      const incident = loadPolicyIncident(generationId);
      const usePolicyResume =
        Boolean(policyIncidentId || checkpoint.policyIncidentId || checkpoint.status === "paused_policy");

      const prompt = usePolicyResume
        ? buildPolicyResumePrompt(checkpoint.showConfig, checkpoint.lastCompletedStep, {
            failedEventIds:
              checkpoint.policyFailedEventIds ??
              incident?.failedEventIds ??
              incident?.remediation?.actions
                ?.map((a) => a.target.eventId)
                .filter((id): id is string => Boolean(id)),
          })
        : buildResumePrompt(checkpoint.showConfig, checkpoint.lastCompletedStep);

      const result = await runGeneration({
        generationId,
        showConfig: checkpoint.showConfig,
        prompt,
        apiKey: geminiApiKey,
        signal: abortController.signal,
        abortController,
        sendEvent,
        environmentId: checkpoint.environmentId,
        previousInteractionId: checkpoint.interactionId,
      });

      const pausedPolicy = loadCheckpoint(generationId)?.status === "paused_policy";
      sendEvent({
        type: "status",
        status: result.showDelivered ? "completed" : pausedPolicy ? "paused_policy" : "failed",
      });
    } catch (error) {
      if (error instanceof Error && error.name === "AbortError") {
        console.log(`[resume-show] Aborted: ${generationId}`);
      } else {
        console.error(`[resume-show] Error:`, error);
        sendEvent({
          type: "error",
          message: error instanceof Error ? error.message : "Unknown error",
        });
      }
    } finally {
      clearInterval(heartbeatInterval);
      activeGenerations.delete(generationId);
      res.end();
    }
  });

  app.get("/api/runs/:generationId", (req, res) => {
    const manifest = loadRunManifest(req.params.generationId);
    if (!manifest) {
      return res.status(404).json({ error: "Run artifacts not found" });
    }
    return res.json(manifest);
  });

  app.get("/api/runs/:generationId/bundle", async (req, res) => {
    const { generationId } = req.params;
    const manifest = loadRunManifest(generationId);
    if (!manifest) {
      return res.status(404).send("Run artifacts not found");
    }

    res.setHeader("Content-Type", "application/zip");
    res.setHeader(
      "Content-Disposition",
      `attachment; filename="run-${generationId}-artifacts.zip"`
    );

    const archive = archiver("zip", { zlib: { level: 9 } });
    archive.on("error", (err) => {
      console.error("[runs/bundle] Archive error:", err);
      if (!res.headersSent) {
        res.status(500).end("Failed to create archive");
      }
    });
    archive.pipe(res);

    for (const file of manifest.files) {
      const fullPath = resolveRunFilePath(generationId, file);
      if (fullPath) {
        archive.file(fullPath, { name: file.replace(/\\/g, "/") });
      }
    }

    await archive.finalize();
  });

  app.get("/api/runs/:generationId/file", (req, res) => {
    const { generationId } = req.params;
    const relativePath = req.query.path;
    if (typeof relativePath !== "string" || !relativePath.trim()) {
      return res.status(400).json({ error: "Missing path query parameter" });
    }

    const fullPath = resolveRunFilePath(generationId, relativePath);
    if (!fullPath) {
      return res.status(404).json({ error: "File not found" });
    }

    return res.download(fullPath);
  });

  app.get("/api/download-zip", async (req, res) => {
    const { notesUrl, audioUrl, coverUrl } = req.query;

    if (!audioUrl || typeof audioUrl !== 'string') {
      return res.status(400).send("Missing audioUrl");
    }

    const getFilePath = (url: string) => {
      if (!url || !url.startsWith('/')) return null;
      const decodedUrl = decodeURIComponent(url);
      if (decodedUrl.startsWith('/output/')) {
        return path.join(process.cwd(), decodedUrl);
      } else if (decodedUrl.startsWith('/shows/')) {
        return path.join(process.cwd(), 'public', decodedUrl);
      }
      return null;
    };

    const notesPath = getFilePath(notesUrl as string);
    const audioPath = getFilePath(audioUrl as string);
    const coverPath = getFilePath(coverUrl as string);

    const tmpDir = path.join(process.cwd(), 'output', `tmp_zip_${Date.now()}_${Math.random().toString(36).substring(7)}`);

    try {
      fs.mkdirSync(tmpDir, { recursive: true });

      let hasFiles = false;
      if (notesPath && fs.existsSync(notesPath)) {
        fs.copyFileSync(notesPath, path.join(tmpDir, 'show_notes.json'));
        hasFiles = true;
      }
      if (audioPath && fs.existsSync(audioPath)) {
        fs.copyFileSync(audioPath, path.join(tmpDir, 'ai_radio.mp3'));
        hasFiles = true;
      }
      if (coverPath && fs.existsSync(coverPath)) {
        fs.copyFileSync(coverPath, path.join(tmpDir, 'cover.png'));
        hasFiles = true;
      }

      if (!hasFiles) {
        return res.status(404).send("No files found to zip");
      }

      const zipPath = `${tmpDir}.zip`;
      await execAsync(`zip -j "${zipPath}" "${tmpDir}"/*`);

      res.download(zipPath, 'radio-show.zip', (err) => {
        // Cleanup
        try {
          fs.rmSync(tmpDir, { recursive: true, force: true });
          if (fs.existsSync(zipPath)) fs.unlinkSync(zipPath);
        } catch (e) {
          console.error("Cleanup error:", e);
        }
      });
    } catch (err) {
      console.error("Zip error:", err);
      res.status(500).send("Error creating zip");
      try {
        fs.rmSync(tmpDir, { recursive: true, force: true });
      } catch (e) {}
    }
  });

  app.get("/api/shows", (req, res) => {
    // Run cleanup on library list check
    cleanUpOldGenerations();

    const showsDir = path.join(process.cwd(), 'public', 'shows');
    const shows: any[] = [];

    if (fs.existsSync(showsDir)) {
      const entries = fs.readdirSync(showsDir, { withFileTypes: true });
      for (const entry of entries) {
        if (entry.isDirectory()) {
          const showPath = path.join(showsDir, entry.name);
          const showNotesPath = path.join(showPath, 'show_notes.json');

          if (fs.existsSync(showNotesPath)) {
            try {
              const showNotes = JSON.parse(fs.readFileSync(showNotesPath, 'utf-8'));
              const folderFiles = fs.readdirSync(showPath);
              const mp3File = folderFiles.find(f => f.endsWith('.mp3'));
              const coverFile = folderFiles.find(f => f.endsWith('.png') || f.endsWith('.jpg') || f.endsWith('.jpeg'));

              if (entry.name === 'default') {
                showNotes.audioUrl = "https://www.gstatic.com/aistudio/starter-apps/assets/ai_radio/ai_radio.mp3";
                showNotes.coverImage = "https://www.gstatic.com/aistudio/starter-apps/assets/ai_radio/cover.jpg";
              } else {
                showNotes.audioUrl = `/shows/${entry.name}/${mp3File || 'ai_radio.mp3'}`;
                showNotes.coverImage = coverFile ? `/shows/${entry.name}/${coverFile}` : "https://images.unsplash.com/photo-1550751827-4bd374c3f58b?q=80&w=2070&auto=format&fit=crop";
              }
              showNotes.notesUrl = `/shows/${entry.name}/show_notes.json`;
              shows.push(showNotes);
            } catch (err) {
              console.error(`Error reading show notes for ${entry.name}:`, err);
            }
          }
        }
      }
    }
    res.json(shows);
  });

  app.get("/api/share/config", (req, res) => {
    res.json({
      isSharingEnabled: !!process.env.GCS_BUCKET_NAME
    });
  });

  app.get("/api/health", (req, res) => {
    res.json({ status: "ok" });
  });

  // Vite middleware for development (with a robust fallback to dev middleware if dist/index.html is missing)
  const distPath = path.join(process.cwd(), 'dist');
  const indexHtmlExists = fs.existsSync(path.join(distPath, 'index.html'));

  if (process.env.NODE_ENV !== "production" || !indexHtmlExists) {
    if (process.env.NODE_ENV === "production") {
      console.warn("Production mode enabled, but dist/index.html not found. Falling back to Vite dev server middleware to ensure app stays operational.");
    }
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    app.use(express.static(distPath));
    // Express 5 format for catch-all (if using express 5) or Express 4. Let's use *all for v5 or * for v4.
    // We can use default express 4 catch-all
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  const startListening = (port: number) => {
    const server = app.listen(port, "0.0.0.0", () => {
      console.log(`Server running on http://localhost:${port}`);
    }).on('error', (err: NodeJS.ErrnoException) => {
      if (err.code === 'EADDRINUSE') {
        if (process.env.NODE_ENV === 'production') {
          console.error(`Port ${port} is in use; refusing to bind to a different port in production.`);
          process.exit(1);
        }
        console.log(`Port ${port} is in use, trying ${port + 1}...`);
        startListening(port + 1);
      } else {
        console.error(err);
      }
    });

    // Disable timeouts for long-running agent interactions
    server.setTimeout(0);
    server.requestTimeout = 0;
    server.headersTimeout = 0;
    server.keepAliveTimeout = 0;
  };

  startListening(PORT);
}

startServer();
