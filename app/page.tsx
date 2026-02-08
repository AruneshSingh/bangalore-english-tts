"use client";

import * as React from "react";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import {
  RiLoader4Line,
  RiVoiceprintLine,
} from "@remixicon/react";
import { WaveformPlayer } from "@/components/waveform-player";

import posthog from 'posthog-js'

const SPEAKERS = [
  "sunny",
  "shubh",
  "ritu",
  "priya",
  "neha",
  "rahul",
  "pooja",
  "rohan",
  "simran",
  "kavya",
] as const;

export default function Page() {
  const [text, setText] = React.useState("");
  const [speaker, setSpeaker] = React.useState("sunny");
  const [loading, setLoading] = React.useState(false);
  const [result, setResult] = React.useState<{
    bangaloreText: string;
    audioBase64: string;
  } | null>(null);
  const [error, setError] = React.useState<{
    message: string;
    code?: string;
    retryAfter?: number;
  } | null>(null);
  const [isPlaying, setIsPlaying] = React.useState(false);

  async function handleGenerate() {
    if (!text.trim()) return;

    setLoading(true);
    setError(null);
    setResult(null);
    setIsPlaying(false);

    try {
      const response = await fetch("/api/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text, speaker }),
      });

      const data = await response.json();

      if (!response.ok) {
        setError({
          message: data.error || "Something went wrong",
          code: data.code,
          retryAfter: data.retryAfter,
        });
        return;
      }

      setResult(data);
      posthog.capture("tts_generated", {
        prompt: text,
        voice: speaker,
      });
    } catch {
      setError({ message: "Network error — check your connection and try again." });
    } finally {
      setLoading(false);
    }
  }

  function handlePlayPause() {
    setIsPlaying((prev) => !prev);
  }

  function handleDownload() {
    if (!result?.audioBase64) return;

    const byteCharacters = atob(result.audioBase64);
    const byteArray = new Uint8Array(byteCharacters.length);
    for (let i = 0; i < byteCharacters.length; i++) {
      byteArray[i] = byteCharacters.charCodeAt(i);
    }
    const blob = new Blob([byteArray], { type: "audio/wav" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "bangalore-english.wav";
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="bg-background flex min-h-screen items-center justify-center p-4">
      <div className="w-full max-w-lg space-y-6">
        <div className="space-y-1 text-center">
          <h1 className="text-2xl font-semibold tracking-tight">
            Bangalore English TTS
          </h1>
          <p className="text-muted-foreground text-sm">
            Type anything — get it back in Bangalore English, spoken aloud
          </p>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Enter your text</CardTitle>
            <CardDescription>
              We&apos;ll convert it to Bangalore English and generate audio
            </CardDescription>
          </CardHeader>
          <CardContent>
            <FieldGroup>
              <Field>
                <FieldLabel htmlFor="prompt">Text prompt</FieldLabel>
                <Textarea
                  id="prompt"
                  placeholder='e.g. "The traffic is really bad today and I will be late for work"'
                  value={text}
                  onChange={(e) => setText(e.target.value.slice(0, 500))}
                  rows={3}
                  maxLength={500}
                />
                <span className={`text-[11px] text-right ${text.length > 450 ? "text-destructive" : "text-muted-foreground"}`}>
                  {text.length}/500
                </span>
              </Field>
              <Field>
                <FieldLabel htmlFor="speaker">Voice</FieldLabel>
                <Select value={speaker} onValueChange={setSpeaker}>
                  <SelectTrigger id="speaker">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectGroup>
                      {SPEAKERS.map((s) => (
                        <SelectItem key={s} value={s}>
                          {s.charAt(0).toUpperCase() + s.slice(1)}
                        </SelectItem>
                      ))}
                    </SelectGroup>
                  </SelectContent>
                </Select>
              </Field>
              <Button
                onClick={handleGenerate}
                disabled={loading || !text.trim()}
                className="w-full"
              >
                {loading ? (
                  <>
                    <RiLoader4Line className="animate-spin" data-icon="inline-start" />
                    Generating...
                  </>
                ) : (
                  <>
                    <RiVoiceprintLine data-icon="inline-start" />
                    Generate
                  </>
                )}
              </Button>
            </FieldGroup>
          </CardContent>
        </Card>

        {error && (
          <Card className={error.code === "RATE_LIMITED" ? "border-yellow-500/50 bg-yellow-50/50 dark:bg-yellow-950/20" : "border-destructive/50"}>
            <CardContent className="pt-6 space-y-1">
              <p className={`text-sm font-medium ${error.code === "RATE_LIMITED" ? "text-yellow-800 dark:text-yellow-200" : "text-destructive"}`}>
                {error.message}
              </p>
              {error.retryAfter && error.retryAfter <= 60 && (
                <p className="text-muted-foreground text-xs">
                  You can try again in {error.retryAfter} seconds.
                </p>
              )}
            </CardContent>
          </Card>
        )}

        {result && (
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Bangalore English</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <p className="text-muted-foreground bg-muted rounded-lg p-3 text-sm italic">
                &ldquo;{result.bangaloreText}&rdquo;
              </p>
              <WaveformPlayer
                audioBase64={result.audioBase64}
                isPlaying={isPlaying}
                onPlayPause={handlePlayPause}
                onEnded={() => setIsPlaying(false)}
                onDownload={handleDownload}
              />
            </CardContent>
          </Card>
        )}

        <p className="text-muted-foreground text-center text-xs">
          Built with &hearts; and{" "}
          <a href="https://www.sarvam.ai" target="_blank" rel="noopener noreferrer" className="underline underline-offset-2 hover:text-foreground">
            SarvamAI
          </a>{" "}
          by{" "}
          <a href="https://arune.sh?utm_source=blr-eng-tts" target="_blank" rel="noopener noreferrer" className="underline underline-offset-2 hover:text-foreground">
            Arunesh
          </a>
        </p>
      </div>
    </div>
  );
}
