# Vocal Extractor

A web application that extracts backing vocals from YouTube videos, detects the musical key, allows key transposition, and provides MP3 download.

## Architecture

- **Frontend**: React + TypeScript with Vite, Shadcn/UI components, TanStack Query
- **Backend**: Express.js with audio processing pipeline
- **Audio Processing**: yt-dlp (YouTube download) + FFmpeg (vocal separation, pitch shifting, format conversion)

## Key Features

1. YouTube URL input (full links, clips, shorts)
2. Backing vocal extraction using FFmpeg stereo phase cancellation
3. Musical key detection using chromagram + Krumhansl-Schmuckler algorithm
4. Pitch shifting with key transposition
5. In-browser audio playback with full controls
6. MP3 download of processed audio

## Project Structure

- `client/src/pages/home.tsx` - Main application page with all UI
- `server/routes.ts` - API endpoints for processing, playback, and download
- `server/audio.ts` - Audio processing utilities (download, separation, key detection, pitch shift)
- `server/storage.ts` - In-memory job storage
- `shared/schema.ts` - Shared types and validation schemas
- `processing/` - Temporary directory for audio files during processing

## API Endpoints

- `POST /api/process` - Start processing a YouTube URL
- `GET /api/jobs/:id` - Get processing job status
- `GET /api/audio/:id` - Stream processed audio
- `POST /api/pitch-shift` - Shift pitch by semitones
- `GET /api/audio-shifted/:id/:semitones` - Stream pitch-shifted audio
- `GET /api/download/:id?semitones=N` - Download final MP3

## System Dependencies

- ffmpeg - Audio processing
- yt-dlp - YouTube audio download

## NPM Dependencies (notable additions)

- fluent-ffmpeg - FFmpeg Node.js wrapper
- uuid - Unique job IDs
