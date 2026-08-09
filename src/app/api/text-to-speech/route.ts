import { NextRequest, NextResponse } from "next/server";

const TTS_API_URL = process.env.SKOLEGPT_TTS_API_URL || "https://glyph-gate.dbc.dk/v1/audio/speech";
const TTS_API_KEY = process.env.SKOLEGPT_TTS_API_KEY;
const TTS_MODEL = process.env.SKOLEGPT_TTS_MODEL || "CoRal-project/roest-v3-chatterbox-500m";

function normalizeVoice(voice?: string) {
  return voice === "mic" || voice === "nic" ? voice : "nic";
}

export async function POST(request: NextRequest) {
  const body = (await request.json()) as { text?: string; voice?: string; locale?: string };

  if (!body.text) {
    return NextResponse.json({ error: "Der mangler tekst." }, { status: 400 });
  }

  if (!TTS_API_KEY) {
    return NextResponse.json({ fallback: true });
  }

  const response = await fetch(TTS_API_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${TTS_API_KEY}`,
    },
    body: JSON.stringify({
      input: body.text,
      model: TTS_MODEL,
      voice: normalizeVoice(body.voice),
      response_format: "wav",
    }),
  });

  if (!response.ok) {
    return NextResponse.json({ fallback: true });
  }

  const audioBuffer = Buffer.from(await response.arrayBuffer());
  return NextResponse.json({
    audioDataUrl: `data:audio/wav;base64,${audioBuffer.toString("base64")}`,
  });
}
