import { useState, useRef, useEffect, useCallback } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Slider } from "@/components/ui/slider";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Music,
  Download,
  Play,
  Pause,
  Loader2,
  Link as LinkIcon,
  Volume2,
  VolumeX,
  SkipBack,
  Sparkles,
  Home as HomeIcon,
  Music2,
} from "lucide-react";
import { SiYoutube } from "react-icons/si";
import type { ProcessingJob, MusicalKey } from "@shared/schema";
import { MUSICAL_KEYS, RELATIVE_MINOR_KEYS } from "@shared/schema";

const STATUS_LABELS: Record<string, string> = {
  downloading: "Downloading audio from YouTube...",
  separating: "Isolating vocals with AI (this may take a few minutes)...",
  detecting_key: "Detecting musical key...",
  complete: "Processing complete!",
  error: "An error occurred",
};

export default function Home() {
  const [url, setUrl] = useState("");
  const [videoTitle, setVideoTitle] = useState<string | null>(null);
  const [jobId, setJobId] = useState<string | null>(null);
  const [semitones, setSemitones] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [volume, setVolume] = useState(0.8);
  const [isMuted, setIsMuted] = useState(false);
  const [audioSrc, setAudioSrc] = useState<string | null>(null);
  const [isShifting, setIsShifting] = useState(false);
  const audioRef = useRef<HTMLAudioElement>(null);
  const { toast } = useToast();

  const processMutation = useMutation({
    mutationFn: async (youtubeUrl: string) => {
      const res = await apiRequest("POST", "/api/process", { url: youtubeUrl });
      return res.json();
    },
    onSuccess: (data: { jobId: string }) => {
      setJobId(data.jobId);
      setSemitones(0);
      setAudioSrc(null);
      setIsPlaying(false);
      setCurrentTime(0);
      setDuration(0);
    },
    onError: (error: Error) => {
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const previewMutation = useMutation({
    mutationFn: async (youtubeUrl: string) => {
      const res = await apiRequest("POST", "/api/preview", { url: youtubeUrl });
      return res.json();
    },
    onSuccess: (data: { title: string }) => {
      if (data.title && data.title !== "Unknown Title") {
        setVideoTitle(data.title);
      }
    },
    onError: () => {
      setVideoTitle(null);
    },
  });

  const isYoutubeUrl = (value: string) => {
    return /(?:youtube\.com|youtu\.be)/.test(value);
  };

  const handleUrlChange = (value: string) => {
    setUrl(value);
    setVideoTitle(null);
    if (isYoutubeUrl(value.trim())) {
      previewMutation.mutate(value.trim());
    }
  };

  const handleNewExtraction = () => {
    setUrl("");
    setVideoTitle(null);
    setJobId(null);
    setSemitones(0);
    setAudioSrc(null);
    setIsPlaying(false);
    setCurrentTime(0);
    setDuration(0);
    if (audioRef.current) {
      audioRef.current.pause();
    }
  };

  const { data: job } = useQuery<ProcessingJob>({
    queryKey: ["/api/jobs", jobId],
    enabled: !!jobId,
    refetchInterval: (query) => {
      const data = query.state.data as ProcessingJob | undefined;
      if (!data) return 1000;
      if (data.status === "complete" || data.status === "error") return false;
      return 1000;
    },
  });

  useEffect(() => {
    if (job?.status === "complete" && !audioSrc) {
      setAudioSrc(`/api/audio/${jobId}`);
    }
  }, [job?.status, jobId, audioSrc]);

  useEffect(() => {
    if (job?.status === "error") {
      toast({
        title: "Processing Error",
        description: job.errorMessage || "Something went wrong",
        variant: "destructive",
      });
    }
  }, [job?.status, job?.errorMessage, toast]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!url.trim()) return;
    processMutation.mutate(url.trim());
  };

  const handleKeyChange = async (newKey: string) => {
    if (!job || !jobId) return;
    const currentKeyIndex = MUSICAL_KEYS.indexOf(job.detectedKey || "C");
    const targetKeyIndex = MUSICAL_KEYS.indexOf(newKey as MusicalKey);
    let diff = targetKeyIndex - currentKeyIndex;
    if (diff > 6) diff -= 12;
    if (diff < -6) diff += 12;

    setSemitones(diff);
    setIsShifting(true);
    setIsPlaying(false);
    if (audioRef.current) {
      audioRef.current.pause();
    }

    try {
      const res = await apiRequest("POST", "/api/pitch-shift", {
        jobId,
        semitones: diff,
      });
      const data = await res.json();
      setAudioSrc(data.audioFile);
      setCurrentTime(0);
    } catch (error: any) {
      toast({
        title: "Pitch Shift Error",
        description: error.message,
        variant: "destructive",
      });
    } finally {
      setIsShifting(false);
    }
  };

  const togglePlay = useCallback(() => {
    if (!audioRef.current) return;
    if (isPlaying) {
      audioRef.current.pause();
    } else {
      audioRef.current.play();
    }
    setIsPlaying(!isPlaying);
  }, [isPlaying]);

  const handleSeek = (value: number[]) => {
    if (audioRef.current) {
      audioRef.current.currentTime = value[0];
      setCurrentTime(value[0]);
    }
  };

  const handleVolumeChange = (value: number[]) => {
    const vol = value[0];
    setVolume(vol);
    if (audioRef.current) {
      audioRef.current.volume = vol;
    }
    if (vol === 0) setIsMuted(true);
    else setIsMuted(false);
  };

  const toggleMute = () => {
    if (audioRef.current) {
      if (isMuted) {
        audioRef.current.volume = volume || 0.5;
        setIsMuted(false);
      } else {
        audioRef.current.volume = 0;
        setIsMuted(true);
      }
    }
  };

  const handleRestart = () => {
    if (audioRef.current) {
      audioRef.current.currentTime = 0;
      setCurrentTime(0);
    }
  };

  const handleDownload = () => {
    if (!jobId) return;
    const link = document.createElement("a");
    link.href = `/api/download/${jobId}?semitones=${semitones}`;
    link.download = "";
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const formatTime = (seconds: number) => {
    const m = Math.floor(seconds / 60);
    const s = Math.floor(seconds % 60);
    return `${m}:${s.toString().padStart(2, "0")}`;
  };

  const currentDisplayKey = (() => {
    if (!job?.detectedKey) return null;
    const idx = MUSICAL_KEYS.indexOf(job.detectedKey);
    const newIdx = ((idx + semitones) % 12 + 12) % 12;
    return MUSICAL_KEYS[newIdx];
  })();

  const currentDisplayMinor = (() => {
    if (!currentDisplayKey) return null;
    const idx = MUSICAL_KEYS.indexOf(currentDisplayKey);
    return RELATIVE_MINOR_KEYS[idx];
  })();

  const detectedKeyLabel = (() => {
    if (!job?.detectedKeyInfo) {
      if (!job?.detectedKey) return null;
      return `${job.detectedKey} Major`;
    }
    const info = job.detectedKeyInfo;
    return `${info.major} Major (${info.minor})`;
  })();

  const currentKeyLabel = (() => {
    if (!currentDisplayKey || !currentDisplayMinor) return null;
    return `${currentDisplayKey} Major (${currentDisplayMinor})`;
  })();

  const isProcessing =
    processMutation.isPending ||
    (job && job.status !== "complete" && job.status !== "error");

  return (
    <div className="min-h-screen bg-background">
      <div className="relative overflow-hidden min-h-screen">
        <div className="absolute inset-0 bg-gradient-to-br from-primary/5 via-transparent to-primary/10" />
        <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[800px] h-[400px] bg-primary/5 rounded-full blur-3xl" />

        <div className="relative max-w-2xl mx-auto px-4 pt-16 pb-10">
          <div className="text-center mb-10">
            <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-primary/10 mb-5">
              <Music2 className="w-8 h-8 text-primary" />
            </div>
            <h1
              className="text-4xl font-bold tracking-tight mb-3"
              data-testid="text-title"
            >
              Backing Vocalist Pro
            </h1>
            <p
              className="text-muted-foreground text-lg max-w-md mx-auto"
              data-testid="text-subtitle"
            >
              Extract backing vocals from any YouTube video, detect the key, and
              transpose to your desired pitch.
            </p>
          </div>

          <form onSubmit={handleSubmit} className="mb-8">
            <Card className="p-4">
              <div className="flex gap-3 items-center">
                <div className="flex items-center justify-center w-10 h-10 rounded-md bg-red-500/10 shrink-0">
                  <SiYoutube className="w-5 h-5 text-red-500" />
                </div>
                <div className="flex-1 relative">
                  <Input
                    data-testid="input-youtube-url"
                    type="text"
                    placeholder="Paste a YouTube link here..."
                    value={videoTitle || url}
                    onChange={(e) => {
                      if (videoTitle) {
                        setVideoTitle(null);
                        setUrl("");
                      } else {
                        handleUrlChange(e.target.value);
                      }
                    }}
                    onFocus={() => {
                      if (videoTitle) {
                        setVideoTitle(null);
                        setUrl(url);
                      }
                    }}
                    disabled={!!isProcessing}
                  />
                  {previewMutation.isPending && (
                    <p className="text-xs text-muted-foreground mt-1">
                      Fetching video info...
                    </p>
                  )}
                </div>
                {job?.status === "complete" ? (
                  <Button
                    data-testid="button-home"
                    type="button"
                    onClick={handleNewExtraction}
                    variant="default"
                    size="default"
                  >
                    <HomeIcon className="w-4 h-4 mr-1" />
                    Home
                  </Button>
                ) : (
                  <Button
                    data-testid="button-extract"
                    type="submit"
                    disabled={!url.trim() || !!isProcessing}
                    size="default"
                  >
                    {isProcessing ? (
                      <Loader2 className="w-4 h-4 animate-spin" />
                    ) : (
                      <>
                        <Sparkles className="w-4 h-4 mr-1" />
                        Extract
                      </>
                    )}
                  </Button>
                )}
              </div>
            </Card>
            <div className="flex flex-wrap items-center justify-center gap-2 mt-3">
              <Badge variant="outline">
                <Music className="w-3 h-3 mr-1" />
                Key Detection
              </Badge>
              <Badge variant="outline">
                <Music2 className="w-3 h-3 mr-1" />
                Vocal Extraction
              </Badge>
              <Badge variant="outline">
                <Music2 className="w-3 h-3 mr-1" />
                Pitch Shifting
              </Badge>
              <Badge variant="outline">
                <Download className="w-3 h-3 mr-1" />
                MP3 Download
              </Badge>
            </div>
          </form>

          {isProcessing && job && (
            <Card className="p-6 mb-6" data-testid="card-processing">
              <div className="flex items-center gap-3 mb-4">
                <div className="relative">
                  <Music2 className="w-5 h-5 text-primary animate-pulse" />
                </div>
                <div className="flex-1">
                  <p className="font-medium text-sm" data-testid="text-status">
                    {STATUS_LABELS[job.status] || "Processing..."}
                  </p>
                  {job.title && (
                    <p
                      className="text-xs text-muted-foreground mt-0.5 truncate max-w-[400px]"
                      data-testid="text-video-title"
                    >
                      {job.title}
                    </p>
                  )}
                </div>
                <Badge variant="secondary" data-testid="badge-progress">
                  {job.progress}%
                </Badge>
              </div>
              <Progress
                value={job.progress}
                className="h-2"
                data-testid="progress-bar"
              />
            </Card>
          )}

          {job?.status === "complete" && (
            <div className="space-y-4" data-testid="section-results">
              <Card className="p-6">
                <div className="flex items-center justify-between gap-3 mb-5">
                  <div className="min-w-0">
                    <p
                      className="font-semibold truncate"
                      data-testid="text-result-title"
                    >
                      {job.title || "Backing Vocals"}
                    </p>
                    <p className="text-sm text-muted-foreground">
                      Backing vocals extracted
                    </p>
                  </div>
                  <div className="flex items-center gap-2 flex-wrap">
                    <Badge variant="outline" data-testid="badge-detected-key">
                      <Music className="w-3 h-3 mr-1" />
                      Detected: {detectedKeyLabel}
                    </Badge>
                    {semitones !== 0 && currentKeyLabel && (
                      <Badge data-testid="badge-current-key">
                        <Music className="w-3 h-3 mr-1" />
                        Current: {currentKeyLabel}
                      </Badge>
                    )}
                  </div>
                </div>

                {audioSrc && (
                  <audio
                    ref={audioRef}
                    src={audioSrc}
                    onTimeUpdate={() =>
                      setCurrentTime(audioRef.current?.currentTime || 0)
                    }
                    onLoadedMetadata={() =>
                      setDuration(audioRef.current?.duration || 0)
                    }
                    onEnded={() => setIsPlaying(false)}
                    preload="auto"
                  />
                )}

                <div className="bg-muted/50 rounded-lg p-4 mb-5">
                  <div className="flex items-center gap-3 mb-3">
                    <Button
                      data-testid="button-restart"
                      size="icon"
                      variant="ghost"
                      onClick={handleRestart}
                    >
                      <SkipBack className="w-4 h-4" />
                    </Button>
                    <Button
                      data-testid="button-play-pause"
                      size="icon"
                      variant="default"
                      onClick={togglePlay}
                      disabled={!audioSrc || isShifting}
                    >
                      {isShifting ? (
                        <Loader2 className="w-4 h-4 animate-spin" />
                      ) : isPlaying ? (
                        <Pause className="w-4 h-4" />
                      ) : (
                        <Play className="w-4 h-4" />
                      )}
                    </Button>
                    <div className="flex-1 flex items-center gap-2">
                      <span
                        className="text-xs text-muted-foreground font-mono w-10 text-right"
                        data-testid="text-current-time"
                      >
                        {formatTime(currentTime)}
                      </span>
                      <Slider
                        data-testid="slider-seek"
                        value={[currentTime]}
                        max={duration || 100}
                        step={0.1}
                        onValueChange={handleSeek}
                        className="flex-1"
                      />
                      <span
                        className="text-xs text-muted-foreground font-mono w-10"
                        data-testid="text-duration"
                      >
                        {formatTime(duration)}
                      </span>
                    </div>
                    <Button
                      data-testid="button-mute"
                      size="icon"
                      variant="ghost"
                      onClick={toggleMute}
                    >
                      {isMuted ? (
                        <VolumeX className="w-4 h-4" />
                      ) : (
                        <Volume2 className="w-4 h-4" />
                      )}
                    </Button>
                    <Slider
                      data-testid="slider-volume"
                      value={[isMuted ? 0 : volume]}
                      max={1}
                      step={0.01}
                      onValueChange={handleVolumeChange}
                      className="w-20"
                    />
                  </div>
                </div>

                <div className="space-y-4">
                  <div>
                    <label className="text-sm font-medium mb-2 block">
                      Change Key
                    </label>
                    <div className="flex items-center gap-3">
                      <Select
                        value={currentDisplayKey || job.detectedKey || "C"}
                        onValueChange={handleKeyChange}
                        disabled={isShifting}
                      >
                        <SelectTrigger
                          className="w-48"
                          data-testid="select-key"
                        >
                          <SelectValue placeholder="Select key" />
                        </SelectTrigger>
                        <SelectContent>
                          {MUSICAL_KEYS.map((key, idx) => {
                            const minor = RELATIVE_MINOR_KEYS[idx];
                            return (
                              <SelectItem
                                key={key}
                                value={key}
                                data-testid={`option-key-${key}`}
                              >
                                {key} Major ({minor})
                              </SelectItem>
                            );
                          })}
                        </SelectContent>
                      </Select>
                      <span className="text-sm text-muted-foreground">
                        {semitones === 0
                          ? "Original key"
                          : `${semitones > 0 ? "+" : ""}${semitones} semitone${Math.abs(semitones) !== 1 ? "s" : ""}`}
                      </span>
                      {isShifting && (
                        <Loader2 className="w-4 h-4 animate-spin text-primary" />
                      )}
                      <div className="ml-auto">
                        <Button
                          data-testid="button-download"
                          onClick={handleDownload}
                          disabled={isShifting}
                        >
                          <Download className="w-4 h-4 mr-2" />
                          Download MP3
                        </Button>
                      </div>
                    </div>
                  </div>
                </div>
              </Card>
            </div>
          )}

        </div>
      </div>
    </div>
  );
}
