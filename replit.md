# Backing Vocalist Pro

A web application that extracts backing vocals from YouTube videos, detects the musical key, allows key transposition, and provides MP3 download.

## Architecture

- **Frontend**: React + TypeScript with Vite, Shadcn/UI components, TanStack Query
- **Backend**: Express.js with audio processing pipeline
- **Audio Processing**: yt-dlp (YouTube download) + Demucs ML (vocal separation) + FFmpeg (pitch shifting, format conversion)
- **YouTube Auth**: bgutil-ytdlp-pot-provider plugin auto-generates PO tokens via bgutils-js

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
- `server/pot-token.ts` - Legacy PO Token generator (kept as reference, no longer used in download path)
- `server/detect_key.py` - Python key detection script (librosa with harmonic extraction)
- `server/storage.ts` - In-memory job storage
- `shared/schema.ts` - Shared types and validation schemas
- `bgutil-server/build/generate_once.js` - PO token generation script for bgutil-ytdlp-pot-provider plugin
- `bgutil-server/package.json` - ESM module config for the PO token script
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
- yt-dlp-ejs (Python package) - Required for YouTube JS challenge solving
- bgutil-ytdlp-pot-provider (Python package) - yt-dlp plugin for automatic PO token generation
- Python 3 (.pythonlibs/bin/python3) - Key detection, Demucs

## Key NPM Dependencies

- bgutils-js - Google BotGuard PO token generation (used by generate_once.js)
- youtubei.js - YouTube Innertube API client (used by generate_once.js)
- jsdom - DOM environment for BotGuard (used by generate_once.js)
- commander - CLI arg parsing (used by generate_once.js)
- uuid - Unique job IDs

## Key Python Dependencies

- demucs - ML vocal separation
- librosa - Audio analysis and key detection
- numpy - Numerical processing
- yt-dlp-ejs - YouTube EJS challenge solver scripts (required alongside yt-dlp)
- bgutil-ytdlp-pot-provider - PO token provider plugin for yt-dlp

## YouTube Download Strategy

Uses yt-dlp with the bgutil-ytdlp-pot-provider plugin for automatic PO token generation. The plugin hooks into yt-dlp's YouTube extractor and uses bgutils-js to generate BotGuard PO tokens on demand. Download attempts (in order):

1. **mweb client with auto-PO token** - Officially recommended by yt-dlp wiki; plugin generates GVS PO token automatically
2. **Default clients** - yt-dlp's built-in client selection
3. **android_vr client** - No PO token required

Environment setup:
- `NODE_PATH` set to `{cwd}/node_modules` so generate_once.js can find npm packages
- `--js-runtimes node:/absolute/path` for JS challenge solving via yt-dlp-ejs
- `--extractor-args youtubepot-bgutilscript:server_home={cwd}/bgutil-server` points plugin to the PO token script

## Key Detection

Uses `server/detect_key.py` with a 6-method consensus approach:
- 3 chroma types (CQT, STFT, CENS) × 2 profiles (Krumhansl-Kessler, Temperley)
- Harmonic extraction before analysis
- Full mix analysis on original audio
- Shows both major + relative minor (e.g., "C Major (Am)")
