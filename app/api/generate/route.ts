import { generateText } from "ai";
import { anthropic } from "@ai-sdk/anthropic";
import { SarvamAIClient } from "sarvamai";
import { NextResponse } from "next/server";

// --- Rate limiting (in-memory, resets on redeploy) ---
const MAX_INPUT_LENGTH = 500;
const RATE_LIMIT_WINDOW_MS = 60 * 1000; // 1 minute
const MAX_REQUESTS_PER_WINDOW = 10; // 5 requests per IP per minute
const DAILY_GLOBAL_CAP = 2000; // hard stop after 2000 requests/day

const ipRequestMap = new Map<string, { count: number; resetAt: number }>();
let dailyCount = 0;
let dailyResetAt = Date.now() + 24 * 60 * 60 * 1000;

function getClientIp(request: Request): string {
  return (
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    request.headers.get("x-real-ip") ||
    "unknown"
  );
}

function checkRateLimit(ip: string): { allowed: boolean; retryAfter?: number } {
  const now = Date.now();

  // Reset daily counter
  if (now > dailyResetAt) {
    dailyCount = 0;
    dailyResetAt = now + 24 * 60 * 60 * 1000;
  }

  if (dailyCount >= DAILY_GLOBAL_CAP) {
    return { allowed: false, retryAfter: Math.ceil((dailyResetAt - now) / 1000) };
  }

  // Per-IP rate limit
  const entry = ipRequestMap.get(ip);
  if (!entry || now > entry.resetAt) {
    ipRequestMap.set(ip, { count: 1, resetAt: now + RATE_LIMIT_WINDOW_MS });
    dailyCount++;
    return { allowed: true };
  }

  if (entry.count >= MAX_REQUESTS_PER_WINDOW) {
    return { allowed: false, retryAfter: Math.ceil((entry.resetAt - now) / 1000) };
  }

  entry.count++;
  dailyCount++;
  return { allowed: true };
}

// Clean up stale IP entries every 5 minutes
setInterval(() => {
  const now = Date.now();
  for (const [ip, entry] of ipRequestMap) {
    if (now > entry.resetAt) ipRequestMap.delete(ip);
  }
}, 5 * 60 * 1000);

export async function POST(request: Request) {
  const ip = getClientIp(request);

  // Rate limit check
  const { allowed, retryAfter } = checkRateLimit(ip);
  if (!allowed) {
    const isDaily = retryAfter && retryAfter > RATE_LIMIT_WINDOW_MS / 1000;
    return NextResponse.json(
      {
        error: isDaily
          ? "Daily limit reached — this playground has hit its quota for today. Come back tomorrow!"
          : `Slow down, macha! Too many requests. Try again in ${retryAfter}s.`,
        code: "RATE_LIMITED",
        retryAfter,
      },
      { status: 429, headers: { "Retry-After": String(retryAfter) } }
    );
  }

  const { text, speaker } = await request.json();

  if (!text || typeof text !== "string" || text.trim().length === 0) {
    return NextResponse.json({ error: "Text is required" }, { status: 400 });
  }

  if (text.length > MAX_INPUT_LENGTH) {
    return NextResponse.json(
      {
        error: `Too long, bro! Keep it under ${MAX_INPUT_LENGTH} characters.`,
        code: "INPUT_TOO_LONG",
      },
      { status: 400 }
    );
  }

  if (!process.env.ANTHROPIC_API_KEY) {
    return NextResponse.json(
      { error: "ANTHROPIC_API_KEY not configured" },
      { status: 500 }
    );
  }

  if (!process.env.SARVAM_API_KEY) {
    return NextResponse.json(
      { error: "SARVAM_API_KEY not configured" },
      { status: 500 }
    );
  }

  try {
    // Step 1: Use Claude Haiku to convert text to Bangalore English
    const { text: bangaloreText } = await generateText({
      model: anthropic("claude-haiku-4-5-20251001"),
      maxOutputTokens: 300,
      system: `You are a Bangalore English dialect converter. Convert the given text into how a typical Bangalorean would say it in English. Keep it to 2 small paragraphs maximum (about 3-4 lines total). Only output the converted text, nothing else. Do not add quotes around the output.

Key rules of Bangalore English:
- Don't always start with aiyo macha, or aiyo. Switch it up a bit.
- Never end a sentence with just a verb — try to add "off": "get off", "come off", "put off", "fell off", "drowned off", "hit off"
- Use "bro" and "macha". Also use "da" freely.
- Replace "simply" with "chumma"
- You're never fighting — you're "belting" and "popping": "I'll belt you, pop you"
- Use "put 1 scene", "put 1 call" for doing things
- Use "means" as a connector mid-sentence: "when she breaks up with you means who you will come back to da?"
- Use "only" at the end for emphasis: "Full psych only", "Gone scenes only"
- Use Kannada words: "Aiyo", "Tumba", Machha (Dude, friend, buddy), Chill Maadi (Chill out)
- Use "Gone scenes only" for disasters, "Full psych only" for hype


Example conversions for reference:

Input: "Our friend Aryan has forgotten us after getting a girlfriend"
Output: Hey Aryan, what da macha? You're putting 1 scene with your girlfriend means you've forgotten your day ones. chumma, when your friends call you means no time you have, but with your girlfriend you're putting 1 call till 3 a.m. in the morning. Hey macha when she breaks up with you means who you will come back to da? you will come back to these friends only so don't put 1 psych and talk to your friends.

Input: "A massive earthquake has hit Bangalore"
Output: Machaa! 1 psych earthquake hit off Bangalore. Gone scenes only. Full building and all fell off, bro.

Input: "A terrible flood has caused a lot of problems"
Output: Gone, machaa, gone. House, dog, cow, people, everything drowned off. Full heart breaking scenes only.

Input: "India has defeated Pakistan by 6 wickets"
Output: Da India put off 1 heavy scene bro. They belted Pakistan and won the World Cup bro. Full psych only.`,
      prompt: text,
    });

    // Step 2: Send to Bulbul v3 TTS API via Sarvam SDK
    const sarvam = new SarvamAIClient({
      apiSubscriptionKey: process.env.SARVAM_API_KEY,
    });

    const ttsData = await sarvam.textToSpeech.convert({
      text: bangaloreText,
      target_language_code: "en-IN",
      model: "bulbul:v3",
      speaker: (speaker as "sunny") || "sunny",
      pace: 1.6,
      speech_sample_rate: 48000,
    });

    return NextResponse.json({
      originalText: text,
      bangaloreText,
      audioBase64: ttsData.audios[0],
    });
  } catch (error) {
    console.error("Generation error:", error);
    return NextResponse.json(
      {
        error: "Aiyo, something broke! Try again in a bit.",
        code: "SERVER_ERROR",
      },
      { status: 500 }
    );
  }
}
