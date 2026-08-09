import { NextRequest, NextResponse } from "next/server";

export const maxDuration = 60;

type AnalyzeRequest = {
  imageDataUrl?: string;
  note?: string;
  locale?: string;
};

const SKOLEGPT_API_URL = process.env.SKOLEGPT_API_URL;
const SKOLEGPT_API_KEY = process.env.SKOLEGPT_API_KEY;
const SKOLEGPT_MODEL = process.env.SKOLEGPT_VISION_MODEL || process.env.SKOLEGPT_MODEL || "gemma-4";

function fallbackAnalysis() {
  return {
    items: ["tomater", "æg", "ost", "yoghurt", "salat", "gulerødder"],
    notes: "Demoanalyse. Tilføj SKOLEGPT_API_URL og SKOLEGPT_API_KEY i Vercel for rigtig billedanalyse.",
    confidence: "demo",
  };
}

function parseJson(content: unknown) {
  if (!content) return fallbackAnalysis();
  if (typeof content !== "string") return content;

  const cleaned = content
    .trim()
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```$/i, "")
    .trim();

  try {
    return JSON.parse(cleaned);
  } catch {
    const match = cleaned.match(/\{[\s\S]*\}/);
    if (match) return JSON.parse(match[0]);
  }

  return {
    items: cleaned
      .split(/,|\n|-/)
      .map((item) => item.trim())
      .filter(Boolean)
      .slice(0, 30),
    notes: cleaned.substring(0, 500),
    confidence: "lav",
  };
}

export async function POST(request: NextRequest) {
  const body = (await request.json()) as AnalyzeRequest;

  if (!body.imageDataUrl) {
    return NextResponse.json({ error: "Der mangler et billede af køleskabet." }, { status: 400 });
  }

  if (!SKOLEGPT_API_URL) {
    return NextResponse.json(fallbackAnalysis());
  }

  const prompt = [
    "Du er FridgeIdea, en dansk madassistent.",
    "Analyser billedet af et køleskab og identificer alle synlige madvarer.",
    "Medtag kun madvarer, drikkevarer, rester, saucer og basisvarer der plausibelt kan ses.",
    "Skriv på dansk. Returner kun valid JSON med felterne items, groupedItems, notes og confidence.",
    "items skal være en kort array-liste med ingrediensnavne.",
    body.note ? `Brugernote: ${body.note}` : "",
  ]
    .filter(Boolean)
    .join("\n");

  const response = await fetch(SKOLEGPT_API_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(SKOLEGPT_API_KEY ? { Authorization: `Bearer ${SKOLEGPT_API_KEY}` } : {}),
    },
    signal: AbortSignal.timeout(58000),
    body: JSON.stringify({
      model: SKOLEGPT_MODEL,
      locale: body.locale || "da-DK",
      temperature: 0.1,
      max_tokens: 900,
      messages: [
        { role: "system", content: "Returner kun JSON. Ingen markdown." },
        {
          role: "user",
          content: [
            { type: "text", text: prompt },
            { type: "image_url", image_url: { url: body.imageDataUrl, detail: "high" } },
          ],
        },
      ],
    }),
  });

  if (!response.ok) {
    return NextResponse.json({ error: "SkoleGPT kunne ikke analysere billedet." }, { status: 502 });
  }

  const data = await response.json();
  const content = data?.choices?.[0]?.message?.content ?? data?.message?.content ?? data;
  return NextResponse.json(parseJson(content));
}
