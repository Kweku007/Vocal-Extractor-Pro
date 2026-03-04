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
  "C", "C#", "D", "D#", "E", "F",
  "F#", "G", "G#", "A", "A#", "B",
] as const;

export type MusicalKey = (typeof MUSICAL_KEYS)[number];

export interface ProcessingJob {
  id: string;
  status: "downloading" | "separating" | "detecting_key" | "complete" | "error";
  progress: number;
  url: string;
  title?: string;
  detectedKey?: MusicalKey;
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
