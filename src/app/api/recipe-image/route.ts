import { NextRequest, NextResponse } from "next/server";

function escapeSvg(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function initials(value: string) {
  return value
    .split(/\s+/)
    .map((word) => word[0])
    .filter(Boolean)
    .slice(0, 2)
    .join("")
    .toUpperCase();
}

export function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const title = escapeSvg(searchParams.get("title") || "FridgeIdea");
  const ingredients = (searchParams.get("ingredients") || "")
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean)
    .slice(0, 5);
  const labels = ingredients.length ? ingredients : ["køleskab", "rester", "hurtigt"];

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 900 700" role="img" aria-label="${title}">
  <defs>
    <linearGradient id="bg" x1="0" x2="1" y1="0" y2="1">
      <stop offset="0%" stop-color="#fff8eb"/>
      <stop offset="48%" stop-color="#f4efe5"/>
      <stop offset="100%" stop-color="#d8e9dc"/>
    </linearGradient>
    <filter id="shadow" x="-20%" y="-20%" width="140%" height="140%">
      <feDropShadow dx="0" dy="18" stdDeviation="20" flood-color="#173329" flood-opacity=".18"/>
    </filter>
  </defs>
  <rect width="900" height="700" fill="url(#bg)"/>
  <circle cx="125" cy="120" r="62" fill="#f0c766" opacity=".85"/>
  <circle cx="765" cy="116" r="44" fill="#cf5d4e" opacity=".86"/>
  <circle cx="770" cy="560" r="78" fill="#255143" opacity=".12"/>
  <g filter="url(#shadow)">
    <ellipse cx="450" cy="405" rx="286" ry="150" fill="#fbfdf8"/>
    <ellipse cx="450" cy="405" rx="220" ry="108" fill="#e7f0e2"/>
    <circle cx="350" cy="370" r="70" fill="#f7d36e"/>
    <circle cx="350" cy="370" r="38" fill="#fff6ca"/>
    <circle cx="505" cy="370" r="64" fill="#d75445"/>
    <path d="M462 330c55 18 94 70 84 122-67 21-144 8-184-43-23-30 23-93 100-79Z" fill="#e9b85c"/>
    <path d="M540 454c-72 51-184 48-250-13 28-39 86-65 152-65 70 0 130 31 98 78Z" fill="#255143" opacity=".72"/>
  </g>
  <rect x="82" y="520" width="736" height="92" rx="22" fill="#ffffff" opacity=".72"/>
  <text x="450" y="568" text-anchor="middle" font-family="Inter, Arial, sans-serif" font-size="34" font-weight="800" fill="#17201c">${title}</text>
  <g font-family="Inter, Arial, sans-serif" font-size="22" font-weight="800" text-anchor="middle">
    ${labels
      .map((label, index) => {
        const x = 178 + index * 136;
        const y = index % 2 ? 190 : 165;
        return `<g><circle cx="${x}" cy="${y}" r="43" fill="#ffffff" opacity=".82"/><text x="${x}" y="${y + 8}" fill="#255143">${escapeSvg(initials(label))}</text></g>`;
      })
      .join("")}
  </g>
</svg>`;

  return new NextResponse(svg, {
    headers: {
      "Content-Type": "image/svg+xml; charset=utf-8",
      "Cache-Control": "public, max-age=604800, immutable",
    },
  });
}
