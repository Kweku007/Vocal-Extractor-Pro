import { z } from "zod";

export const youtubeUrlSchema = z.object({
  url: z.string().url().refine(
    (url) => {
      const patterns = [
        /^(https?:\/\/)?(www\.)?youtube\.com\/watch\?v=[\w-]+/,
        /^(https?:\/\/)?(www\.)?youtube\.com\/clip\/[\w-]+/,
        /^(https?:\/\/)?(www\.)?youtube\.com\/shorts\/[\w-]+/,
        /^(https?:\/\/)?youtu\.be\/[\w-]+/,
        /^(https?:\/\/)?(www\.)?youtube\.com\/embed\/[\w-]+/,
      ];
      return patterns.some((p) => p.test(url));
    },
    { message: "Please enter a valid YouTube URL" }
  ),
});

export type YoutubeUrlInput = z.infer<typeof youtubeUrlSchema>;

export const MUSICAL_KEYS = [
  "C", "Db", "D", "Eb", "E", "F",
  "F#", "G", "Ab", "A", "Bb", "B",
] as const;

export const MUSICAL_KEYS_SHARP = [
  "C", "C#", "D", "D#", "E", "F",
  "F#", "G", "G#", "A", "A#", "B",
] as const;

export type MusicalKey = (typeof MUSICAL_KEYS)[number];

export const RELATIVE_MINOR_KEYS = [
  "Am", "Bbm", "Bm", "Cm", "C#m", "Dm",
  "D#m", "Ebm", "Em", "Fm", "F#m", "Gm",
] as const;

export interface DetectedKeyInfo {
  major: MusicalKey;
  minor: string;
  mode: "major" | "minor";
}

export interface ProcessingJob {
  id: string;
  status: "downloading" | "uploading" | "separating" | "detecting_key" | "complete" | "error";
  progress: number;
  url: string;
  title?: string;
  detectedKey?: MusicalKey;
  detectedKeyInfo?: DetectedKeyInfo;
  audioFile?: string;
  errorMessage?: string;
}

export interface PitchShiftRequest {
  jobId: string;
  semitones: number;
}

export interface PitchShiftResponse {
  audioFile: string;
  newKey: MusicalKey;
}
