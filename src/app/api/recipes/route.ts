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

type Recipe = {
  title?: string;
  why?: string;
  time?: string;
  servings?: number | string;
  estimatedCost?: string;
  calories?: string;
  uses?: string[];
  shoppingList?: string[];
  ingredients?: string[];
  steps?: string[];
  imageUrl?: string;
  imageAlt?: string;
  imageSource?: string;
};

type RecipeResponse = {
  summary?: string;
  recipes?: Recipe[];
};

type ImageCandidate = {
  url: string;
  source?: string;
  score: number;
};

const SKOLEGPT_API_URL = process.env.SKOLEGPT_API_URL;
const SKOLEGPT_API_KEY = process.env.SKOLEGPT_API_KEY;
const SKOLEGPT_MODEL = process.env.SKOLEGPT_MODEL || "google/gemma-4-26B-A4B-it";
const GOOGLE_SEARCH_API_KEY = process.env.GOOGLE_SEARCH_API_KEY;
const GOOGLE_CSE_ID = process.env.GOOGLE_CSE_ID;
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
        shoppingList: [],
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
        shoppingList: [],
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

function normalizeRecipeResponse(parsed: unknown): RecipeResponse {
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    return { summary: String(parsed || "").substring(0, 700), recipes: [] };
  }

  const result = parsed as { summary?: unknown; recipes?: unknown };
  if (Array.isArray(result.recipes) && result.recipes.length) return result as RecipeResponse;

  if (typeof result.summary === "string") {
    const nested = parseJson(result.summary);
    if (nested && typeof nested === "object" && !Array.isArray(nested)) {
      const nestedResult = nested as { summary?: unknown; recipes?: unknown };
      if (Array.isArray(nestedResult.recipes) && nestedResult.recipes.length) {
        return nestedResult as RecipeResponse;
      }
    }
  }

  return result as RecipeResponse;
}

function cleanGoogleImageUrl(rawUrl: string) {
  return rawUrl
    .replace(/\\u003d/g, "=")
    .replace(/\\u0026/g, "&")
    .replace(/\\\//g, "/")
    .replace(/&amp;/g, "&");
}

function scoreImageUrl(url: string, terms: string[]) {
  const lowerUrl = decodeURIComponent(url).toLowerCase();
  const termScore = terms.filter((term) => term.length > 2 && lowerUrl.includes(term.toLowerCase())).length;
  const sizeScore = /w\d{3,}|h\d{3,}|=s\d{3,}/i.test(url) ? 1 : 0;
  const formatScore = /\.(jpe?g|png|webp)(?:[?&]|$)/i.test(url) ? 1 : 0;
  return termScore * 3 + sizeScore + formatScore;
}

function makeRecipeImageQuery(recipe: Recipe) {
  const title = recipe.title || "madret";
  const ingredients = (recipe.ingredients || recipe.uses || []).slice(0, 6);
  return `${title} ${ingredients.join(" ")} opskrift madfoto`;
}

async function searchGoogleCustomImages(recipe: Recipe) {
  if (!GOOGLE_SEARCH_API_KEY || !GOOGLE_CSE_ID) return [];

  const query = makeRecipeImageQuery(recipe);
  const url = new URL("https://www.googleapis.com/customsearch/v1");
  url.searchParams.set("key", GOOGLE_SEARCH_API_KEY);
  url.searchParams.set("cx", GOOGLE_CSE_ID);
  url.searchParams.set("searchType", "image");
  url.searchParams.set("safe", "active");
  url.searchParams.set("num", "5");
  url.searchParams.set("q", query);

  try {
    const response = await fetch(url, { signal: AbortSignal.timeout(7000) });
    if (!response.ok) return [];
    const data = (await response.json()) as { items?: Array<{ link?: string; displayLink?: string }> };
    const terms = query.toLowerCase().split(/[^a-zæøå0-9]+/i).filter(Boolean);
    return (data.items || [])
      .map((item) => item.link || "")
      .filter((link) => /^https?:\/\//i.test(link))
      .map((link) => ({
        url: link,
        source: "Google Images",
        score: scoreImageUrl(link, terms),
      }))
      .slice(0, 5);
  } catch {
    return [];
  }
}

function makeFallbackFoodImage(recipe: Recipe): ImageCandidate {
  const title = encodeURIComponent(recipe.title || "Opskrift");
  return {
    url: `https://placehold.co/900x700/e6f0e7/255143?text=${title}`,
    source: "Image fallback",
    score: 0,
  };
}

async function searchWikimediaImages(recipe: Recipe) {
  const query = makeRecipeImageQuery(recipe);
  const url = new URL("https://commons.wikimedia.org/w/api.php");
  url.searchParams.set("action", "query");
  url.searchParams.set("generator", "search");
  url.searchParams.set("gsrnamespace", "6");
  url.searchParams.set("gsrlimit", "8");
  url.searchParams.set("gsrsearch", query);
  url.searchParams.set("prop", "imageinfo");
  url.searchParams.set("iiprop", "url|mime");
  url.searchParams.set("iiurlwidth", "900");
  url.searchParams.set("format", "json");
  url.searchParams.set("origin", "*");

  try {
    const response = await fetch(url, { signal: AbortSignal.timeout(7000) });
    if (!response.ok) return [];
    const data = (await response.json()) as {
      query?: { pages?: Record<string, { imageinfo?: Array<{ thumburl?: string; url?: string; mime?: string }> }> };
    };
    const terms = query.toLowerCase().split(/[^a-zæøå0-9]+/i).filter(Boolean);
    return Object.values(data.query?.pages || {})
      .flatMap((page) => page.imageinfo || [])
      .filter((info) => info.mime?.startsWith("image/"))
      .map((info) => info.thumburl || info.url || "")
      .filter((imageUrl) => /^https?:\/\//i.test(imageUrl))
      .map((imageUrl) => ({
        url: imageUrl,
        source: "Wikimedia Commons",
        score: scoreImageUrl(imageUrl, terms),
      }))
      .slice(0, 5);
  } catch {
    return [];
  }
}

async function searchGoogleImages(recipe: Recipe) {
  const customResults = await searchGoogleCustomImages(recipe);
  if (customResults.length) return customResults;

  const query = makeRecipeImageQuery(recipe);
  const url = `https://www.google.com/search?tbm=isch&hl=da&safe=active&q=${encodeURIComponent(query)}`;

  try {
    const response = await fetch(url, {
      headers: {
        "User-Agent": USER_AGENT,
        "Accept-Language": "da-DK,da;q=0.9,en;q=0.7",
      },
      signal: AbortSignal.timeout(7000),
    });
    if (!response.ok) return [];

    const html = await response.text();
    const terms = query
      .toLowerCase()
      .split(/[^a-zæøå0-9]+/i)
      .filter(Boolean);
    const found = new Map<string, ImageCandidate>();
    const patterns = [
      /"(https?:\\?\/\\?\/[^"]+?\.(?:jpg|jpeg|png|webp)(?:\?[^"]*)?)"/gi,
      /"(https?:\\?\/\\?\/encrypted-tbn\d\.gstatic\.com\/images\?[^"]+)"/gi,
      /\["(https?:\\?\/\\?\/[^"]+?)",\d{2,5},\d{2,5}\]/gi,
    ];

    for (const pattern of patterns) {
      for (const match of html.matchAll(pattern)) {
        const imageUrl = cleanGoogleImageUrl(match[1] || "");
        if (!imageUrl.startsWith("http") || imageUrl.includes("google.com/logos")) continue;
        if (!found.has(imageUrl)) {
          found.set(imageUrl, { url: imageUrl, source: "Google Images", score: scoreImageUrl(imageUrl, terms) });
        }
        if (found.size >= 12) break;
      }
      if (found.size >= 12) break;
    }

    const scraped = [...found.values()].sort((a, b) => b.score - a.score).slice(0, 5);
    if (scraped.length) return scraped;
    const wikimedia = await searchWikimediaImages(recipe);
    return wikimedia.length ? wikimedia : [makeFallbackFoodImage(recipe)];
  } catch {
    const wikimedia = await searchWikimediaImages(recipe);
    return wikimedia.length ? wikimedia : [makeFallbackFoodImage(recipe)];
  }
}

async function chooseBestImage(recipe: Recipe, candidates: ImageCandidate[]) {
  if (!candidates.length || !SKOLEGPT_API_URL) return candidates[0];

  const prompt = [
    "Du skal vælge det bedste madfoto til opskriften.",
    "Vurder de vedhæftede billedkandidater ud fra om retten og synlige ingredienser matcher titel og ingrediensliste.",
    "Returner kun JSON: {\"selectedIndex\":0,\"reason\":\"kort begrundelse\"}.",
    `Titel: ${recipe.title || ""}`,
    `Ingredienser: ${(recipe.ingredients || recipe.uses || []).join(", ")}`,
  ].join("\n");

  try {
    const response = await fetch(SKOLEGPT_API_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(SKOLEGPT_API_KEY ? { Authorization: `Bearer ${SKOLEGPT_API_KEY}` } : {}),
      },
      signal: AbortSignal.timeout(9000),
      body: JSON.stringify({
        model: process.env.SKOLEGPT_VISION_MODEL || SKOLEGPT_MODEL,
        locale: "da-DK",
        temperature: 0.1,
        max_tokens: 160,
        messages: [
          { role: "system", content: "Returner kun JSON. Ingen markdown." },
          {
            role: "user",
            content: [
              { type: "text", text: prompt },
              ...candidates.map((candidate) => ({
                type: "image_url",
                image_url: { url: candidate.url, detail: "low" },
              })),
            ],
          },
        ],
      }),
    });
    if (!response.ok) return candidates[0];

    const data = await response.json();
    const content = data?.choices?.[0]?.message?.content ?? data?.message?.content ?? data;
    const parsed = parseJson(content) as { selectedIndex?: number };
    const selectedIndex = Math.max(0, Math.min(candidates.length - 1, Number(parsed.selectedIndex) || 0));
    return candidates[selectedIndex] || candidates[0];
  } catch {
    return candidates[0];
  }
}

async function attachRecipeImages(result: RecipeResponse) {
  const recipes = Array.isArray(result.recipes) ? result.recipes.slice(0, 3) : [];
  const recipesWithImages = await Promise.all(
    recipes.map(async (recipe) => {
      const candidates = await searchGoogleImages(recipe);
      const chosen = await chooseBestImage(recipe, candidates);
      if (!chosen?.url) return recipe;
      return {
        ...recipe,
        imageUrl: chosen.url,
        imageAlt: recipe.title ? `Billede der minder om ${recipe.title}` : "Opskriftsbillede",
        imageSource: chosen.source || "Google Images",
      };
    })
  );

  return {
    ...result,
    recipes: recipesWithImages,
  };
}

function enforceFridgeOnly(result: RecipeResponse, mode: RecipeRequest["mode"]) {
  if (mode !== "fridge-only") return result;

  return {
    ...result,
    recipes: (result.recipes || []).map((recipe) => ({
      ...recipe,
      shoppingList: [],
      why: recipe.why
        ? `${recipe.why} Den er lavet til kun at bruge de fundne eller manuelt skrevne varer plus basisvarer.`
        : "Lavet til kun at bruge de fundne eller manuelt skrevne varer plus basisvarer.",
    })),
  };
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
    "Når mode er fridge-only eller brugeren har valgt Kun køleskab, må du ikke opfinde ingredienser, som ikke findes i fridgeItems eller inspirationsteksten. Ingredienser, uses og steps må kun bruge de fundne/manuelt skrevne varer plus basisvarer: vand, salt, peber, olie, smør og almindelige tørrede krydderier.",
    "Når mode er fridge-only, skal shoppingList være tom. Hvis en ret kræver noget der ikke er i fridgeItems, skal du vælge en anden ret.",
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
  const parsed = enforceFridgeOnly(normalizeRecipeResponse(parseJson(content)), body.mode || "shopping-ok");
  return NextResponse.json(await attachRecipeImages(parsed));
}
