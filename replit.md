# Backing Vocalist Pro

A web application that extracts backing vocals from YouTube videos, detects the musical key, allows key transposition, and provides MP3 download.

## Architecture

- **Frontend**: React + TypeScript with Vite, Shadcn/UI components, TanStack Query
- **Backend**: Express.js with audio processing pipeline
- **Audio Processing**: yt-dlp (YouTube download) + Demucs ML (vocal separation) + FFmpeg (pitch shifting, format conversion)
- **YouTube Auth**: PO Token generation via bgutils-js + youtubei.js to bypass bot detection on cloud servers

## Key Features

1. YouTube URL input (full links, clips, shorts)
2. Backing vocal extraction using Demucs ML model (htdemucs)
3. Musical key detection using 6-method consensus (librosa, 3 chroma types × 2 profiles)
4. Pitch shifting with key transposition
5. In-browser audio playback with full controls
6. MP3 download of processed audio
7. Video title preview in input bar (oEmbed → HTML scraping → yt-dlp fallback)

## Project Structure

- `client/src/pages/home.tsx` - Main application page with all UI
- `server/routes.ts` - API endpoints for processing, playback, and download
- `server/audio.ts` - Audio processing utilities (download, separation, key detection, pitch shift)
- `server/pot-token.ts` - PO Token generator for YouTube authentication (bgutils-js + BotGuard)
- `server/detect_key.py` - Python key detection script (librosa with harmonic extraction)
- `server/storage.ts` - In-memory job storage
- `shared/schema.ts` - Shared types and validation schemas
- `processing/` - Temporary directory for audio files during processing (auto-cleaned after 30 min)

## API Endpoints

- `POST /api/preview` - Fetch video title from YouTube URL
- `POST /api/process` - Start processing a YouTube URL
- `GET /api/jobs/:id` - Get processing job status
- `GET /api/audio/:id` - Stream processed audio
- `POST /api/pitch-shift` - Shift pitch by semitones
- `GET /api/audio-shifted/:id/:semitones` - Stream pitch-shifted audio
- `GET /api/download/:id?semitones=N` - Download final MP3

## System Dependencies

- ffmpeg (nix) - Audio processing
- yt-dlp (.pythonlibs/bin/yt-dlp) - YouTube audio download
- Python 3 (.pythonlibs/bin/python3) - Key detection, Demucs

## Key NPM Dependencies

- bgutils-js - Google BotGuard PO token generation
- youtubei.js - YouTube Innertube API client
- jsdom - DOM environment for BotGuard
- uuid - Unique job IDs

## Key Python Dependencies

- demucs - ML vocal separation
- librosa - Audio analysis and key detection
- numpy - Numerical processing

## YouTube Download Strategy

Uses PO (Proof of Origin) tokens generated via bgutils-js to authenticate with YouTube's BotGuard system. This bypasses bot detection on cloud/datacenter IPs. Falls back to android_vr, mediaconnect, and default player clients if PO token generation fails.

## Key Detection

Uses `server/detect_key.py` with a 6-method consensus approach:
- 3 chroma types (CQT, STFT, CENS) × 2 profiles (Krumhansl-Kessler, Temperley)
- Harmonic extraction before analysis
- Full mix analysis on original audio
- Shows both major + relative minor (e.g., "C Major (Am)")
