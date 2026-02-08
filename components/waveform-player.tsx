"use client";

import * as React from "react";
import { Button } from "@/components/ui/button";
import {
  RiDownloadLine,
  RiPlayLine,
  RiPauseLine,
} from "@remixicon/react";

interface WaveformPlayerProps {
  audioBase64: string;
  isPlaying: boolean;
  onPlayPause: () => void;
  onEnded: () => void;
  onDownload: () => void;
}

export function WaveformPlayer({
  audioBase64,
  isPlaying,
  onPlayPause,
  onEnded,
  onDownload,
}: WaveformPlayerProps) {
  const canvasRef = React.useRef<HTMLCanvasElement>(null);
  const audioContextRef = React.useRef<AudioContext | null>(null);
  const analyserRef = React.useRef<AnalyserNode | null>(null);
  const sourceRef = React.useRef<AudioBufferSourceNode | null>(null);
  const animationRef = React.useRef<number>(0);
  const [duration, setDuration] = React.useState(0);
  const [currentTime, setCurrentTime] = React.useState(0);
  const startTimeRef = React.useRef(0);
  const audioBufferRef = React.useRef<AudioBuffer | null>(null);

  // Decode audio buffer on mount / when base64 changes
  React.useEffect(() => {
    const ctx = new AudioContext();
    audioContextRef.current = ctx;

    const byteChars = atob(audioBase64);
    const byteArray = new Uint8Array(byteChars.length);
    for (let i = 0; i < byteChars.length; i++) {
      byteArray[i] = byteChars.charCodeAt(i);
    }

    ctx.decodeAudioData(byteArray.buffer).then((buffer) => {
      audioBufferRef.current = buffer;
      setDuration(buffer.duration);
      drawStaticWaveform(buffer);
    });

    return () => {
      cancelAnimationFrame(animationRef.current);
      ctx.close();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [audioBase64]);

  // Handle play/pause state changes
  React.useEffect(() => {
    if (isPlaying) {
      startPlayback();
    } else {
      stopPlayback();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isPlaying]);

  function drawStaticWaveform(buffer: AudioBuffer) {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const dpr = window.devicePixelRatio || 1;
    const rect = canvas.getBoundingClientRect();
    canvas.width = rect.width * dpr;
    canvas.height = rect.height * dpr;
    ctx.scale(dpr, dpr);

    const width = rect.width;
    const height = rect.height;
    const data = buffer.getChannelData(0);
    const step = Math.ceil(data.length / width);
    const barWidth = 2;
    const gap = 1.5;
    const totalBarWidth = barWidth + gap;
    const barCount = Math.floor(width / totalBarWidth);

    ctx.clearRect(0, 0, width, height);

    for (let i = 0; i < barCount; i++) {
      const start = Math.floor((i / barCount) * data.length);
      const end = Math.floor(((i + 1) / barCount) * data.length);
      let max = 0;
      for (let j = start; j < end; j++) {
        const abs = Math.abs(data[j]);
        if (abs > max) max = abs;
      }

      const barHeight = Math.max(2, max * height * 0.8);
      const x = i * totalBarWidth;
      const y = (height - barHeight) / 2;

      ctx.fillStyle = "oklch(0.708 0 0 / 0.3)";
      ctx.beginPath();
      ctx.roundRect(x, y, barWidth, barHeight, 1);
      ctx.fill();
    }
  }

  function startPlayback() {
    const ctx = audioContextRef.current;
    const buffer = audioBufferRef.current;
    if (!ctx || !buffer) return;

    if (ctx.state === "suspended") ctx.resume();

    // Create analyser
    const analyser = ctx.createAnalyser();
    analyser.fftSize = 256;
    analyserRef.current = analyser;

    // Create source
    const source = ctx.createBufferSource();
    source.buffer = buffer;
    source.connect(analyser);
    analyser.connect(ctx.destination);
    sourceRef.current = source;

    startTimeRef.current = ctx.currentTime;
    source.start(0);
    source.onended = () => {
      onEnded();
      setCurrentTime(0);
    };

    drawLiveWaveform();
  }

  function stopPlayback() {
    cancelAnimationFrame(animationRef.current);
    if (sourceRef.current) {
      try {
        sourceRef.current.stop();
      } catch {
        // already stopped
      }
      sourceRef.current = null;
    }
    // Redraw static waveform
    if (audioBufferRef.current) {
      drawStaticWaveform(audioBufferRef.current);
    }
  }

  function drawLiveWaveform() {
    const canvas = canvasRef.current;
    const analyser = analyserRef.current;
    const ctx = audioContextRef.current;
    if (!canvas || !analyser || !ctx) return;

    const canvasCtx = canvas.getContext("2d");
    if (!canvasCtx) return;

    const dpr = window.devicePixelRatio || 1;
    const rect = canvas.getBoundingClientRect();
    canvas.width = rect.width * dpr;
    canvas.height = rect.height * dpr;
    canvasCtx.scale(dpr, dpr);

    const width = rect.width;
    const height = rect.height;

    const bufferLength = analyser.frequencyBinCount;
    const dataArray = new Uint8Array(bufferLength);

    const elapsed = ctx.currentTime - startTimeRef.current;
    setCurrentTime(elapsed);

    // Get frequency data for the live bars
    analyser.getByteFrequencyData(dataArray);

    // Also draw the static waveform as background
    const buffer = audioBufferRef.current;
    const barWidth = 2;
    const gap = 1.5;
    const totalBarWidth = barWidth + gap;
    const barCount = Math.floor(width / totalBarWidth);

    canvasCtx.clearRect(0, 0, width, height);

    if (buffer) {
      const channelData = buffer.getChannelData(0);
      const progress = duration > 0 ? elapsed / duration : 0;

      for (let i = 0; i < barCount; i++) {
        const start = Math.floor((i / barCount) * channelData.length);
        const end = Math.floor(((i + 1) / barCount) * channelData.length);
        let max = 0;
        for (let j = start; j < end; j++) {
          const abs = Math.abs(channelData[j]);
          if (abs > max) max = abs;
        }

        const barHeight = Math.max(2, max * height * 0.8);
        const x = i * totalBarWidth;
        const y = (height - barHeight) / 2;

        const barProgress = i / barCount;
        if (barProgress <= progress) {
          // Played portion — use primary color
          canvasCtx.fillStyle = "oklch(0.59 0.26 323)";
        } else {
          // Unplayed portion
          canvasCtx.fillStyle = "oklch(0.708 0 0 / 0.3)";
        }

        canvasCtx.beginPath();
        canvasCtx.roundRect(x, y, barWidth, barHeight, 1);
        canvasCtx.fill();
      }

      // Draw playhead
      const playheadX = progress * width;
      canvasCtx.fillStyle = "oklch(0.59 0.26 323)";
      canvasCtx.beginPath();
      canvasCtx.roundRect(playheadX - 1, 0, 2, height, 1);
      canvasCtx.fill();
    }

    animationRef.current = requestAnimationFrame(drawLiveWaveform);
  }

  function formatTime(seconds: number) {
    const m = Math.floor(seconds / 60);
    const s = Math.floor(seconds % 60);
    return `${m}:${s.toString().padStart(2, "0")}`;
  }

  return (
    <div className="space-y-3">
      <div className="bg-muted relative overflow-hidden rounded-lg p-3">
        <canvas
          ref={canvasRef}
          className="h-16 w-full"
          style={{ display: "block" }}
        />
        <div className="text-muted-foreground mt-1 flex justify-between text-[10px] font-medium">
          <span>{formatTime(currentTime)}</span>
          <span>{formatTime(duration)}</span>
        </div>
      </div>
      <div className="flex gap-2">
        <Button onClick={onPlayPause} variant="outline" className="flex-1">
          {isPlaying ? (
            <>
              <RiPauseLine data-icon="inline-start" />
              Pause
            </>
          ) : (
            <>
              <RiPlayLine data-icon="inline-start" />
              Play
            </>
          )}
        </Button>
        <Button onClick={onDownload} variant="outline" className="flex-1">
          <RiDownloadLine data-icon="inline-start" />
          Download
        </Button>
      </div>
    </div>
  );
}
