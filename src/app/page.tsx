"use client";

import {
  Camera,
  ChefHat,
  ClipboardList,
  Eraser,
  ImageUp,
  Loader2,
  Mic,
  Plus,
  Send,
  Share2,
  Sparkles,
  Star,
  SwitchCamera,
  Trash2,
  X,
} from "lucide-react";
import { ChangeEvent, useEffect, useMemo, useRef, useState } from "react";

type Mode = "fridge-only" | "shopping-ok";

type FridgeAnalysis = {
  items?: string[];
  groupedItems?: Record<string, string[]>;
  notes?: string;
  confidence?: string | number;
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

const FAVORITES_KEY = "fridgeidea:favorites";

function recipeId(recipe: Recipe) {
  return `${recipe.title || ""}|${(recipe.ingredients || []).join(",")}`.toLowerCase();
}

function recipeShareText(recipe: Recipe) {
  return [
    recipe.title || "FridgeIdea-ret",
    recipe.why || "",
    recipe.ingredients?.length ? `Ingredienser: ${recipe.ingredients.join(", ")}` : "",
    recipe.steps?.length ? `Opskrift:\n${recipe.steps.map((step, index) => `${index + 1}. ${step}`).join("\n")}` : "",
  ]
    .filter(Boolean)
    .join("\n\n");
}

function readFileAsDataUrl(file: File) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

function loadImage(dataUrl: string) {
  return new Promise<HTMLImageElement>((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = reject;
    image.src = dataUrl;
  });
}

async function compressImageDataUrl(dataUrl: string, maxSize = 1100, quality = 0.72) {
  const image = await loadImage(dataUrl);
  const scale = Math.min(1, maxSize / Math.max(image.naturalWidth, image.naturalHeight));
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(image.naturalWidth * scale));
  canvas.height = Math.max(1, Math.round(image.naturalHeight * scale));
  const context = canvas.getContext("2d");
  if (!context) return dataUrl;
  context.drawImage(image, 0, 0, canvas.width, canvas.height);
  return canvas.toDataURL("image/jpeg", quality);
}

function uniqueItems(items: string[]) {
  return [...new Set(items.map((item) => item.trim()).filter(Boolean))];
}

function looksLikeUrl(value: string) {
  try {
    const url = new URL(value);
    return ["http:", "https:"].includes(url.protocol);
  } catch {
    return false;
  }
}

export default function Home() {
  const [imageDataUrl, setImageDataUrl] = useState("");
  const [items, setItems] = useState<string[]>([]);
  const [manualItem, setManualItem] = useState("");
  const [analysis, setAnalysis] = useState<FridgeAnalysis | null>(null);
  const [wishes, setWishes] = useState("");
  const [budget, setBudget] = useState("");
  const [calories, setCalories] = useState("");
  const [mode, setMode] = useState<Mode>("shopping-ok");
  const [inspirationInput, setInspirationInput] = useState("");
  const [inspirationLinks, setInspirationLinks] = useState<string[]>([]);
  const [inspirationText, setInspirationText] = useState("");
  const [recipes, setRecipes] = useState<RecipeResponse | null>(null);
  const [favorites, setFavorites] = useState<Recipe[]>(() => {
    if (typeof window === "undefined") return [];
    try {
      const stored = window.localStorage.getItem(FAVORITES_KEY);
      return stored ? (JSON.parse(stored) as Recipe[]) : [];
    } catch {
      return [];
    }
  });
  const [showFavorites, setShowFavorites] = useState(false);
  const [status, setStatus] = useState("Klar til at kigge i køleskabet");
  const [photoCount, setPhotoCount] = useState(0);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [isCooking, setIsCooking] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  const [isCameraOpen, setIsCameraOpen] = useState(false);
  const [isStartingCamera, setIsStartingCamera] = useState(false);
  const [facingMode, setFacingMode] = useState<"environment" | "user">("environment");
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const cameraStreamRef = useRef<MediaStream | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const cameraSectionRef = useRef<HTMLElement | null>(null);
  const recipesSectionRef = useRef<HTMLElement | null>(null);

  const canCreate = useMemo(
    () => items.length > 0 || wishes.trim().length > 0 || inspirationLinks.length > 0 || inspirationText.trim().length > 0,
    [items, wishes, inspirationLinks, inspirationText]
  );
  const visibleRecipes = showFavorites
    ? { summary: favorites.length ? "Dine gemte FridgeIdea-retter på denne enhed." : "Du har ikke gemt nogen retter endnu.", recipes: favorites }
    : recipes;

  useEffect(() => {
    try {
      window.localStorage.setItem(FAVORITES_KEY, JSON.stringify(favorites.slice(0, 50)));
    } catch {
      // Local storage can be unavailable in private mode.
    }
  }, [favorites]);

  function isFavorite(recipe: Recipe) {
    const id = recipeId(recipe);
    return favorites.some((favorite) => recipeId(favorite) === id);
  }

  function toggleFavorite(recipe: Recipe) {
    const id = recipeId(recipe);
    setFavorites((current) => {
      if (current.some((favorite) => recipeId(favorite) === id)) {
        setStatus("Fjernet fra favoritter");
        return current.filter((favorite) => recipeId(favorite) !== id);
      }
      setStatus("Gemt i favoritter");
      return [recipe, ...current].slice(0, 50);
    });
  }

  function toggleFavoritesView() {
    setShowFavorites((value) => {
      const next = !value;
      window.setTimeout(() => {
        recipesSectionRef.current?.scrollIntoView({ block: "start", behavior: "smooth" });
      }, 0);
      return next;
    });
  }

  async function shareRecipe(recipe: Recipe) {
    const title = recipe.title || "FridgeIdea-ret";
    const text = recipeShareText(recipe);
    try {
      if (navigator.share) {
        await navigator.share({ title, text, url: "https://fridgeidea.vercel.app" });
        setStatus("Retten er delt");
        return;
      }
      await navigator.clipboard.writeText(`${text}\n\nhttps://fridgeidea.vercel.app`);
      setStatus("Retten er kopieret til udklipsholderen");
    } catch {
      setStatus("Deling blev afbrudt");
    }
  }

  async function handleImageFile(file?: File) {
    if (!file) return;
    setStatus("Pakker billedet pænt sammen...");
    const dataUrl = await compressImageDataUrl(await readFileAsDataUrl(file));
    setImageDataUrl(dataUrl);
    setRecipes(null);
    setPhotoCount((count) => count + 1);
    cameraSectionRef.current?.scrollIntoView({ block: "start", behavior: "smooth" });
    await analyzeImage(dataUrl);
  }

  async function analyzeImage(nextImageDataUrl = imageDataUrl) {
    if (!nextImageDataUrl) {
      setStatus("Tilføj et billede først.");
      return;
    }

    setIsAnalyzing(true);
    setStatus("Finder madvarer i køleskabet...");
    try {
      const response = await fetch("/api/analyze-fridge", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        signal: AbortSignal.timeout(70000),
        body: JSON.stringify({ imageDataUrl: nextImageDataUrl, note: wishes, locale: "da-DK" }),
      });
      if (!response.ok) {
        const errorBody = (await response.json().catch(() => null)) as { error?: string } | null;
        throw new Error(errorBody?.error || "Billedanalysen fejlede.");
      }
      const data = (await response.json()) as FridgeAnalysis;
      setAnalysis(data);
      setItems((current) => uniqueItems([...current, ...(data.items || [])]));
      setStatus("Billedet er scannet. Tag gerne et billede mere af dørhylder, skuffer eller næste hylde.");
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Billedanalysen fejlede.");
    } finally {
      setIsAnalyzing(false);
    }
  }

  function addManualItem() {
    if (!manualItem.trim()) return;
    setItems((current) => uniqueItems([...current, manualItem]));
    setManualItem("");
    setRecipes(null);
  }

  function addInspiration() {
    const value = inspirationInput.trim();
    if (!value) return;
    if (looksLikeUrl(value)) {
      setInspirationLinks((current) => uniqueItems([...current, value]));
    } else {
      setInspirationText((current) => `${current}${current ? "\n" : ""}${value}`);
    }
    setInspirationInput("");
    setRecipes(null);
  }

  async function createRecipes() {
    if (!canCreate) {
      setStatus("Tilføj et billede, en madvare, et ønske eller et inspirationslink først.");
      return;
    }

    setIsCooking(true);
    setShowFavorites(false);
    setStatus("Opfinder tre retter...");
    try {
      const response = await fetch("/api/recipes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        signal: AbortSignal.timeout(70000),
        body: JSON.stringify({
          fridgeItems: items,
          wishes,
          budget,
          calories,
          mode,
          inspirationLinks,
          inspirationText,
          locale: "da-DK",
        }),
      });
      if (!response.ok) {
        const errorBody = (await response.json().catch(() => null)) as { error?: string } | null;
        throw new Error(errorBody?.error || "Kunne ikke lave opskrifter.");
      }
      const data = (await response.json()) as RecipeResponse;
      setRecipes(data);
      setStatus("Tre ideer er klar");
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Kunne ikke lave opskrifter.");
    } finally {
      setIsCooking(false);
    }
  }

  function stopCamera(updateUi = true) {
    cameraStreamRef.current?.getTracks().forEach((track) => track.stop());
    cameraStreamRef.current = null;
    if (videoRef.current) videoRef.current.srcObject = null;
    if (updateUi) {
      setIsCameraOpen(false);
      setIsStartingCamera(false);
    }
  }

  async function startCamera(nextFacingMode = facingMode) {
    if (!navigator.mediaDevices?.getUserMedia) {
      fileInputRef.current?.click();
      return;
    }

    setIsStartingCamera(true);
    setStatus("Starter kamera...");
    try {
      stopCamera(false);
      setIsCameraOpen(true);
      window.setTimeout(() => cameraSectionRef.current?.scrollIntoView({ block: "start", behavior: "smooth" }), 0);
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: false,
        video: {
          facingMode: { ideal: nextFacingMode },
          width: { ideal: 1920 },
          height: { ideal: 2560 },
          aspectRatio: { ideal: 0.75 },
        },
      });
      cameraStreamRef.current = stream;
      const [videoTrack] = stream.getVideoTracks();
      const capabilities = videoTrack?.getCapabilities?.() as MediaTrackCapabilities & { zoom?: { min?: number } };
      if (videoTrack && capabilities?.zoom?.min != null) {
        await videoTrack.applyConstraints({ advanced: [{ zoom: capabilities.zoom.min } as MediaTrackConstraintSet] }).catch(() => undefined);
      }
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
      }
      setFacingMode(nextFacingMode);
      setStatus("Kamera klar");
    } catch {
      stopCamera();
      setStatus("Kamera kunne ikke åbnes. Brug upload i stedet.");
      fileInputRef.current?.click();
    } finally {
      setIsStartingCamera(false);
    }
  }

  async function capturePhoto() {
    const video = videoRef.current;
    const canvas = canvasRef.current;
    if (!video || !canvas || !video.videoWidth || !video.videoHeight) {
      setStatus("Kameraet er ikke klar endnu.");
      return;
    }
    const scale = Math.min(1, 1100 / Math.max(video.videoWidth, video.videoHeight));
    canvas.width = Math.round(video.videoWidth * scale);
    canvas.height = Math.round(video.videoHeight * scale);
    canvas.getContext("2d")?.drawImage(video, 0, 0, canvas.width, canvas.height);
    const dataUrl = canvas.toDataURL("image/jpeg", 0.72);
    stopCamera();
    setImageDataUrl(dataUrl);
    setPhotoCount((count) => count + 1);
    cameraSectionRef.current?.scrollIntoView({ block: "start", behavior: "smooth" });
    await analyzeImage(dataUrl);
  }

  async function toggleRecording() {
    if (isRecording) {
      mediaRecorderRef.current?.stop();
      setIsRecording(false);
      setStatus("Lyd optages ikke længere");
      return;
    }

    if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === "undefined") {
      setStatus("Lydoptagelse er ikke understøttet her.");
      return;
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const recorder = new MediaRecorder(stream);
      audioChunksRef.current = [];
      mediaRecorderRef.current = recorder;
      recorder.ondataavailable = (event) => {
        if (event.data.size) audioChunksRef.current.push(event.data);
      };
      recorder.onstop = async () => {
        stream.getTracks().forEach((track) => track.stop());
        const blob = new Blob(audioChunksRef.current, { type: recorder.mimeType || "audio/webm" });
        const audioDataUrl = await readFileAsDataUrl(new File([blob], "fridgeidea.webm", { type: blob.type }));
        setStatus("Omsætter tale til tekst...");
        try {
          const response = await fetch("/api/speech-to-text", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ audioDataUrl, locale: "da-DK" }),
          });
          const data = (await response.json()) as { text?: string; transcript?: string; message?: string };
          const text = data.text || data.transcript || "";
          if (text) {
            setWishes((current) => `${current}${current ? " " : ""}${text}`.trim());
            setStatus("Tale blev tilføjet");
          } else {
            setStatus(data.message || "Der kom ikke tekst ud af lydklippet.");
          }
        } catch {
          setStatus("Talegenkendelse fejlede.");
        }
      };
      recorder.start();
      setIsRecording(true);
      setStatus("Lytter...");
    } catch {
      setIsRecording(false);
      setStatus("Mikrofonadgang blev afvist.");
    }
  }

  return (
    <main className="min-h-dvh bg-[#f7f8f4] text-[#17201c]">
      <div className="mx-auto flex min-h-dvh w-full max-w-3xl flex-col px-4 pb-8 pt-4 sm:px-6">
        <header className="flex items-center justify-between gap-3 pb-4">
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.18em] text-[#60746a]">FridgeIdea</p>
            <h1 className="text-3xl font-black leading-tight sm:text-4xl">Hvad kan vi lave?</h1>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <button
              className={`relative flex h-12 items-center justify-center gap-2 rounded-md border px-3 shadow-sm ${
                showFavorites ? "border-[#255143] bg-[#255143] text-white" : "border-[#d7ded2] bg-white text-[#255143]"
              }`}
              onClick={toggleFavoritesView}
              title="Se favoritter"
              type="button"
            >
              <Star fill={showFavorites ? "currentColor" : "none"} size={22} aria-hidden="true" />
              <span className="text-sm font-black">Favoritter</span>
              {favorites.length ? (
                <span className="absolute -right-1 -top-1 grid h-5 min-w-5 place-items-center rounded-full bg-[#cf5d4e] px-1 text-[11px] font-black text-white">
                  {favorites.length}
                </span>
              ) : null}
            </button>
            <div className="flex h-12 w-12 items-center justify-center rounded-md bg-[#255143] text-white shadow-sm">
              <ChefHat size={25} aria-hidden="true" />
            </div>
          </div>
        </header>

        <section className="overflow-hidden rounded-lg border border-[#d7ded2] bg-white shadow-sm" ref={cameraSectionRef}>
          {imageDataUrl ? (
            <div className="relative">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img alt="Dit køleskab" className="max-h-[62dvh] w-full bg-[#101815] object-contain" src={imageDataUrl} />
              <button
                className="absolute right-3 top-3 flex h-10 w-10 items-center justify-center rounded-md bg-white/95 text-[#255143] shadow-sm"
                onClick={() => {
                  setImageDataUrl("");
                  setAnalysis(null);
                  setStatus("Billede fjernet");
                }}
                title="Fjern billede"
                type="button"
              >
                <X size={18} aria-hidden="true" />
              </button>
            </div>
          ) : (
            <div className="grid min-h-52 place-items-center bg-[#e9efe6] px-5 py-10 text-center">
              <div>
                <Camera className="mx-auto text-[#255143]" size={38} aria-hidden="true" />
                <p className="mt-3 text-lg font-black">Tag flere billeder af køleskabet</p>
                <p className="mt-1 text-sm leading-6 text-[#60746a]">Start med hele køleskabet. Tag derefter nærbilleder af hylder, dør og skuffer.</p>
              </div>
            </div>
          )}

          {isCameraOpen ? (
            <div className="border-t border-[#d7ded2] bg-[#101815]">
              <video autoPlay className="h-[48dvh] min-h-[300px] w-full bg-[#101815] object-contain" muted playsInline ref={videoRef} />
              <div className="grid grid-cols-[1fr_48px_48px] gap-2 bg-white p-2">
                <button className="flex h-12 items-center justify-center gap-2 rounded-md bg-[#255143] px-3 text-sm font-black text-white" onClick={capturePhoto} type="button">
                  <Camera size={18} aria-hidden="true" />
                  Brug foto
                </button>
                <button className="flex h-12 items-center justify-center rounded-md border border-[#ccd8cf] text-[#255143]" onClick={() => startCamera(facingMode === "environment" ? "user" : "environment")} title="Skift kamera" type="button">
                  <SwitchCamera size={18} aria-hidden="true" />
                </button>
                <button className="flex h-12 items-center justify-center rounded-md border border-[#ccd8cf] text-[#255143]" onClick={() => stopCamera()} title="Luk kamera" type="button">
                  <X size={18} aria-hidden="true" />
                </button>
              </div>
            </div>
          ) : null}

          <div className="grid grid-cols-2 gap-2 border-t border-[#d7ded2] p-3">
            <button className="flex h-12 items-center justify-center gap-2 rounded-md bg-[#255143] text-sm font-black text-white disabled:opacity-60" disabled={isStartingCamera} onClick={() => startCamera()} type="button">
              <Camera size={18} aria-hidden="true" />
              Kamera
            </button>
            <button className="flex h-12 items-center justify-center gap-2 rounded-md border border-[#ccd8cf] bg-white text-sm font-black text-[#255143]" onClick={() => fileInputRef.current?.click()} type="button">
              <ImageUp size={18} aria-hidden="true" />
              Upload
            </button>
            <input accept="image/*" capture="environment" className="sr-only" ref={fileInputRef} type="file" onChange={(event: ChangeEvent<HTMLInputElement>) => void handleImageFile(event.target.files?.[0])} />
            <canvas className="hidden" ref={canvasRef} />
          </div>
          <div className="border-t border-[#d7ded2] bg-[#f6f8f3] px-4 py-3">
            <p className="text-sm font-semibold leading-6 text-[#43564d]">
              {photoCount
                ? `${photoCount} billede${photoCount === 1 ? "" : "r"} scannet. Tag gerne flere billeder, så FridgeIdea får dørhylder, grøntsagsskuffer og varer bagerst med.`
                : "Tip: Flere billeder giver bedre forslag. Tag fx et billede af hele køleskabet, et af døren og et af skufferne."}
            </p>
          </div>
        </section>

        <section className="mt-4 rounded-lg border border-[#d7ded2] bg-white p-4 shadow-sm">
          <div className="flex items-center justify-between gap-3">
            <h2 className="text-base font-black">Fundne madvarer</h2>
            <button className="flex h-9 items-center gap-2 rounded-md border border-[#ccd8cf] px-3 text-sm font-bold text-[#255143] disabled:opacity-60" disabled={isAnalyzing || !imageDataUrl} onClick={() => analyzeImage()} type="button">
              {isAnalyzing ? <Loader2 className="animate-spin" size={16} aria-hidden="true" /> : <Sparkles size={16} aria-hidden="true" />}
              Scan
            </button>
          </div>

          <div className="mt-3 flex flex-wrap gap-2">
            {items.length ? (
              items.map((item) => (
                <button className="flex h-9 items-center gap-2 rounded-md bg-[#e6f0e7] px-3 text-sm font-bold text-[#24483a]" key={item} onClick={() => setItems((current) => current.filter((next) => next !== item))} type="button">
                  {item}
                  <X size={14} aria-hidden="true" />
                </button>
              ))
            ) : (
              <p className="rounded-md bg-[#f6f8f3] p-3 text-sm leading-6 text-[#60746a]">Ingen madvarer endnu. Scan et billede eller tilføj dem manuelt.</p>
            )}
          </div>

          <div className="mt-3 grid grid-cols-[1fr_44px] gap-2">
            <input className="h-11 rounded-md border border-[#ccd8cf] bg-[#fbfcf8] px-3 text-base outline-none focus:border-[#255143] focus:ring-2 focus:ring-[#255143]/15" placeholder="Tilføj fx pasta, fløde, kylling" value={manualItem} onChange={(event) => setManualItem(event.target.value)} onKeyDown={(event) => event.key === "Enter" && addManualItem()} />
            <button className="flex h-11 items-center justify-center rounded-md bg-[#255143] text-white" onClick={addManualItem} title="Tilføj madvare" type="button">
              <Plus size={19} aria-hidden="true" />
            </button>
          </div>
          {analysis?.notes ? <p className="mt-3 text-sm leading-6 text-[#60746a]">{analysis.notes}</p> : null}
        </section>

        <section className="mt-4 rounded-lg border border-[#d7ded2] bg-white p-4 shadow-sm">
          <h2 className="text-base font-black">Ønsker, budget og inspiration</h2>
          <div className="mt-3 grid grid-cols-2 gap-2 rounded-md bg-[#eef2ea] p-1">
            <button className={`h-11 rounded-md text-sm font-black ${mode === "shopping-ok" ? "bg-white text-[#17201c] shadow-sm" : "text-[#60746a]"}`} onClick={() => setMode("shopping-ok")} type="button">
              Må købe ind
            </button>
            <button className={`h-11 rounded-md text-sm font-black ${mode === "fridge-only" ? "bg-white text-[#17201c] shadow-sm" : "text-[#60746a]"}`} onClick={() => setMode("fridge-only")} type="button">
              Kun køleskab
            </button>
          </div>
          <div className="mt-3 grid grid-cols-[1fr_48px] gap-2">
            <textarea className="min-h-28 resize-none rounded-md border border-[#ccd8cf] bg-[#fbfcf8] p-3 text-base leading-6 outline-none focus:border-[#255143] focus:ring-2 focus:ring-[#255143]/15" placeholder="Sig eller skriv fx: noget vegetarisk, børnevenligt, 30 minutter, ikke stærkt..." value={wishes} onChange={(event) => setWishes(event.target.value)} />
            <button className={`flex h-12 items-center justify-center rounded-md border ${isRecording ? "border-[#b34238] bg-[#fff0ee] text-[#b34238]" : "border-[#ccd8cf] text-[#255143]"}`} onClick={toggleRecording} title={isRecording ? "Stop optagelse" : "Tal dit ønske ind"} type="button">
              <Mic size={19} aria-hidden="true" />
            </button>
          </div>
          <div className="mt-3 grid grid-cols-2 gap-2">
            <input className="h-11 rounded-md border border-[#ccd8cf] bg-[#fbfcf8] px-3 text-base outline-none focus:border-[#255143]" placeholder="Budget, fx 75 kr." value={budget} onChange={(event) => setBudget(event.target.value)} />
            <input className="h-11 rounded-md border border-[#ccd8cf] bg-[#fbfcf8] px-3 text-base outline-none focus:border-[#255143]" placeholder="Kalorier, fx 600" value={calories} onChange={(event) => setCalories(event.target.value)} />
          </div>
          <div className="mt-3 grid grid-cols-[1fr_44px] gap-2">
            <input className="h-11 rounded-md border border-[#ccd8cf] bg-[#fbfcf8] px-3 text-base outline-none focus:border-[#255143]" placeholder="Pinterest, Instagram, TikTok eller tekst" value={inspirationInput} onChange={(event) => setInspirationInput(event.target.value)} onKeyDown={(event) => event.key === "Enter" && addInspiration()} />
            <button className="flex h-11 items-center justify-center rounded-md bg-[#255143] text-white" onClick={addInspiration} title="Tilføj inspiration" type="button">
              <Send size={17} aria-hidden="true" />
            </button>
          </div>
          {inspirationLinks.length || inspirationText ? (
            <div className="mt-3 flex flex-wrap gap-2">
              {inspirationLinks.map((link) => (
                <button className="max-w-full truncate rounded-md bg-[#eef2ea] px-3 py-2 text-left text-sm font-bold text-[#255143]" key={link} onClick={() => setInspirationLinks((current) => current.filter((item) => item !== link))} type="button">
                  {link}
                </button>
              ))}
              {inspirationText ? <span className="rounded-md bg-[#eef2ea] px-3 py-2 text-sm font-bold text-[#255143]">Tekstinspiration tilføjet</span> : null}
            </div>
          ) : null}
        </section>

        <p className="mt-3 min-h-6 text-sm font-semibold text-[#60746a]">{status}</p>

        <div className="mt-2 rounded-lg border border-[#d7ded2] bg-white p-3 shadow-sm">
          <div className="grid grid-cols-[1fr_52px] gap-2">
            <button className="flex h-13 min-h-13 items-center justify-center gap-2 rounded-md bg-[#255143] px-4 py-3 text-sm font-black text-white shadow-sm disabled:opacity-60" disabled={isCooking} onClick={createRecipes} type="button">
              {isCooking ? <Loader2 className="animate-spin" size={19} aria-hidden="true" /> : <ClipboardList size={19} aria-hidden="true" />}
              Lav 3 retter
            </button>
            <button className="flex h-13 min-h-13 items-center justify-center rounded-md border border-[#ccd8cf] text-[#255143]" onClick={() => {
              stopCamera();
              setImageDataUrl("");
              setItems([]);
              setManualItem("");
              setAnalysis(null);
              setPhotoCount(0);
              setWishes("");
              setBudget("");
              setCalories("");
              setInspirationInput("");
              setInspirationLinks([]);
              setInspirationText("");
              setRecipes(null);
              setStatus("Ryddet");
            }} title="Ryd alt" type="button">
              <Eraser size={19} aria-hidden="true" />
            </button>
          </div>
        </div>

        {visibleRecipes ? (
          <section className="mt-4 scroll-mt-4" ref={recipesSectionRef}>
            {visibleRecipes.summary ? <p className="mb-3 rounded-lg border border-[#d7ded2] bg-white p-4 text-sm font-semibold leading-6 text-[#43564d] shadow-sm">{visibleRecipes.summary}</p> : null}
            <div className="grid gap-3">
              {(visibleRecipes.recipes || []).slice(0, showFavorites ? 50 : 3).map((recipe, index) => (
                <article className="rounded-lg border border-[#d7ded2] bg-white p-4 shadow-sm" key={`${recipe.title}-${index}`}>
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="text-xs font-black uppercase tracking-[0.16em] text-[#60746a]">{showFavorites ? "Favorit" : `Ret ${index + 1}`}</p>
                      <h2 className="mt-1 text-2xl font-black leading-tight">{recipe.title || "Ny ret"}</h2>
                    </div>
                    <div className="flex shrink-0 gap-2">
                      <button
                        className={`flex h-10 w-10 items-center justify-center rounded-md border ${
                          isFavorite(recipe) ? "border-[#f0c766] bg-[#fff8dc] text-[#9b6b00]" : "border-[#ccd8cf] text-[#255143]"
                        }`}
                        onClick={() => toggleFavorite(recipe)}
                        title={isFavorite(recipe) ? "Fjern fra favoritter" : "Gem som favorit"}
                        type="button"
                      >
                        <Star fill={isFavorite(recipe) ? "currentColor" : "none"} size={17} aria-hidden="true" />
                      </button>
                      <button className="flex h-10 w-10 items-center justify-center rounded-md border border-[#ccd8cf] text-[#255143]" onClick={() => void shareRecipe(recipe)} title="Del ret" type="button">
                        <Share2 size={17} aria-hidden="true" />
                      </button>
                      {!showFavorites ? (
                        <button className="flex h-10 w-10 items-center justify-center rounded-md bg-[#fff0ee] text-[#b34238]" onClick={() => setRecipes((current) => ({ ...current, recipes: (current?.recipes || []).filter((_, recipeIndex) => recipeIndex !== index) }))} title="Fjern ret" type="button">
                          <Trash2 size={17} aria-hidden="true" />
                        </button>
                      ) : null}
                    </div>
                  </div>
                  {recipe.imageUrl ? (
                    <div className="mt-3 overflow-hidden rounded-md bg-[#101815]">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        alt={recipe.imageAlt || recipe.title || "Opskriftsbillede"}
                        className="aspect-[4/3] w-full object-cover"
                        loading="lazy"
                        referrerPolicy="no-referrer"
                        src={recipe.imageUrl}
                      />
                    </div>
                  ) : null}
                  {recipe.why ? <p className="mt-2 text-sm font-semibold leading-6 text-[#43564d]">{recipe.why}</p> : null}
                  <div className="mt-3 grid grid-cols-3 gap-2 text-center text-xs font-black text-[#255143]">
                    <span className="rounded-md bg-[#e6f0e7] px-2 py-2">{recipe.time || "hurtig"}</span>
                    <span className="rounded-md bg-[#e6f0e7] px-2 py-2">{recipe.servings ? `${recipe.servings} pers.` : "fleksibel"}</span>
                    <span className="rounded-md bg-[#e6f0e7] px-2 py-2">{recipe.calories || recipe.estimatedCost || "estimat"}</span>
                  </div>
                  {recipe.uses?.length ? <p className="mt-3 text-sm leading-6 text-[#60746a]"><span className="font-black text-[#17201c]">Bruger:</span> {recipe.uses.join(", ")}</p> : null}
                  {recipe.shoppingList?.length ? <p className="mt-1 text-sm leading-6 text-[#60746a]"><span className="font-black text-[#17201c]">Køb:</span> {recipe.shoppingList.join(", ")}</p> : null}
                  <div className="mt-4 grid gap-3 sm:grid-cols-2">
                    <div className="rounded-md bg-[#f6f8f3] p-3">
                      <h3 className="text-sm font-black">Ingredienser</h3>
                      <ul className="mt-2 space-y-1 text-sm leading-6 text-[#43564d]">
                        {(recipe.ingredients || []).map((ingredient) => <li key={ingredient}>{ingredient}</li>)}
                      </ul>
                    </div>
                    <div className="rounded-md bg-[#f6f8f3] p-3">
                      <h3 className="text-sm font-black">Opskrift</h3>
                      <ol className="mt-2 space-y-2 text-sm leading-6 text-[#43564d]">
                        {(recipe.steps || []).map((step, stepIndex) => <li key={step}>{stepIndex + 1}. {step}</li>)}
                      </ol>
                    </div>
                  </div>
                </article>
              ))}
            </div>
          </section>
        ) : null}
      </div>
    </main>
  );
}
