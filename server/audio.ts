import { execFile } from "child_process";
import { promisify } from "util";
import path from "path";
import fs from "fs";
import type { MusicalKey } from "@shared/schema";
import { MUSICAL_KEYS } from "@shared/schema";

const execFileAsync = promisify(execFile);

const PROCESSING_DIR = path.join(process.cwd(), "processing");
const YT_DLP_PATH = path.join(process.cwd(), ".pythonlibs", "bin", "yt-dlp");

if (!fs.existsSync(PROCESSING_DIR)) {
  fs.mkdirSync(PROCESSING_DIR, { recursive: true });
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
    let title = "Unknown Title";
    try {
      const { stdout: titleOut } = await execFileAsync(
        YT_DLP_PATH,
        ["--no-playlist", "--print", "title", url],
        { timeout: 30000 }
      );
      title = titleOut.trim() || "Unknown Title";
    } catch {}

    await execFileAsync(
      YT_DLP_PATH,
      [
        "--no-playlist",
        "-x",
        "--audio-quality", "0",
        "-o", outputTemplate,
        url,
      ],
      { timeout: 120000, maxBuffer: 50 * 1024 * 1024 }
    );

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
    throw new Error(`Failed to download audio: ${error.message}`);
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

export async function detectKey(audioPath: string): Promise<MusicalKey> {
  try {
    const pcmPath = audioPath.replace(".wav", "_pcm.raw");
    await execFileAsync(
      "ffmpeg",
      ["-i", audioPath, "-f", "f32le", "-acodec", "pcm_f32le", "-ac", "1", "-ar", "11025", "-t", "15", pcmPath, "-y"],
      { timeout: 30000 }
    );

    const buffer = fs.readFileSync(pcmPath);
    const samples = new Float32Array(buffer.buffer, buffer.byteOffset, buffer.length / 4);

    const sampleRate = 11025;
    const chromagram = new Array(12).fill(0);

    const noteFrequencies = [
      261.63, 277.18, 293.66, 311.13, 329.63, 349.23,
      369.99, 392.00, 415.30, 440.00, 466.16, 493.88,
    ];

    const frameSize = 2048;
    const hopSize = 1024;
    const numFrames = Math.min(
      Math.floor((samples.length - frameSize) / hopSize),
      100
    );

    for (let frame = 0; frame < numFrames; frame++) {
      const start = frame * hopSize;
      for (let noteIdx = 0; noteIdx < 12; noteIdx++) {
        const freq = noteFrequencies[noteIdx];
        let totalMag = 0;

        for (let octave = 0; octave < 3; octave++) {
          const octFreq = freq * Math.pow(2, octave - 1);
          const k = (octFreq / sampleRate) * frameSize;

          let real = 0, imag = 0;
          for (let n = 0; n < frameSize; n++) {
            const sample = samples[start + n] || 0;
            const angle = (2 * Math.PI * k * n) / frameSize;
            const window = 0.5 * (1 - Math.cos((2 * Math.PI * n) / (frameSize - 1)));
            real += sample * window * Math.cos(angle);
            imag -= sample * window * Math.sin(angle);
          }
          totalMag += Math.sqrt(real * real + imag * imag);
        }
        chromagram[noteIdx] += totalMag;
      }
    }

    const majorProfile = [6.35, 2.23, 3.48, 2.33, 4.38, 4.09, 2.52, 5.19, 2.39, 3.66, 2.29, 2.88];

    let bestKey = 0;
    let bestCorr = -Infinity;

    for (let shift = 0; shift < 12; shift++) {
      const rotated = new Array(12);
      for (let i = 0; i < 12; i++) {
        rotated[i] = chromagram[(i + shift) % 12];
      }

      let meanA = 0, meanB = 0;
      for (let i = 0; i < 12; i++) {
        meanA += rotated[i];
        meanB += majorProfile[i];
      }
      meanA /= 12;
      meanB /= 12;

      let num = 0, denA = 0, denB = 0;
      for (let i = 0; i < 12; i++) {
        const a = rotated[i] - meanA;
        const b = majorProfile[i] - meanB;
        num += a * b;
        denA += a * a;
        denB += b * b;
      }
      const corr = num / (Math.sqrt(denA) * Math.sqrt(denB) + 1e-10);

      if (corr > bestCorr) {
        bestCorr = corr;
        bestKey = shift;
      }
    }

    try { fs.unlinkSync(pcmPath); } catch {}

    return MUSICAL_KEYS[bestKey];
  } catch {
    return "C";
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
