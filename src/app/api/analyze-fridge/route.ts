import { NextRequest, NextResponse } from "next/server";

export const maxDuration = 60;

type AnalyzeRequest = {
  imageDataUrl?: string;
  note?: string;
  locale?: string;
};

type FridgeAnalysis = {
  items?: string[];
  groupedItems?: Record<string, string[]>;
  likelyItems?: string[];
  possibleItems?: string[];
  notes?: string;
  confidence?: string | number;
};

const SKOLEGPT_API_URL = process.env.SKOLEGPT_API_URL;
const SKOLEGPT_API_KEY = process.env.SKOLEGPT_API_KEY;
const SKOLEGPT_MODEL =
  process.env.SKOLEGPT_VISION_MODEL || process.env.SKOLEGPT_MODEL || "google/gemma-4-26B-A4B-it";

function fallbackAnalysis() {
  return {
    items: ["tomater", "æg", "ost", "yoghurt", "salat", "gulerødder"],
    notes: "Demoanalyse. Tilføj SKOLEGPT_API_URL og SKOLEGPT_API_KEY i Vercel for rigtig billedanalyse.",
    confidence: "demo",
  };
}

function parseJson(content: unknown) {
  if (!content) return fallbackAnalysis();
  if (typeof content !== "string") return normalizeAnalysis(content);

  const cleaned = content
    .trim()
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```$/i, "")
    .trim();

  try {
    return normalizeAnalysis(JSON.parse(cleaned));
  } catch {
    const match = cleaned.match(/\{[\s\S]*\}/);
    if (match) return normalizeAnalysis(JSON.parse(match[0]));
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

function normalizeAnalysis(parsed: unknown) {
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return parsed;

  const result = parsed as FridgeAnalysis & { likelyItems?: string[]; possibleItems?: string[] };
  const grouped = result.groupedItems && typeof result.groupedItems === "object" ? result.groupedItems : {};
  const groupedItems = Object.values(grouped).flatMap((group) => (Array.isArray(group) ? group : []));
  const items = [
    ...(Array.isArray(result.items) ? result.items : []),
    ...(Array.isArray(result.likelyItems) ? result.likelyItems : []),
    ...(Array.isArray(result.possibleItems) ? result.possibleItems : []),
    ...groupedItems,
  ]
    .map((item) => String(item || "").trim().toLowerCase())
    .filter(Boolean);

  return {
    ...result,
    items: [...new Set(items)].slice(0, 90),
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
    "Analyser billedet som en grundig køleskabs-inventarliste. Identificer så mange madvarer som muligt, også når der er mange varer, rod, emballage, glas, bøtter, poser og delvist skjulte ting.",
    "Gennemgå billedet systematisk fra øverste venstre hjørne til nederste højre: hylder, dørhylder, skuffer, bageste række, forreste række, flasker, glas, beholdere, rester, saucer, grønt, mejeri, kød/fisk, drikkevarer og basisvarer.",
    "Hvis du ikke er helt sikker, må du gerne gætte kvalificeret ud fra form, farve, emballage, låg, placering og typiske køleskabsvarer. Hellere medtage plausible madvarer end at overse dem.",
    "Brug generiske ingrediensnavne når brandet ikke er vigtigt: fx mælk, yoghurt, ost, smør, æg, leverpostej, marmelade, ketchup, sennep, salat, agurk, tomat, gulerødder, rester i bøtte.",
    "Undgå dubletter, men behold forskellige varianter hvis de kan være forskellige, fx ost og flødeost.",
    "items skal være en omfattende array-liste med op til 90 korte ingrediensnavne. Medtag også sandsynlige gæt.",
    "groupedItems skal gruppere alle fundne varer efter kategori.",
    "notes skal kort nævne hvis billedet er uklart, og foreslå hvilke områder brugeren bør fotografere igen.",
    "Skriv på dansk. Returner kun valid JSON med felterne items, groupedItems, notes og confidence.",
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
      temperature: 0.35,
      max_tokens: 1800,
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
    const detail = await response.text().catch(() => "");
    console.error("SkoleGPT image analysis failed", {
      status: response.status,
      statusText: response.statusText,
      detail: detail.substring(0, 500),
    });
    return NextResponse.json({ error: "SkoleGPT kunne ikke analysere billedet." }, { status: 502 });
  }

  const data = await response.json();
  const content = data?.choices?.[0]?.message?.content ?? data?.message?.content ?? data;
  return NextResponse.json(parseJson(content));
}
