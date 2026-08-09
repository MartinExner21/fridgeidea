import { NextRequest, NextResponse } from "next/server";

export const maxDuration = 60;

type RecipeRequest = {
  fridgeItems?: string[];
  wishes?: string;
  budget?: string;
  calories?: string;
  mode?: "fridge-only" | "shopping-ok";
  inspirationLinks?: string[];
  inspirationText?: string;
  locale?: string;
};

const SKOLEGPT_API_URL = process.env.SKOLEGPT_API_URL;
const SKOLEGPT_API_KEY = process.env.SKOLEGPT_API_KEY;
const SKOLEGPT_MODEL = process.env.SKOLEGPT_MODEL || "google/gemma-4-26B-A4B-it";
const USER_AGENT =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126 Safari/537.36";

function demoRecipes() {
  return {
    summary: "Demo: tre ideer ud fra typiske køleskabsvarer. SkoleGPT env vars giver rigtige forslag.",
    recipes: [
      {
        title: "Grøn køleskabsomelet",
        why: "Bruger æg, ost og grønt hurtigt og uden ekstra indkøb.",
        time: "18 min",
        servings: 2,
        estimatedCost: "0-25 kr.",
        calories: "ca. 430 kcal pr. portion",
        uses: ["æg", "ost", "tomater", "salat"],
        shoppingList: [],
        ingredients: ["4 æg", "1 håndfuld ost", "tomater", "grønt fra skuffen", "salt og peber"],
        steps: ["Pisk æggene.", "Steg grønt kort.", "Hæld æg over og top med ost.", "Server med frisk salat."],
      },
      {
        title: "Cremet yoghurtdressing-bowl",
        why: "God når du vil have noget let og friskt.",
        time: "15 min",
        servings: 2,
        estimatedCost: "0-35 kr.",
        calories: "ca. 380 kcal pr. portion",
        uses: ["yoghurt", "gulerødder", "salat", "tomater"],
        shoppingList: ["evt. brød eller ris"],
        ingredients: ["salat", "tomater", "revet gulerod", "yoghurt", "citron/eddike", "krydderier"],
        steps: ["Rør dressing.", "Snit grønt.", "Vend det hele sammen.", "Top med rester eller brød ved siden af."],
      },
      {
        title: "Tomat-ost toast med sprød salat",
        why: "Billig comfort food med få ingredienser.",
        time: "12 min",
        servings: 1,
        estimatedCost: "0-20 kr.",
        calories: "ca. 520 kcal",
        uses: ["tomater", "ost", "salat"],
        shoppingList: ["brød hvis du mangler"],
        ingredients: ["brød", "ost", "tomater", "salat", "sennep eller dressing"],
        steps: ["Byg toasten.", "Steg eller rist til osten smelter.", "Server med salat og tomat."],
      },
    ],
  };
}

async function fetchExcerpt(url: string) {
  try {
    const parsed = new URL(url);
    if (!["http:", "https:"].includes(parsed.protocol)) return "";
    const response = await fetch(parsed.href, {
      headers: { "User-Agent": USER_AGENT, "Accept-Language": "da-DK,da;q=0.9,en;q=0.7" },
      signal: AbortSignal.timeout(6000),
    });
    if (!response.ok) return "";
    const contentType = response.headers.get("content-type") || "";
    if (!contentType.includes("text/html") && !contentType.includes("text/plain")) return "";
    const html = await response.text();
    return html
      .replace(/<script[\s\S]*?<\/script>/gi, " ")
      .replace(/<style[\s\S]*?<\/style>/gi, " ")
      .replace(/<[^>]+>/g, " ")
      .replace(/\s+/g, " ")
      .trim()
      .substring(0, 1200);
  } catch {
    return "";
  }
}

function parseJson(content: unknown) {
  if (!content) return demoRecipes();
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
  return { summary: cleaned.substring(0, 700), recipes: [] };
}

function normalizeRecipeResponse(parsed: unknown) {
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return parsed;

  const result = parsed as { summary?: unknown; recipes?: unknown };
  if (Array.isArray(result.recipes) && result.recipes.length) return result;

  if (typeof result.summary === "string") {
    const nested = parseJson(result.summary);
    if (nested && typeof nested === "object" && !Array.isArray(nested)) {
      const nestedResult = nested as { summary?: unknown; recipes?: unknown };
      if (Array.isArray(nestedResult.recipes) && nestedResult.recipes.length) {
        return nestedResult;
      }
    }
  }

  return result;
}

export async function POST(request: NextRequest) {
  const body = (await request.json()) as RecipeRequest;
  const fridgeItems = (body.fridgeItems || []).map((item) => item.trim()).filter(Boolean);

  if (!fridgeItems.length && !body.wishes?.trim() && !body.inspirationText?.trim()) {
    return NextResponse.json({ error: "Tilføj madvarer, ønsker eller inspiration først." }, { status: 400 });
  }

  if (!SKOLEGPT_API_URL) {
    return NextResponse.json(demoRecipes());
  }

  const linkExcerpts = await Promise.all((body.inspirationLinks || []).slice(0, 5).map(fetchExcerpt));
  const system = [
    "Du er FridgeIdea, en dansk kokkeassistent til mobilbrug.",
    "Du skal opfinde præcis 3 madretter, der bedst muligt matcher køleskab, ønsker, budget, kalorier og inspirationslinks.",
    "Hvis brugeren vælger fridge-only, må shoppingList være tom eller kun basisvarer som salt, peber, olie og vand.",
    "Hvis indkøb er tilladt, må du foreslå få, billige tilkøb.",
    "Gør opskrifterne konkrete, realistiske og lette at følge.",
    "Returner selve JSON-objektet direkte. Læg aldrig JSON som tekst inde i summary eller andre felter.",
    "Returner kun valid JSON med summary og recipes. recipes skal altid indeholde præcis 3 opskrifter.",
  ].join(" ");

  const user = {
    fridgeItems,
    wishes: body.wishes || "",
    budget: body.budget || "",
    calories: body.calories || "",
    mode: body.mode || "shopping-ok",
    inspirationLinks: body.inspirationLinks || [],
    inspirationText: body.inspirationText || "",
    linkExcerpts: linkExcerpts.filter(Boolean),
    outputShape:
      "recipes: array med title, why, time, servings, estimatedCost, calories, uses, shoppingList, ingredients og steps.",
  };

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
      temperature: 0.7,
      max_tokens: 3500,
      messages: [
        { role: "system", content: system },
        { role: "user", content: JSON.stringify(user) },
      ],
    }),
  });

  if (!response.ok) {
    const detail = await response.text().catch(() => "");
    console.error("SkoleGPT recipe generation failed", {
      status: response.status,
      statusText: response.statusText,
      detail: detail.substring(0, 500),
    });
    return NextResponse.json({ error: "SkoleGPT kunne ikke lave opskrifter lige nu." }, { status: 502 });
  }

  const data = await response.json();
  const content = data?.choices?.[0]?.message?.content ?? data?.message?.content ?? data;
  return NextResponse.json(normalizeRecipeResponse(parseJson(content)));
}
