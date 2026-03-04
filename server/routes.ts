import type { Express } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import { v4 as uuidv4 } from "uuid";
import { youtubeUrlSchema, MUSICAL_KEYS } from "@shared/schema";
import type { ProcessingJob, MusicalKey } from "@shared/schema";
import {
  downloadYoutubeAudio,
  extractBackingVocals,
  detectKey,
  pitchShift,
  convertToMp3,
  cleanupJob,
  scheduleCleanup,
  fetchVideoTitle,
  PROCESSING_DIR,
} from "./audio";
import path from "path";
import fs from "fs";

export async function registerRoutes(
  httpServer: Server,
  app: Express
): Promise<Server> {
  app.post("/api/preview", async (req, res) => {
    try {
      const parsed = youtubeUrlSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ message: parsed.error.errors[0].message });
      }
      const title = await fetchVideoTitle(parsed.data.url);
      res.json({ title });
    } catch (error: any) {
      res.status(500).json({ message: error.message || "Failed to fetch video info" });
    }
  });

  app.post("/api/process", async (req, res) => {
    try {
      const parsed = youtubeUrlSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ message: parsed.error.errors[0].message });
      }

      const jobId = uuidv4();
      const job: ProcessingJob = {
        id: jobId,
        status: "downloading",
        progress: 0,
        url: parsed.data.url,
      };

      storage.createJob(job);
      res.json({ jobId });

      processAudio(jobId, parsed.data.url).catch((err) => {
        storage.updateJob(jobId, {
          status: "error",
          errorMessage: err.message || "Processing failed",
        });
      });
    } catch (error: any) {
      res.status(500).json({ message: error.message || "Internal server error" });
    }
  });

  app.get("/api/jobs/:id", (req, res) => {
    const job = storage.getJob(req.params.id);
    if (!job) {
      return res.status(404).json({ message: "Job not found" });
    }
    res.json(job);
  });

  app.get("/api/audio/:id", async (req, res) => {
    const job = storage.getJob(req.params.id);
    if (!job || !job.audioFile) {
      return res.status(404).json({ message: "Audio not found" });
    }

    try {
      const mp3Path = await convertToMp3(job.audioFile);
      res.setHeader("Content-Type", "audio/mpeg");
      res.setHeader("Accept-Ranges", "bytes");
      const stat = fs.statSync(mp3Path);
      res.setHeader("Content-Length", stat.size);
      fs.createReadStream(mp3Path).pipe(res);
    } catch (error: any) {
      res.status(500).json({ message: "Failed to serve audio" });
    }
  });

  app.post("/api/pitch-shift", async (req, res) => {
    try {
      const { jobId, semitones } = req.body;

      if (!jobId || typeof semitones !== "number") {
        return res.status(400).json({ message: "Invalid request" });
      }

      const job = storage.getJob(jobId);
      if (!job || !job.audioFile) {
        return res.status(404).json({ message: "Job not found" });
      }

      if (semitones === 0) {
        const keyIndex = MUSICAL_KEYS.indexOf(job.detectedKey || "C");
        return res.json({
          audioFile: `/api/audio/${jobId}`,
          newKey: MUSICAL_KEYS[keyIndex],
        });
      }

      const shiftedPath = await pitchShift(job.audioFile, semitones, jobId);
      const mp3Path = await convertToMp3(shiftedPath);

      const keyIndex = MUSICAL_KEYS.indexOf(job.detectedKey || "C");
      const newKeyIndex = ((keyIndex + semitones) % 12 + 12) % 12;
      const newKey = MUSICAL_KEYS[newKeyIndex];

      res.json({
        audioFile: `/api/audio-shifted/${jobId}/${semitones}`,
        newKey,
      });
    } catch (error: any) {
      res.status(500).json({ message: error.message || "Pitch shift failed" });
    }
  });

  app.get("/api/audio-shifted/:id/:semitones", async (req, res) => {
    const { id, semitones } = req.params;
    const job = storage.getJob(id);
    if (!job || !job.audioFile) {
      return res.status(404).json({ message: "Audio not found" });
    }

    const shiftedPath = path.join(
      PROCESSING_DIR,
      `${id}_shifted_${semitones}.mp3`
    );

    if (!fs.existsSync(shiftedPath)) {
      const wavPath = path.join(
        PROCESSING_DIR,
        `${id}_shifted_${semitones}.wav`
      );
      if (fs.existsSync(wavPath)) {
        await convertToMp3(wavPath);
      } else {
        return res.status(404).json({ message: "Shifted audio not found" });
      }
    }

    res.setHeader("Content-Type", "audio/mpeg");
    res.setHeader("Accept-Ranges", "bytes");
    const stat = fs.statSync(shiftedPath);
    res.setHeader("Content-Length", stat.size);
    fs.createReadStream(shiftedPath).pipe(res);
  });

  app.get("/api/download/:id", async (req, res) => {
    const semitones = parseInt(req.query.semitones as string) || 0;
    const job = storage.getJob(req.params.id);
    if (!job || !job.audioFile) {
      return res.status(404).json({ message: "Audio not found" });
    }

    try {
      let audioPath: string;

      if (semitones === 0) {
        audioPath = await convertToMp3(job.audioFile);
      } else {
        const shiftedWav = path.join(
          PROCESSING_DIR,
          `${req.params.id}_shifted_${semitones}.wav`
        );
        if (!fs.existsSync(shiftedWav)) {
          await pitchShift(job.audioFile, semitones, req.params.id);
        }
        audioPath = await convertToMp3(shiftedWav);
      }

      const title = (job.title || "backing-vocals").replace(/[^a-zA-Z0-9-_ ]/g, "");
      const keyIndex = MUSICAL_KEYS.indexOf(job.detectedKey || "C");
      const newKeyIndex = ((keyIndex + semitones) % 12 + 12) % 12;
      const keyLabel = MUSICAL_KEYS[newKeyIndex];

      res.setHeader("Content-Type", "audio/mpeg");
      res.setHeader(
        "Content-Disposition",
        `attachment; filename="${title}_backing_vocals_${keyLabel}.mp3"`
      );
      const stat = fs.statSync(audioPath);
      res.setHeader("Content-Length", stat.size);
      fs.createReadStream(audioPath).pipe(res);
    } catch (error: any) {
      res.status(500).json({ message: "Failed to download" });
    }
  });

  return httpServer;
}

async function processAudio(jobId: string, url: string) {
  console.log(`[${jobId}] Starting audio processing for: ${url}`);
  storage.updateJob(jobId, { status: "downloading", progress: 10 });

  const { audioPath, title } = await downloadYoutubeAudio(url, jobId);
  console.log(`[${jobId}] Downloaded audio: ${audioPath}, title: ${title}`);
  console.log(`[${jobId}] File exists: ${fs.existsSync(audioPath)}`);
  storage.updateJob(jobId, { title, progress: 40 });

  storage.updateJob(jobId, { status: "separating", progress: 50 });
  const backingPath = await extractBackingVocals(audioPath, jobId);
  console.log(`[${jobId}] Extracted backing vocals: ${backingPath}`);
  storage.updateJob(jobId, { progress: 75 });

  storage.updateJob(jobId, { status: "detecting_key", progress: 80 });
  const keyInfo = await detectKey(audioPath);
  console.log(`[${jobId}] Detected key: ${keyInfo.major} major / ${keyInfo.minor} (${keyInfo.mode})`);

  storage.updateJob(jobId, {
    status: "complete",
    progress: 100,
    detectedKey: keyInfo.major,
    detectedKeyInfo: keyInfo,
    audioFile: backingPath,
  });

  scheduleCleanup(jobId);
}
