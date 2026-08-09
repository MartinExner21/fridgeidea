import { NextRequest, NextResponse } from "next/server";

const STT_API_URL = process.env.SKOLEGPT_STT_API_URL;
const SKOLEGPT_API_KEY = process.env.SKOLEGPT_API_KEY;

export async function POST(request: NextRequest) {
  const body = (await request.json()) as { audioDataUrl?: string; locale?: string };

  if (!body.audioDataUrl) {
    return NextResponse.json({ error: "Der mangler lyd." }, { status: 400 });
  }

  if (!STT_API_URL) {
    return NextResponse.json({
      text: "",
      message: "STT endpoint mangler. Sæt SKOLEGPT_STT_API_URL for rigtig talegenkendelse.",
    });
  }

  const response = await fetch(STT_API_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(SKOLEGPT_API_KEY ? { Authorization: `Bearer ${SKOLEGPT_API_KEY}` } : {}),
    },
    body: JSON.stringify({
      audioDataUrl: body.audioDataUrl,
      locale: body.locale || "da-DK",
    }),
  });

  if (!response.ok) {
    return NextResponse.json({ error: "STT-kaldet fejlede." }, { status: 502 });
  }

  return NextResponse.json(await response.json());
}
