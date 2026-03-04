import { execFile } from "child_process";
import { promisify } from "util";
import path from "path";
import fs from "fs";
import type { MusicalKey, DetectedKeyInfo } from "@shared/schema";
import { MUSICAL_KEYS, RELATIVE_MINOR_KEYS } from "@shared/schema";

const execFileAsync = promisify(execFile);

const PROCESSING_DIR = path.join(process.cwd(), "processing");
const YT_DLP_PATH = path.join(process.cwd(), ".pythonlibs", "bin", "yt-dlp");

function getNodePath(): string {
  try {
    const { execSync } = require("child_process");
    return execSync("which node", { encoding: "utf8" }).trim();
  } catch {
    return "node";
  }
}
const NODE_PATH = getNodePath();

if (!fs.existsSync(PROCESSING_DIR)) {
  fs.mkdirSync(PROCESSING_DIR, { recursive: true });
}

const bgutilScriptPath = path.join(process.cwd(), "bgutil-server", "build", "generate_once.js");
console.log(`[audio] Node.js path: ${NODE_PATH}`);
console.log(`[audio] yt-dlp path: ${YT_DLP_PATH} (exists: ${fs.existsSync(YT_DLP_PATH)})`);
console.log(`[audio] bgutil script: ${bgutilScriptPath} (exists: ${fs.existsSync(bgutilScriptPath)})`);


export async function fetchVideoTitle(url: string): Promise<string> {
  try {
    const oembedUrl = `https://www.youtube.com/oembed?url=${encodeURIComponent(url)}&format=json`;
    const res = await fetch(oembedUrl, { signal: AbortSignal.timeout(10000) });
    if (res.ok) {
      const data = await res.json() as { title?: string };
      if (data.title) return data.title;
    }
  } catch {}

  try {
    const pageRes = await fetch(url, {
      signal: AbortSignal.timeout(10000),
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        "Accept-Language": "en-US,en;q=0.9",
      },
      redirect: "follow",
    });
    if (pageRes.ok) {
      const html = await pageRes.text();
      const ogMatch = html.match(/<meta[^>]*property="og:title"[^>]*content="([^"]+)"/) ||
                       html.match(/<meta[^>]*content="([^"]+)"[^>]*property="og:title"/);
      if (ogMatch?.[1]) return ogMatch[1].replace(/&amp;/g, "&").replace(/&#39;/g, "'").replace(/&quot;/g, '"');
      const titleMatch = html.match(/<title>([^<]+)<\/title>/);
      if (titleMatch?.[1]) {
        const title = titleMatch[1].replace(" - YouTube", "").trim();
        if (title) return title;
      }
    }
  } catch {}

  try {
    const { stdout } = await execFileAsync(
      YT_DLP_PATH,
      ["--no-playlist", "--js-runtimes", `node:${NODE_PATH}`, "--print", "title", url],
      {
        timeout: 15000,
        env: {
          ...process.env,
          NODE_PATH: path.join(process.cwd(), "node_modules"),
        },
      }
    );
    if (stdout.trim()) return stdout.trim();
  } catch {}

  return "Unknown Title";
}

const JOB_TTL_MS = 30 * 60 * 1000;

const jobTimers = new Map<string, NodeJS.Timeout>();

function scheduleCleanup(jobId: string) {
  if (jobTimers.has(jobId)) {
    clearTimeout(jobTimers.get(jobId)!);
  }
  jobTimers.set(
    jobId,
    setTimeout(() => {
      cleanupJob(jobId);
      jobTimers.delete(jobId);
    }, JOB_TTL_MS)
  );
}

export async function downloadYoutubeAudio(
  url: string,
  jobId: string
): Promise<{ audioPath: string; title: string }> {
  const outputTemplate = path.join(PROCESSING_DIR, `${jobId}_raw.%(ext)s`);

  try {
    let title = await fetchVideoTitle(url);

    const bgutilServerHome = path.join(process.cwd(), "bgutil-server");
    const baseArgs = [
      "--no-playlist",
      "--js-runtimes", `node:${NODE_PATH}`,
      "--extractor-args", `youtubepot-bgutilscript:server_home=${bgutilServerHome}`,
    ];
    const outputArgs = ["-x", "--audio-quality", "0", "-o", outputTemplate, url];

    const dlConfigs: { label: string; args: string[] }[] = [
      {
        label: "mweb client (plugin auto-PO token)",
        args: [...baseArgs, "--extractor-args", "youtube:player_client=mweb", ...outputArgs],
      },
      {
        label: "default clients",
        args: [...baseArgs, ...outputArgs],
      },
      {
        label: "android_vr client (no PO token needed)",
        args: [...baseArgs, "--extractor-args", "youtube:player_client=android_vr", ...outputArgs],
      },
    ];

    let lastError: Error | null = null;
    for (let i = 0; i < dlConfigs.length; i++) {
      try {
        const args = ["--verbose", ...dlConfigs[i].args];
        console.log(`[${jobId}] Download attempt ${i + 1}/${dlConfigs.length}: ${dlConfigs[i].label}`);
        const result = await execFileAsync(
          YT_DLP_PATH,
          args,
          {
            timeout: 120000,
            maxBuffer: 50 * 1024 * 1024,
            env: {
              ...process.env,
              NODE_PATH: path.join(process.cwd(), "node_modules"),
            },
          }
        );
        if (result.stderr) {
          const debugLines = result.stderr.split("\n").filter((l: string) =>
            /plugin|pot|PO.Token|bgutil|provider|format|WARNING|ERROR/i.test(l)
          ).slice(0, 20);
          if (debugLines.length > 0) {
            console.log(`[${jobId}] yt-dlp debug:`, debugLines.join(" | "));
          }
        }
        lastError = null;
        break;
      } catch (err: any) {
        lastError = err;
        const stderr = err.stderr || err.message || "";
        console.error(`[${jobId}] Download attempt ${i + 1} (${dlConfigs[i].label}) failed: ${stderr.slice(0, 4000)}`);
        const partialFiles = fs.readdirSync(PROCESSING_DIR).filter(f => f.startsWith(`${jobId}_raw.`));
        for (const f of partialFiles) {
          try { fs.unlinkSync(path.join(PROCESSING_DIR, f)); } catch {}
        }
      }
    }
    if (lastError) throw lastError;

    const wavPath = path.join(PROCESSING_DIR, `${jobId}_raw.wav`);

    const files = fs.readdirSync(PROCESSING_DIR).filter(f => f.startsWith(`${jobId}_raw.`) && !f.endsWith(".wav"));
    if (files.length > 0) {
      const srcPath = path.join(PROCESSING_DIR, files[0]);
      await execFileAsync(
        "ffmpeg",
        ["-i", srcPath, "-ar", "44100", "-ac", "2", wavPath, "-y"],
        { timeout: 60000, maxBuffer: 10 * 1024 * 1024 }
      );
      try { fs.unlinkSync(srcPath); } catch {}
    }

    if (!fs.existsSync(wavPath)) {
      const allFiles = fs.readdirSync(PROCESSING_DIR).filter(f => f.startsWith(`${jobId}_raw`));
      if (allFiles.length > 0 && allFiles[0].endsWith(".wav")) {
        // already wav
      } else {
        throw new Error("Downloaded file could not be converted to WAV. Files found: " + allFiles.join(", "));
      }
    }

    return { audioPath: wavPath, title };
  } catch (error: any) {
    const msg = error.message || "";
    if (msg.includes("Sign in") || msg.includes("not a bot") || msg.includes("confirm you")) {
      throw new Error("YouTube is blocking downloads from this server. This is a known limitation with cloud-hosted servers. Please try again in a few minutes, or try a different video.");
    }
    throw new Error(`Failed to download audio. Please check that the YouTube URL is valid and the video is publicly accessible.`);
  }
}

export async function extractBackingVocals(
  inputPath: string,
  jobId: string
): Promise<string> {
  const outputPath = path.join(PROCESSING_DIR, `${jobId}_backing.wav`);
  const demucsOutputDir = path.join(PROCESSING_DIR, `${jobId}_demucs`);
  const pythonPath = path.join(process.cwd(), ".pythonlibs", "bin", "python3");

  try {
    console.log(`[${jobId}] Running Demucs ML separation...`);
    await execFileAsync(
      pythonPath,
      [
        "-m", "demucs",
        "--two-stems", "vocals",
        "-n", "htdemucs",
        "--out", demucsOutputDir,
        inputPath,
      ],
      { timeout: 600000, maxBuffer: 50 * 1024 * 1024 }
    );

    const modelDir = path.join(demucsOutputDir, "htdemucs");
    const dirs = fs.existsSync(modelDir) ? fs.readdirSync(modelDir) : [];
    if (dirs.length === 0) {
      throw new Error("Demucs produced no output");
    }

    const trackDir = path.join(modelDir, dirs[0]);
    const vocalsPath = path.join(trackDir, "vocals.wav");

    if (!fs.existsSync(vocalsPath)) {
      throw new Error("Demucs did not produce vocals.wav");
    }

    fs.copyFileSync(vocalsPath, outputPath);

    try {
      fs.rmSync(demucsOutputDir, { recursive: true, force: true });
    } catch {}

    console.log(`[${jobId}] Demucs separation complete`);
    return outputPath;
  } catch (error: any) {
    console.error(`[${jobId}] Demucs failed: ${error.message}`);

    console.log(`[${jobId}] Falling back to FFmpeg separation...`);
    try {
      await execFileAsync(
        "ffmpeg",
        [
          "-i", inputPath,
          "-af", "pan=stereo|c0=c0-c1|c1=c1-c0,highpass=f=200,lowpass=f=8000,equalizer=f=3000:t=q:w=1:g=3",
          outputPath,
          "-y",
        ],
        { timeout: 120000 }
      );
      return outputPath;
    } catch (fallbackError: any) {
      throw new Error(`Failed to extract backing vocals: ${fallbackError.message}`);
    }
  }
}

export async function detectKey(audioPath: string): Promise<DetectedKeyInfo> {
  const pythonPath = path.join(process.cwd(), ".pythonlibs", "bin", "python3");
  const scriptPath = path.join(process.cwd(), "server", "detect_key.py");

  try {
    const { stdout } = await execFileAsync(
      pythonPath,
      [scriptPath, audioPath],
      { timeout: 120000, maxBuffer: 10 * 1024 * 1024 }
    );

    const result = JSON.parse(stdout.trim());
    console.log(`Key detection result: ${JSON.stringify(result)}`);

    return {
      major: result.major as MusicalKey,
      minor: result.minor,
      mode: result.mode,
    };
  } catch (error: any) {
    console.error("Key detection error:", error.message);
    return { major: "C", minor: "Am", mode: "major" };
  }
}

export async function pitchShift(
  inputPath: string,
  semitones: number,
  jobId: string
): Promise<string> {
  const outputPath = path.join(PROCESSING_DIR, `${jobId}_shifted_${semitones}.wav`);

  if (fs.existsSync(outputPath)) {
    return outputPath;
  }

  try {
    const ratio = Math.pow(2, semitones / 12);
    const newRate = Math.round(44100 * ratio);
    const tempoFactor = 1 / ratio;

    await execFileAsync(
      "ffmpeg",
      [
        "-i", inputPath,
        "-af", `asetrate=${newRate},aresample=44100,atempo=${tempoFactor.toFixed(6)}`,
        outputPath,
        "-y",
      ],
      { timeout: 60000 }
    );

    return outputPath;
  } catch (error: any) {
    throw new Error(`Failed to pitch shift: ${error.message}`);
  }
}

export async function convertToMp3(inputPath: string): Promise<string> {
  const outputPath = inputPath.replace(/\.wav$/, ".mp3");

  if (fs.existsSync(outputPath)) {
    return outputPath;
  }

  try {
    await execFileAsync(
      "ffmpeg",
      ["-i", inputPath, "-codec:a", "libmp3lame", "-qscale:a", "2", outputPath, "-y"],
      { timeout: 60000 }
    );
    return outputPath;
  } catch (error: any) {
    throw new Error(`Failed to convert to MP3: ${error.message}`);
  }
}

export function cleanupJob(jobId: string) {
  try {
    const files = fs.readdirSync(PROCESSING_DIR).filter(f => f.startsWith(jobId));
    for (const file of files) {
      fs.unlinkSync(path.join(PROCESSING_DIR, file));
    }
  } catch {}
}

export { PROCESSING_DIR, scheduleCleanup };
