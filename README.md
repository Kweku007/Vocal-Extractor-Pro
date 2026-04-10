# Backing Vocalist Pro

**Extract and isolate backing vocals from any YouTube video — directly in your browser.**

---

## What it does

Backing Vocalist Pro takes a YouTube link and does the heavy lifting for you:

1. Downloads the audio from YouTube
2. Uses the **Demucs** ML model to separate the audio into stems (vocals, bass, drums, other)
3. Recombines the stems to isolate the **backing vocal layer** (everything except the lead vocal)
4. Detects the **musical key** (major and relative minor)
5. Lets you **transpose** the result up or down in semitones
6. Plays the processed audio right in the browser
7. Lets you **download** the final mix as an MP3

---

## How to use it

1. Open the app at [https://vocal-extractor-pro.replit.app](https://vocal-extractor-pro.replit.app)
2. Paste a YouTube URL into the input bar — the video title will appear as a preview
3. Click **Process** and wait while the audio is downloaded and separated (typically 1–3 minutes depending on track length)
4. Once complete, the detected key is shown and audio playback becomes available
5. Use the **transpose controls** to shift the pitch up or down by semitones if needed
6. Click **Download** to save the result as an MP3

---

## Features

- Paste any standard YouTube video URL
- ML-powered vocal separation using Facebook's [Demucs](https://github.com/facebookresearch/demucs) (htdemucs model)
- 6-method musical key detection consensus (3 chroma types × 2 profiles via librosa)
- Shows key as both major and relative minor (e.g. "C Major / A Minor")
- Real-time pitch transposition (±12 semitones) applied server-side via FFmpeg
- Streaming audio playback with full transport controls
- One-click MP3 download of the processed audio
- Video title preview before processing begins

---

## Technical overview

| Layer | Technology |
|---|---|
| Frontend | React + TypeScript, Vite, Shadcn/UI, TanStack Query |
| Backend | Node.js + Express |
| YouTube download | yt-dlp with bgutil-ytdlp-pot-provider (auto PO token generation via bgutils-js) |
| Vocal separation | Python — Demucs ML (htdemucs model) |
| Key detection | Python — librosa with harmonic extraction |
| Pitch shifting | FFmpeg (`asetrate` + `atempo` filters) |
| Audio format | Opus/WebM during processing, MP3 on download |

### YouTube authentication

YouTube requires proof-of-origin tokens (PO tokens) to serve audio. The app uses the [bgutil-ytdlp-pot-provider](https://github.com/Brainicism/bgutil-ytdlp-pot-provider) plugin alongside a custom `generate_once.js` script that generates BotGuard tokens via `bgutils-js`. Three download strategies are attempted in order: mweb client with auto PO token → default clients → android_vr client.

### Vocal separation pipeline

After downloading, Demucs splits the audio into four stems: `vocals`, `bass`, `drums`, `other`. The backing vocal output is produced by mixing `bass + drums + other` (i.e. everything except the lead vocal track), converted to MP3 for download.

---

## Project goals

This app was built to help musicians, backing vocalists, and producers:

- Learn and practice backing vocal parts from existing recordings
- Transpose backing tracks to match different vocal ranges
- Isolate instrumental arrangements for performance or study
