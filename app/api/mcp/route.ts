import { createMcpHandler } from "mcp-handler";
import { z } from "zod";
import type { GeoCandidate, OpenMeteoGeocodingResponse, OpenMeteoForecastResponse } from "./types";
import { APIError } from "./types";
import { geocodeCache, forecastCache, generateGeocodeKey, generateForecastKey } from "./cache";
import { ICON_PNG_BASE64 } from "./iconData";
import { searchGeoNamesJpCandidates } from "./geonamesJp";

const CONFIG = {
  GEOCODING_API_URL: process.env.NEXT_PUBLIC_GEOCODING_API_URL ?? "https://geocoding-api.open-meteo.com/v1/search",
  FORECAST_API_URL: process.env.NEXT_PUBLIC_FORECAST_API_URL ?? "https://api.open-meteo.com/v1/forecast",
} as const;

const ASSET_BASE_URL_RAW =
  process.env.NEXT_PUBLIC_APP_URL ??
  process.env.APP_URL ??
  (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : "");
const ASSET_BASE_URL = ASSET_BASE_URL_RAW.replace(/\/+$/, "");
const WIDGET_RESOURCE_DOMAINS = ASSET_BASE_URL ? [ASSET_BASE_URL] : [];
const WIDGET_TEMPLATE_URI = "ui://widget/weather-v17.html";

const WMO_JA: Record<number, string> = {
  0: "快晴", 1: "ほぼ快晴", 2: "晴れ時々くもり", 3: "くもり", 45: "霧", 48: "着氷性の霧",
  51: "弱い霧雨", 53: "霧雨", 55: "強い霧雨", 61: "弱い雨", 63: "雨", 65: "強い雨",
  56: "着氷性の霧雨（弱）", 57: "着氷性の霧雨（強）",
  66: "着氷性の雨（弱）", 67: "着氷性の雨（強）",
  71: "弱い雪", 73: "雪", 75: "強い雪", 77: "雪粒",
  80: "にわか雨（弱）", 81: "にわか雨", 82: "にわか雨（強）",
  85: "にわか雪（弱）", 86: "にわか雪（強）",
  95: "雷雨", 96: "雷雨+ひょう（弱）", 99: "雷雨+ひょう（強）",
};

function wmoToJa(code: number | null | undefined) {
  if (code === null || code === undefined) return "不明";
  return WMO_JA[code] ?? `不明（code=${code}）`;
}

const WMO_ICON_FILES: Record<number, { day: string; night?: string }> = {
  0: { day: "sunny.png", night: "sunny_night.png" },
  1: { day: "cloudy1.png", night: "cloudy1_night.png" },
  2: { day: "cloudy2.png", night: "cloudy2_night.png" },
  3: { day: "overcast.png" },

  45: { day: "fog.png", night: "fog_night.png" },
  48: { day: "fog.png", night: "fog_night.png" },

  51: { day: "light_rain.png" }, // 霧雨（弱）
  53: { day: "light_rain.png" }, // 霧雨
  55: { day: "shower1.png", night: "shower1_night.png" }, // 霧雨（強）
  56: { day: "sleet.png" }, // 着氷性の霧雨（弱）
  57: { day: "sleet.png" }, // 着氷性の霧雨（強）

  61: { day: "shower1.png", night: "shower1_night.png" }, // 雨（弱）
  63: { day: "shower2.png", night: "shower2_night.png" }, // 雨
  65: { day: "shower3.png" }, // 雨（強）
  66: { day: "sleet.png" }, // 着氷性の雨（弱）
  67: { day: "sleet.png" }, // 着氷性の雨（強）

  71: { day: "snow1.png", night: "snow1_night.png" }, // 雪（弱）
  73: { day: "snow3.png", night: "snow3_night.png" }, // 雪
  75: { day: "snow5.png" }, // 雪（強）
  77: { day: "snow2.png", night: "snow2_night.png" }, // 霰/雪粒

  80: { day: "shower1.png", night: "shower1_night.png" }, // にわか雨（弱）
  81: { day: "shower2.png", night: "shower2_night.png" }, // にわか雨
  82: { day: "shower3.png" }, // にわか雨（強）

  85: { day: "snow2.png", night: "snow2_night.png" }, // にわか雪（弱）
  86: { day: "snow4.png" }, // にわか雪（強）

  95: { day: "tstorm1.png", night: "tstorm1_night.png" },
  96: { day: "tstorm2.png", night: "tstorm2_night.png" }, // 雷雨 + ひょう（弱）
  99: { day: "tstorm3.png" }, // 雷雨 + ひょう（強）
};

const DEFAULT_ICON_FILE = { day: "dunno.png", night: "dunno.png" } as const;

function wmoToIconFile(code: number | null | undefined) {
  if (code === null || code === undefined) return DEFAULT_ICON_FILE;
  return WMO_ICON_FILES[code] ?? DEFAULT_ICON_FILE;
}

function wmoToIconUrl(code: number | null | undefined, isNight: boolean) {
  const files = wmoToIconFile(code);
  const file = isNight ? (files.night ?? files.day) : files.day;
  const path = `/weather_icon/${file}`;
  return ASSET_BASE_URL ? `${ASSET_BASE_URL}${path}` : path;
}

function wmoToIcon(code: number | null | undefined) {
  if (code === null || code === undefined) return "❓";
  if (code === 0) return "☀️";
  if (code === 1) return "🌤️";
  if (code === 2) return "⛅";
  if (code === 3) return "☁️";
  if (code === 45 || code === 48) return "🌫️";
  if (code >= 51 && code <= 55) return "🌦️"; // 霧雨
  if (code >= 61 && code <= 65) return "☔"; // 雨
  if (code >= 71 && code <= 75) return "☃️";
  if (code >= 80 && code <= 82) return "🌧️"; // にわか雨
  if (code >= 95) return "⛈️";
  return "☁️";
}

async function geocodeCandidates(place: string, count: number): Promise<GeoCandidate[]> {
  const cacheKey = generateGeocodeKey(place, count);
  const cached = geocodeCache.get(cacheKey);
  if (cached) return cached;

  // 1) ローカルGeoNames(JP/JP.txt)で部分一致検索
  try {
    const local = await searchGeoNamesJpCandidates(place, count);
    if (local.length > 0) {
      geocodeCache.set(cacheKey, local);
      return local;
    }
  } catch {
    // ローカルが読めない/壊れてても、リモートにフォールバック
  }

  const fetchOpenMeteo = async (language: "ja" | "en") => {
    const url = new URL(CONFIG.GEOCODING_API_URL);
    url.searchParams.set("name", place);
    url.searchParams.set("count", String(count));
    url.searchParams.set("language", language);
    url.searchParams.set("format", "json");
    const r = await fetch(url.toString());
    if (!r.ok) throw new APIError("GEO_ERR", `HTTP ${r.status}`);
    const data: OpenMeteoGeocodingResponse = await r.json();
    const results = data?.results ?? [];
    return results.map((hit: any) => ({
      name: hit.name,
      country: hit.country,
      country_code: hit.country_code,
      admin1: hit.admin1,
      latitude: hit.latitude,
      longitude: hit.longitude,
      timezone: hit.timezone,
    })) as GeoCandidate[];
  };

  // 2) Open-Meteo 日本語 → 3) 見つからなければ英語でもう1回（翻訳はしない）
  const ja = await fetchOpenMeteo("ja");
  if (ja.length > 0) {
    geocodeCache.set(cacheKey, ja);
    return ja;
  }
  const en = await fetchOpenMeteo("en");
  geocodeCache.set(cacheKey, en);
  return en;
}

async function forecastByCoords(lat: number, lon: number, days: number): Promise<OpenMeteoForecastResponse> {
  const cacheKey = generateForecastKey(lat, lon, days, "Asia/Tokyo");
  const cached = forecastCache.get(cacheKey);
  if (cached) return cached;
  const url = new URL(CONFIG.FORECAST_API_URL);
  url.searchParams.set("latitude", String(lat));
  url.searchParams.set("longitude", String(lon));
  url.searchParams.set("timezone", "Asia/Tokyo");
  url.searchParams.set("current_weather", "true");
  url.searchParams.set("forecast_days", String(days));
  url.searchParams.set("daily", ["weathercode", "temperature_2m_max", "temperature_2m_min", "precipitation_probability_max", "precipitation_sum", "rain_sum", "snowfall_sum", "windspeed_10m_max"].join(","));
  url.searchParams.set("hourly", ["temperature_2m", "weathercode", "precipitation_probability", "relativehumidity_2m", "pressure_msl"].join(","));
  const r = await fetch(url.toString());
  if (!r.ok) throw new APIError("FC_ERR", `HTTP ${r.status}`);
  const data: OpenMeteoForecastResponse = await r.json();
  forecastCache.set(cacheKey, data);
  return data;
}

function widgetHtml() {
  return `
<style>
  :root { color-scheme: light dark; }
  body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif; margin: 0; padding: 12px; }
  .container { border: 1px solid rgba(0,0,0,.1); border-radius: 16px; padding: 16px; background: rgba(255,255,255,0.05); box-shadow: 0 4px 12px rgba(0,0,0,0.05); }
  .btn { padding: 8px 14px; border-radius: 10px; border: 1px solid rgba(0,0,0,.15); background: #fff; color: #000; cursor: pointer; font-size: 14px; font-weight: 500; }
  .card { flex: 0 0 100px; padding: 12px; border: 1px solid rgba(0,0,0,.08); border-radius: 14px; text-align: center; background: rgba(255,255,255,0.3); transition: transform 0.2s; cursor: pointer; }
	  .card.active { border-color: #ff922b; background: rgba(255,146,43,0.1); }
	  .card:active { transform: scale(0.95); }
	  .chart-wrapper { margin: 25px 0 15px 0; background: rgba(0,0,0,0.02); border-radius: 12px; padding: 40px 10px 25px 10px; position: relative; }
	  .chart-y-axis { position: absolute; left: 8px; top: 40px; bottom: 65px; width: 32px; display: flex; flex-direction: column; justify-content: space-between; font-size: 8px; color: #666; text-align: right; padding-right: 6px; border-right: 1px solid rgba(0,0,0,0.15); pointer-events: none; }
	  .chart-y-axis.right { left: auto; right: 8px; text-align: left; padding-left: 6px; padding-right: 0; border-right: 0; border-left: 1px solid rgba(0,0,0,0.15); }
	  .chart-area { margin-left: 40px; margin-right: 10px; height: 320px; position: relative; }
	  .chart-area svg { pointer-events: none; }
	  .chart-x-axis { margin-left: 40px; margin-right: 10px; display: grid; grid-template-columns: repeat(7, 1fr); margin-top: 15px; font-size: 8px; color: #666; }
	  .detail-panel { margin-top: 12px; padding: 14px; border-radius: 12px; background: rgba(0,0,0,0.04); font-size: 13px; line-height: 1.6; display: none; }

	  .chart-header {
	    position: absolute;
	    left: 12px;
	    right: 12px;
	    top: 10px;
	    display: flex;
	    justify-content: space-between;
	    align-items: center;
	    gap: 10px;
	    pointer-events: none;
	  }
	  .chart-title {
	    font-size: 12px;
	    font-weight: 800;
	    opacity: 0.8;
	    white-space: nowrap;
	    overflow: hidden;
	    text-overflow: ellipsis;
	  }
	  .chart-legend {
	    display: flex;
	    gap: 10px;
	    font-size: 11px;
	    font-weight: 800;
	    opacity: 0.85;
	    white-space: nowrap;
	  }
	  .chart-legend-item { display:flex; align-items:center; gap:6px; }
	  .dot { width: 10px; height: 10px; border-radius: 999px; display:inline-block; }
	  .dot.temp { background:#ff922b; }
	  .dot.hum { background:#1c7ed6; border: 2px dashed rgba(28,126,214,0.6); box-sizing: border-box; }

	  .chart-overlay {
	    position: absolute;
	    inset: 0;
	    pointer-events: auto;
	    touch-action: none;
	  }
	  .chart-tooltip {
	    position: absolute;
	    z-index: 2;
	    background: rgba(255,255,255,0.92);
	    color: #111;
	    border: 1px solid rgba(0,0,0,0.12);
	    border-radius: 10px;
	    padding: 6px 8px;
	    font-size: 11px;
	    font-weight: 800;
	    box-shadow: 0 6px 16px rgba(0,0,0,0.08);
	    pointer-events: none;
	    white-space: nowrap;
	    display: none;
	  }
	  @media (prefers-color-scheme: dark) {
	    .chart-tooltip {
	      background: rgba(0,0,0,0.72);
	      color: #fff;
	      border-color: rgba(255,255,255,0.14);
	    }
	  }

	  @media (prefers-color-scheme: dark) {
	    body { color: #eee; }
	    .container { border-color: rgba(255,255,255,0.1); background: rgba(0,0,0,0.2); }
	    .btn { background: #444; color: #fff; border-color: rgba(255,255,255,0.1); }
	    .card { background: rgba(255,255,255,0.05); border-color: rgba(255,255,255,0.1); }
	    .chart-wrapper { background: rgba(255,255,255,0.03); }
	    .chart-y-axis { border-color: rgba(255,255,255,0.2); color: #999; }
	    .chart-y-axis.right { border-left-color: rgba(255,255,255,0.2); border-right-color: transparent; }
	    .chart-x-axis { color: #999; }
	    .detail-panel { background: rgba(255,255,255,0.1); }
	    .hourly-temp { color: #fff; }
	    .hourly-prob { color: #74c0fc; }
	  }

		  .candidate-list {
		    --cand-gap: 10px;
		    display: flex;
		    flex-wrap: wrap;
		    gap: var(--cand-gap);
		    padding: 4px 0 8px;
		  }

		  .candidate-card {
		    flex: 0 0 calc((100% - (4 * var(--cand-gap))) / 5);
		    max-width: 126px;
		    padding: 12px;
		    border-radius: 14px;
		    border: 1px solid rgba(0,0,0,0.08);
		    background: rgba(255,255,255,0.3);
		    cursor: pointer;
		    transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1);
		    display: flex;
		    flex-direction: column;
		    align-items: center;
		    text-align: center;
		    gap: 2px;
		    box-shadow: 0 2px 4px rgba(0,0,0,0.02);
		    min-height: 0;
		    aspect-ratio: 126 / 115;
		  }
	  .candidate-card:hover {
	    transform: translateY(-2px);
	    border-color: #ff922b;
	    background: rgba(255,146,43,0.05);
	    box-shadow: 0 6px 16px rgba(255,146,43,0.1);
	  }
	  .candidate-card:active {
	    transform: scale(0.98);
	  }
		  .candidate-flag {
		    font-size: 20px;
		    line-height: 1;
		    margin-top: 2px;
		  }
		  .candidate-region {
		    font-size: 10px;
		    opacity: 0.6;
		    font-weight: 500;
		    line-height: 1.15;
		    white-space: nowrap;
		    overflow: hidden;
		    text-overflow: ellipsis;
		    width: 100%;
		  }
		  .candidate-name {
		    font-size: 13px;
		    font-weight: 700;
		    color: #333;
		    line-height: 1.15;
		    white-space: nowrap;
		    overflow: hidden;
		    text-overflow: ellipsis;
		    width: 100%;
		  }
		  .candidate-latlon {
		    font-size: 9px;
		    opacity: 0.6;
		    font-weight: 500;
		    line-height: 1.15;
		    white-space: nowrap;
		    overflow: hidden;
		    text-overflow: ellipsis;
		    width: 100%;
		  }
		  @media (max-width: 900px) {
		    .candidate-card { flex-basis: calc((100% - (3 * var(--cand-gap))) / 4); }
		  }
		  @media (max-width: 720px) {
		    .candidate-card { flex-basis: calc((100% - (2 * var(--cand-gap))) / 3); }
		  }
		  @media (max-width: 520px) {
		    .candidate-card { flex-basis: calc((100% - (1 * var(--cand-gap))) / 2); }
		  }
		  @media (prefers-color-scheme: dark) {
		    .candidate-card { background: rgba(255,255,255,0.05); border-color: rgba(255,255,255,0.1); }
		    .candidate-name { color: #eee; }
		  }
</style>

<div class="container">
  <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:12px;">
    <div>
      <div style="font-size:13px; opacity:0.6; margin-bottom:2px;">気温推移 (-20°C 〜 45°C)</div>
      <div id="headline" style="font-size:20px; font-weight:700;">読み込み中...</div>
    </div>
    <button id="refresh" class="btn">更新</button>
  </div>
  <div id="panel">
    <div id="main"></div>
    <div id="detail" class="detail-panel"></div>
  </div>
</div>

<script type="module">
  const headline = document.getElementById("headline");
  const panel = document.getElementById("panel");
  const main = document.getElementById("main");
  const detail = document.getElementById("detail");
  const btn = document.getElementById("refresh");

  let activeDate = null;
  let lastValidInput = null;
  let currentViewData = null;

  const ASSET_BASE_URL = ${JSON.stringify(ASSET_BASE_URL)};
  const ICON_PNG_BASE64 = ${JSON.stringify(ICON_PNG_BASE64)};
  const WMO_JA = ${JSON.stringify(WMO_JA)};
  const WMO_ICON_FILES = ${JSON.stringify(WMO_ICON_FILES)};
  const DEFAULT_ICON_FILE = ${JSON.stringify(DEFAULT_ICON_FILE)};

	  function wmoToJa(code) {
	    if (code === null || code === undefined) return "不明";
	    return WMO_JA[code] || ("不明（code=" + code + "）");
	  }

	  function countryCodeToFlag(code) {
	    if (!code) return "";
	    const cc = String(code).toUpperCase();
	    if (!/^[A-Z]{2}$/.test(cc)) return "";
	    const base = 127397;
	    return String.fromCodePoint(base + cc.charCodeAt(0), base + cc.charCodeAt(1));
	  }

  function wmoToIconUrl(code, isNight) {
    const base = ASSET_BASE_URL || "";
    if (code === null || code === undefined) return base + "/weather_icon/" + DEFAULT_ICON_FILE.day;
    const files = WMO_ICON_FILES[code] || DEFAULT_ICON_FILE;
    const file = isNight ? (files.night || files.day) : files.day;
    const b64 = ICON_PNG_BASE64[file];
    if (b64) return "data:image/png;base64," + b64;
    return base + "/weather_icon/" + file;
  }

  function isNightHour(timeStr) {
    try {
      if (typeof timeStr === "string") {
        const m = /T(\d{2}):/.exec(timeStr);
        if (m && m[1]) {
          const h = Number(m[1]);
          return h < 6 || h >= 18;
        }
      }
      const d = new Date(timeStr);
      const h = d.getHours();
      return h < 6 || h >= 18;
    } catch {
      return false;
    }
  }

  function wmoToIcon(code) {
    if (code === null || code === undefined) return "❓";
    if (code === 0) return "☀️";
    if (code === 1) return "🌤️";
    if (code === 2) return "⛅";
    if (code === 3) return "☁️";
    if (code === 45 || code === 48) return "🌫️";
    if (code >= 51 && code <= 55) return "🌦️";
    if (code >= 61 && code <= 65) return "☔";
    if (code >= 71 && code <= 75) return "☃️";
    if (code >= 80 && code <= 82) return "🌧️";
    if (code >= 95) return "⛈️";
    return "☁️";
  }

  function render(data) {
    if (!data) return;
    
    try {
      const out = data?.structuredContent || data;
      // 位置情報を保存（更新ボタン用）
      const hasValidLocation =
        typeof out?.location?.latitude === "number" &&
        Number.isFinite(out.location.latitude) &&
        typeof out?.location?.longitude === "number" &&
        Number.isFinite(out.location.longitude);
      if (hasValidLocation) {
        lastValidInput = {
          latitude: out.location.latitude,
          longitude: out.location.longitude,
          label: out.location.name || out.location.label
        };
      } else if (
        typeof window.openai?.toolInput?.latitude === "number" &&
        Number.isFinite(window.openai.toolInput.latitude) &&
        typeof window.openai?.toolInput?.longitude === "number" &&
        Number.isFinite(window.openai.toolInput.longitude)
      ) {
        lastValidInput = window.openai.toolInput;
      }
      
      // 現在の表示データを保存（再描画用）
      currentViewData = data;

      const candidates = out.candidates || [];
      const daily = out.daily || [];

      // 天気予報を優先、なければ候補リスト
      if (daily.length > 0) {
        renderForecast(out);
      } else if (candidates.length > 0) {
        renderCandidates(out);
      }
    } catch (e) {
      console.error("Render error:", e);
      headline.textContent = "表示エラーが発生しました";
    }
  }

	  function renderCandidates(out) {
	    const candidates = out.candidates || [];
	    headline.textContent = (out.query || "場所") + " の候補";
	    detail.style.display = "none";
	    main.innerHTML = '<div id="list" class="candidate-list"></div>';
	    const list = main.querySelector("#list");
	    
	    candidates.forEach(c => {
	      const card = document.createElement("div");
	      card.className = "candidate-card";
	      
	      const region = c.admin1 || "";
	      const name = c.name;
	      const country = c.country || "";
	      const flag = countryCodeToFlag(c.country_code) || "🌐";
	      const lat = typeof c.latitude === "number" ? c.latitude : null;
	      const lon = typeof c.longitude === "number" ? c.longitude : null;
	      const latLon = (lat !== null && lon !== null)
	        ? (lat.toFixed(4) + " / " + lon.toFixed(4))
	        : "";
	      
	      card.innerHTML = \`
	        <div class="candidate-flag">\${flag}</div>
	        <div class="candidate-region">\${[country, region].filter(Boolean).join(" / ")}</div>
	        <div class="candidate-name">\${name}</div>
	        <div class="candidate-latlon">\${latLon}</div>
	      \`;
	      
	      card.onclick = async () => {
	        headline.textContent = "取得中...";
	        main.innerHTML = '<div style="text-align:center; padding:40px; opacity:0.6;">予報を読み込み中...</div>';
	        const fullLabel = (region ? region + " " : "") + name;
	        // 先に保存しておく（取得失敗時でも「更新」できるように）
	        lastValidInput = { latitude: c.latitude, longitude: c.longitude, label: fullLabel };
	        const next = await window.openai.callTool("get_forecast", {
	          latitude: c.latitude, longitude: c.longitude, days: 7, label: fullLabel
	        });
	        render(next);
	      };
	      list.appendChild(card);
	    });
	  }

	  function renderForecast(out) {
	    const daily = out.daily || [];
	    const loc = out.location || {};
	    headline.textContent = loc.name || loc.label || "天気予報";
	    main.innerHTML = "";
	    detail.style.display = "none";
	    activeDate = null;

	    // グラフ描画
	    let weeklyChartWrapper = null;
	    let hourlyChartWrapper = null;
	    try {
	      const maxT = 45;
	      const minT = -20;
	      const range = maxT - minT;

	      const chartWrapper = document.createElement("div");
	      chartWrapper.className = "chart-wrapper";
	      weeklyChartWrapper = chartWrapper;

	      const weeklyHeader = document.createElement("div");
	      weeklyHeader.className = "chart-header";
	      const weeklyTitle = document.createElement("div");
	      weeklyTitle.className = "chart-title";
	      const start = daily?.[0]?.date;
	      const end = daily?.[daily.length - 1]?.date;
	      weeklyTitle.textContent = (start && end ? ("期間: " + start + "〜" + end) : "週間") + "（最高/最低気温：℃）";
	      const weeklyLegend = document.createElement("div");
	      weeklyLegend.className = "chart-legend";
	      weeklyLegend.innerHTML =
	        '<span class="chart-legend-item"><span class="dot temp"></span>最高(℃)</span>' +
	        '<span class="chart-legend-item"><span class="dot hum"></span>最低(℃)</span>';
	      weeklyHeader.appendChild(weeklyTitle);
	      weeklyHeader.appendChild(weeklyLegend);
	      chartWrapper.appendChild(weeklyHeader);

	      const yAxis = document.createElement("div");
	      yAxis.className = "chart-y-axis";
	      let yLabels = "";
	      for (let t = maxT; t >= minT; t -= 5) {
	        yLabels += '<span>' + t + '°</span>';
      }
      yAxis.innerHTML = yLabels;
      chartWrapper.appendChild(yAxis);

      const chartArea = document.createElement("div");
      chartArea.className = "chart-area";
      
      const svgNS = "http://www.w3.org/2000/svg";
      const svg = document.createElementNS(svgNS, "svg");
      svg.setAttribute("width", "100%");
      svg.setAttribute("height", "100%");
      svg.setAttribute("viewBox", "0 0 1000 1000");
      svg.setAttribute("preserveAspectRatio", "none");
      svg.style.overflow = "visible";
      svg.style.pointerEvents = "none";

      const defs = document.createElementNS(svgNS, "defs");
      const zeroOffset = (maxT / (maxT - minT)) * 100;

      const grad = document.createElementNS(svgNS, "linearGradient");
      grad.setAttribute("id", "tempGrad");
      grad.setAttribute("gradientUnits", "userSpaceOnUse");
      grad.setAttribute("x1", "0%"); grad.setAttribute("y1", "0");
      grad.setAttribute("x2", "0%"); grad.setAttribute("y2", "1000");
      grad.innerHTML = '<stop offset="0%" style="stop-color:#ff922b;stop-opacity:0.3" />' +
                       '<stop offset="' + zeroOffset + '%" style="stop-color:#ff922b;stop-opacity:0.3" />' +
                       '<stop offset="' + zeroOffset + '%" style="stop-color:#339af0;stop-opacity:0.3" />' +
                       '<stop offset="100%" style="stop-color:#339af0;stop-opacity:0.3" />';

      const grad2 = document.createElementNS(svgNS, "linearGradient");
      grad2.setAttribute("id", "strokeGrad");
      grad2.setAttribute("gradientUnits", "userSpaceOnUse");
      grad2.setAttribute("x1", "0%"); grad2.setAttribute("y1", "0");
      grad2.setAttribute("x2", "0%"); grad2.setAttribute("y2", "1000");
      grad2.innerHTML = '<stop offset="0%" style="stop-color:#ff922b;stop-opacity:1" />' +
                        '<stop offset="' + zeroOffset + '%" style="stop-color:#ff922b;stop-opacity:1" />' +
                        '<stop offset="' + zeroOffset + '%" style="stop-color:#339af0;stop-opacity:1" />' +
                        '<stop offset="100%" style="stop-color:#339af0;stop-opacity:1" />';
      
      defs.appendChild(grad);
      defs.appendChild(grad2);
      svg.appendChild(defs);

      for (let temp = minT; temp <= maxT; temp += 5) {
        const y = (maxT - temp) / range * 1000;
        const line = document.createElementNS(svgNS, "line");
        line.setAttribute("x1", "0"); line.setAttribute("y1", y);
        line.setAttribute("x2", "1000"); line.setAttribute("y2", y);
        const isZero = Math.abs(temp) < 0.1;
        line.setAttribute("stroke", isZero ? "rgba(0,0,0,0.3)" : "rgba(0,0,0,0.06)");
        line.setAttribute("stroke-width", isZero ? "3" : "1");
        svg.appendChild(line);
      }

      const xStep = 1000 / Math.max(1, daily.length);
      const xOffset = xStep / 2;
      const getValY = (temp) => (maxT - (temp || 0)) / range * 1000;

      const maxPoints = daily.map((d, i) => ({ x: xOffset + (i * xStep), y: getValY(d.temp_max_c), temp: d.temp_max_c }));
      const minPoints = daily.map((d, i) => ({ x: xOffset + (i * xStep), y: getValY(d.temp_min_c), temp: d.temp_min_c }));

      const getAreaPath = (maxPts, minPts) => {
        if (maxPts.length < 2) return "";
        let d = "M" + maxPts[0].x + "," + maxPts[0].y;
        for (let i = 0; i < maxPts.length - 1; i++) {
          const p0 = maxPts[i], p1 = maxPts[i+1];
          const cp1x = p0.x + (p1.x - p0.x) / 2;
          d += " C" + cp1x + "," + p0.y + " " + cp1x + "," + p1.y + " " + p1.x + "," + p1.y;
        }
        d += " L" + minPts[minPts.length-1].x + "," + minPts[minPts.length-1].y;
        for (let i = minPts.length - 1; i > 0; i--) {
          const p0 = minPts[i], p1 = minPts[i-1];
          const cp1x = p0.x + (p1.x - p0.x) / 2;
          d += " C" + cp1x + "," + p0.y + " " + cp1x + "," + p1.y + " " + p1.x + "," + p1.y;
        }
        d += " Z";
        return d;
      };

      const getLinePath = (pts) => {
        if (pts.length < 2) return "";
        let d = "M" + pts[0].x + "," + pts[0].y;
        for (let i = 0; i < pts.length - 1; i++) {
          const p0 = pts[i], p1 = pts[i+1];
          const cp1x = p0.x + (p1.x - p0.x) / 2;
          d += " C" + cp1x + "," + p0.y + " " + cp1x + "," + p1.y + " " + p1.x + "," + p1.y;
        }
        return d;
      };

      const area = document.createElementNS(svgNS, "path");
      area.setAttribute("d", getAreaPath(maxPoints, minPoints));
      area.setAttribute("fill", "url(#tempGrad)");
      svg.appendChild(area);

      const drawLine = (pathData) => {
        const p = document.createElementNS(svgNS, "path");
        p.setAttribute("d", pathData); p.setAttribute("fill", "none");
        p.setAttribute("stroke", "url(#strokeGrad)"); p.setAttribute("stroke-width", "4");
        p.setAttribute("stroke-linecap", "round");
        svg.appendChild(p);
      };
      drawLine(getLinePath(maxPoints));
      drawLine(getLinePath(minPoints));

      const drawPoints = (pts, isMax) => {
        pts.forEach(p => {
          const ptColor = (p.temp || 0) >= 0 ? "#ff922b" : "#339af0";
          const c = document.createElementNS(svgNS, "circle");
          c.setAttribute("cx", p.x); c.setAttribute("cy", p.y); c.setAttribute("r", "10");
          c.setAttribute("fill", "#fff"); c.setAttribute("stroke", ptColor); c.setAttribute("stroke-width", "4");
          svg.appendChild(c);

          const t = document.createElementNS(svgNS, "text");
          t.setAttribute("x", p.x); t.setAttribute("y", isMax ? p.y - 25 : p.y + 40);
          t.setAttribute("text-anchor", "middle");
          t.setAttribute("font-size", "32");
          t.setAttribute("fill", ptColor); t.setAttribute("font-weight", "700");
          t.style.fontFamily = "sans-serif";
          t.style.textShadow = "0 0 4px rgba(255,255,255,0.9)";
          t.textContent = (p.temp || 0) + "°";
          svg.appendChild(t);
        });
      };
      drawPoints(maxPoints, true);
      drawPoints(minPoints, false);

      chartArea.appendChild(svg);
      chartWrapper.appendChild(chartArea);

      try {
        const xAxis = document.createElement("div");
        xAxis.className = "chart-x-axis";
        daily.forEach(d => {
          const dateStr = d.date ? d.date.split("-")[2] : "-";
          const day = d.date ? ["日","月","火","水","木","金","土"][new Date(d.date).getDay()] : "-";
          const span = document.createElement("span");
          span.style.textAlign = "center";
          span.innerHTML = '<span style="font-weight:700;">' + dateStr + '</span><br>(' + day + ')';
          xAxis.appendChild(span);
        });
        chartWrapper.appendChild(xAxis);
      } catch (e) { console.error("X-Axis render error:", e); }

	      main.appendChild(chartWrapper);
	    } catch (e) { console.error("Chart draw error:", e); }

	    // 日付クリック時に表示する「時間別（気温+湿度）」グラフ
	    const hourlyWrapper = document.createElement("div");
	    hourlyWrapper.className = "chart-wrapper";
	    hourlyWrapper.style.display = "none";
	    hourlyChartWrapper = hourlyWrapper;

	    const hourlyHeader = document.createElement("div");
	    hourlyHeader.className = "chart-header";
	    const hourlyTitle = document.createElement("div");
	    hourlyTitle.className = "chart-title";
	    hourlyTitle.textContent = "時間別（気温[℃] / 湿度[%]）";
	    const hourlyLegend = document.createElement("div");
	    hourlyLegend.className = "chart-legend";
	    hourlyLegend.innerHTML =
	      '<span class="chart-legend-item"><span class="dot temp"></span>気温(℃)</span>' +
	      '<span class="chart-legend-item"><span class="dot hum"></span>湿度(%)</span>';
	    hourlyHeader.appendChild(hourlyTitle);
	    hourlyHeader.appendChild(hourlyLegend);
	    hourlyWrapper.appendChild(hourlyHeader);

	    const yAxisTemp = document.createElement("div");
	    yAxisTemp.className = "chart-y-axis";
	    const yAxisHum = document.createElement("div");
	    yAxisHum.className = "chart-y-axis right";

	    const hourlyArea = document.createElement("div");
	    hourlyArea.className = "chart-area";
	    hourlyArea.style.marginRight = "40px";

	    const hourlyXAxis = document.createElement("div");
	    hourlyXAxis.className = "chart-x-axis";
	    hourlyXAxis.style.marginRight = "40px";

	    hourlyWrapper.appendChild(yAxisTemp);
	    hourlyWrapper.appendChild(yAxisHum);
	    hourlyWrapper.appendChild(hourlyArea);
	    hourlyWrapper.appendChild(hourlyXAxis);
	    main.appendChild(hourlyWrapper);

	    function renderHourlyChart(day, headerText) {
	      try {
	        const timeArr = day?.hourly?.time || [];
	        const tArr = day?.hourly?.temperature_2m || [];
	        const hArr = day?.hourly?.relativehumidity_2m || [];
	        hourlyTitle.textContent = headerText || "時間別（気温[℃] / 湿度[%]）";
	        if (!timeArr.length || !tArr.length) {
	          hourlyArea.innerHTML = '<div style="text-align:center; padding:40px; opacity:0.6;">時間別データがありません</div>';
	          yAxisTemp.innerHTML = "";
	          yAxisHum.innerHTML = "";
	          hourlyXAxis.innerHTML = "";
	          return;
	        }

	        const temps = tArr.map(v => (typeof v === "number" && isFinite(v)) ? v : null);
	        const hums = hArr.map(v => (typeof v === "number" && isFinite(v)) ? v : null);

	        const tNums = temps.filter(v => v !== null);
	        const tMin0 = tNums.length ? Math.min(...tNums) : -5;
	        const tMax0 = tNums.length ? Math.max(...tNums) : 5;
	        const pad = Math.max(2, (tMax0 - tMin0) * 0.2);
	        const tMin = Math.floor((tMin0 - pad) * 2) / 2;
	        const tMax = Math.ceil((tMax0 + pad) * 2) / 2;
	        const tRange = Math.max(1, tMax - tMin);

	        const tStep = (tRange <= 8) ? 1 : (tRange <= 16 ? 2 : 5);

	        const getTempY = (temp) => (tMax - temp) / tRange * 1000;
	        const getHumY = (hum) => (100 - hum) / 100 * 1000;

	        // Y軸ラベル（左: ℃ / 右: %）
	        const tempLabels = [];
	        for (let v = tMax; v >= tMin - 1e-9; v -= tStep) tempLabels.push(v.toString());
	        yAxisTemp.innerHTML = tempLabels.map(v => '<span>' + v + '°</span>').join("");
	        yAxisHum.innerHTML = [100, 80, 60, 40, 20, 0].map(v => '<span>' + v + '%</span>').join("");

	        // X軸ラベル（3時間おき）
	        hourlyXAxis.innerHTML = "";
	        const hourLabels = [];
	        for (let i = 0; i < timeArr.length; i += 3) {
	          const ts = String(timeArr[i] || "");
	          const m = /T(\\d{2}):/.exec(ts);
	          hourLabels.push(m && m[1] ? m[1] : String(i).padStart(2, "0"));
	        }
	        hourlyXAxis.style.gridTemplateColumns = "repeat(" + hourLabels.length + ", 1fr)";
	        hourLabels.forEach(hh => {
	          const span = document.createElement("span");
	          span.style.textAlign = "center";
	          span.innerHTML = '<span style="font-weight:700;">' + hh + '</span>';
	          hourlyXAxis.appendChild(span);
	        });

	        // SVG描画
	        hourlyArea.innerHTML = "";
	        const svgNS = "http://www.w3.org/2000/svg";
	        const svg = document.createElementNS(svgNS, "svg");
	        svg.setAttribute("width", "100%");
	        svg.setAttribute("height", "100%");
	        svg.setAttribute("viewBox", "0 0 1000 1000");
	        svg.setAttribute("preserveAspectRatio", "none");
	        svg.style.overflow = "visible";
	        svg.style.pointerEvents = "none";

	        for (let v = tMin; v <= tMax + 1e-9; v += tStep) {
	          const y = getTempY(v);
	          const line = document.createElementNS(svgNS, "line");
	          line.setAttribute("x1", "0"); line.setAttribute("y1", y);
	          line.setAttribute("x2", "1000"); line.setAttribute("y2", y);
	          line.setAttribute("stroke", "rgba(0,0,0,0.06)");
	          line.setAttribute("stroke-width", "1");
	          svg.appendChild(line);
	        }

	        const n = timeArr.length;
	        const xStep = 1000 / Math.max(1, n - 1);
	        const tempPts = [];
	        const humPts = [];
	        for (let i = 0; i < n; i++) {
	          const x = i * xStep;
	          if (temps[i] !== null) tempPts.push({ x, y: getTempY(temps[i]) });
	          if (hums[i] !== null) humPts.push({ x, y: getHumY(hums[i]) });
	        }

	        const linePath = (pts) => {
	          if (!pts || pts.length < 2) return "";
	          let d = "M" + pts[0].x + "," + pts[0].y;
	          for (let i = 0; i < pts.length - 1; i++) {
	            const p0 = pts[i], p1 = pts[i+1];
	            const cp1x = p0.x + (p1.x - p0.x) / 2;
	            d += " C" + cp1x + "," + p0.y + " " + cp1x + "," + p1.y + " " + p1.x + "," + p1.y;
	          }
	          return d;
	        };

	        const tempPath = document.createElementNS(svgNS, "path");
	        tempPath.setAttribute("d", linePath(tempPts));
	        tempPath.setAttribute("fill", "none");
	        tempPath.setAttribute("stroke", "#ff922b");
	        tempPath.setAttribute("stroke-width", "4");
	        tempPath.setAttribute("stroke-linecap", "round");
	        svg.appendChild(tempPath);

	        const humPath = document.createElementNS(svgNS, "path");
	        humPath.setAttribute("d", linePath(humPts));
	        humPath.setAttribute("fill", "none");
	        humPath.setAttribute("stroke", "#1c7ed6");
	        humPath.setAttribute("stroke-width", "3");
	        humPath.setAttribute("stroke-linecap", "round");
	        humPath.setAttribute("stroke-dasharray", "8 6");
	        svg.appendChild(humPath);

	        hourlyArea.appendChild(svg);

	        // ツールチップ＆フォーカス（指で触って数値表示）
	        const overlay = document.createElement("div");
	        overlay.className = "chart-overlay";
	        const tooltip = document.createElement("div");
	        tooltip.className = "chart-tooltip";
	        hourlyArea.appendChild(overlay);
	        hourlyArea.appendChild(tooltip);

	        const focusLine = document.createElementNS(svgNS, "line");
	        focusLine.setAttribute("x1", "0"); focusLine.setAttribute("y1", "0");
	        focusLine.setAttribute("x2", "0"); focusLine.setAttribute("y2", "1000");
	        focusLine.setAttribute("stroke", "rgba(0,0,0,0.18)");
	        focusLine.setAttribute("stroke-width", "2");
	        focusLine.style.display = "none";
	        svg.appendChild(focusLine);

	        const dotTemp = document.createElementNS(svgNS, "circle");
	        dotTemp.setAttribute("r", "10");
	        dotTemp.setAttribute("fill", "#fff");
	        dotTemp.setAttribute("stroke", "#ff922b");
	        dotTemp.setAttribute("stroke-width", "4");
	        dotTemp.style.display = "none";
	        svg.appendChild(dotTemp);

	        const dotHum = document.createElementNS(svgNS, "circle");
	        dotHum.setAttribute("r", "9");
	        dotHum.setAttribute("fill", "#fff");
	        dotHum.setAttribute("stroke", "#1c7ed6");
	        dotHum.setAttribute("stroke-width", "4");
	        dotHum.style.display = "none";
	        svg.appendChild(dotHum);

	        const showAtIndex = (idx, clientX, clientY) => {
	          const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
	          const safeIdx = clamp(idx, 0, n - 1);
	          const x = safeIdx * xStep;
	          focusLine.setAttribute("x1", String(x));
	          focusLine.setAttribute("x2", String(x));
	          focusLine.style.display = "";

	          if (temps[safeIdx] !== null) {
	            dotTemp.setAttribute("cx", String(x));
	            dotTemp.setAttribute("cy", String(getTempY(temps[safeIdx])));
	            dotTemp.style.display = "";
	          } else {
	            dotTemp.style.display = "none";
	          }
	          if (hums[safeIdx] !== null) {
	            dotHum.setAttribute("cx", String(x));
	            dotHum.setAttribute("cy", String(getHumY(hums[safeIdx])));
	            dotHum.style.display = "";
	          } else {
	            dotHum.style.display = "none";
	          }

	          const ts = String(timeArr[safeIdx] || "");
	          const m = /T(\\d{2}:\\d{2})/.exec(ts);
	          const hhmm = m && m[1] ? m[1] : (String(safeIdx).padStart(2, "0") + ":00");
	          const tTxt = temps[safeIdx] === null ? "-" : (Math.round(temps[safeIdx] * 10) / 10 + "°");
	          const hTxt = hums[safeIdx] === null ? "-" : (Math.round(hums[safeIdx]) + "%");
	          tooltip.textContent = hhmm + "  " + tTxt + " / " + hTxt;
	          tooltip.style.display = "block";

	          const rect = hourlyArea.getBoundingClientRect();
	          const xPx = clamp(clientX - rect.left, 0, rect.width);
	          const yPx = clamp(clientY - rect.top, 0, rect.height);

	          // 右端(23:00等)で見えなくなるのを防ぐ
	          const w = tooltip.offsetWidth || 0;
	          const h = tooltip.offsetHeight || 0;
	          let left = xPx + 10;
	          let top = yPx - h - 12;
	          if (left + w > rect.width) left = xPx - w - 10;
	          if (left < 0) left = 0;
	          if (top < 0) top = yPx + 12;
	          if (top + h > rect.height) top = rect.height - h;
	          tooltip.style.left = left + "px";
	          tooltip.style.top = top + "px";
	        };

	        const hideFocus = () => {
	          focusLine.style.display = "none";
	          dotTemp.style.display = "none";
	          dotHum.style.display = "none";
	          tooltip.style.display = "none";
	        };

	        overlay.addEventListener("pointerleave", hideFocus);
	        overlay.addEventListener("pointerdown", (ev) => {
	          try { overlay.setPointerCapture(ev.pointerId); } catch {}
	          const rect = hourlyArea.getBoundingClientRect();
	          const ratio = (ev.clientX - rect.left) / rect.width;
	          const idx = Math.round(ratio * (n - 1));
	          showAtIndex(idx, ev.clientX, ev.clientY);
	        });
	        overlay.addEventListener("pointermove", (ev) => {
	          const rect = hourlyArea.getBoundingClientRect();
	          const ratio = (ev.clientX - rect.left) / rect.width;
	          const idx = Math.round(ratio * (n - 1));
	          showAtIndex(idx, ev.clientX, ev.clientY);
	        });
	      } catch (e) {
	        console.error("Hourly chart error:", e);
	        hourlyArea.innerHTML = '<div style="text-align:center; padding:40px; opacity:0.6;">時間別グラフの表示に失敗しました</div>';
	      }
	    }

	    const scroll = document.createElement("div");
	    scroll.style.cssText = "display:flex; gap:10px; overflow-x:auto; padding:4px 0; -webkit-overflow-scrolling: touch;";
	    daily.forEach(d => {
      const c = document.createElement("div");
      c.className = "card";
      if (activeDate === d.date) c.classList.add("active");
      const date = d.date ? d.date.split("-")[2] : "-";
      const day = ["日","月","火","水","木","金","土"][new Date(d.date).getDay()];
      const iconUrl = (typeof d.weathercode === "number" ? wmoToIconUrl(d.weathercode, false) : null);
      const iconHtml = iconUrl
        ? '<img src="' + iconUrl + '" width="44" height="44" style="width:44px; height:44px; object-fit:contain; display:block; margin:0 auto;" />'
        : (d.icon || "☁️");
      c.innerHTML = '<div style="font-size:11px; opacity:0.6; margin-bottom:6px;">' + date + ' (' + day + ')</div>' +
                    '<div style="height:44px; margin:2px 0 10px 0;">' + iconHtml + '</div>' +
                    '<div style="font-size:13px; font-weight:700; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">' + d.summary_ja + '</div>';
      
	      c.onclick = () => {
	        if (activeDate === d.date) {
	          activeDate = null;
	          detail.style.display = "none";
	          c.classList.remove("active");
	          if (weeklyChartWrapper) weeklyChartWrapper.style.display = "";
	          if (hourlyChartWrapper) hourlyChartWrapper.style.display = "none";
	        } else {
	          document.querySelectorAll(".card").forEach(el => el.classList.remove("active"));
	          activeDate = d.date;
	          c.classList.add("active");
	          detail.style.display = "block";
	          if (weeklyChartWrapper) weeklyChartWrapper.style.display = "none";
	          if (hourlyChartWrapper) hourlyChartWrapper.style.display = "";
	          renderHourlyChart(d, d.date + " (" + day + ") の時間別（気温 / 湿度）");
	          
	          detail.innerHTML = "";
	          
	          const header = document.createElement("div");
          header.style.cssText = "font-weight:700; margin-bottom:12px; font-size:14px; color: inherit;";
          header.textContent = d.date + ' (' + day + ') の詳細';
          detail.appendChild(header);

          const grid = document.createElement("div");
          grid.style.cssText = "display:grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 10px; margin-bottom: 16px; font-size: 13px; opacity: 0.9;";
          
          const fmtRange = (min, max, unit) => {
            const nMin = typeof min === "number" && isFinite(min) ? Math.round(min) : null;
            const nMax = typeof max === "number" && isFinite(max) ? Math.round(max) : null;
            if (nMin === null && nMax === null) return "-";
            if (nMin !== null && nMax !== null) return nMin === nMax ? (nMin + unit) : (nMin + "〜" + nMax + unit);
            return (nMin ?? nMax) + unit;
          };

          const stats = [
            { label: '🌡 気温', value: d.temp_min_c + '〜' + d.temp_max_c + '℃' },
            { label: '🌧 雨', value: ((d.rain_sum_mm ?? 0)) + 'mm' },
            { label: '☔ 降水確率', value: d.precip_prob_max_percent + '%' },
            { label: '📈 気圧', value: fmtRange(d.pressure_msl_min_hpa, d.pressure_msl_max_hpa, 'hPa') },
            { label: '💧 湿度', value: fmtRange(d.humidity_min_percent, d.humidity_max_percent, '%') },
            { label: '❄️ 雪', value: ((d.snowfall_sum_cm ?? 0)) + 'cm' },
            { label: '☔ 降水量', value: (d.precip_sum_mm || 0) + 'mm' },
            { label: '💨 最大風速', value: (d.windspeed_max_kmh || "-") + 'km/h' },
          ];

          stats.forEach(item => {
            const div = document.createElement("div");
            div.textContent = item.label + ': ' + item.value;
            grid.appendChild(div);
          });
          detail.appendChild(grid);

          if (d.hourly && d.hourly.time) {
            const hTitle = document.createElement("div");
            hTitle.style.cssText = "font-size:12px; margin-bottom:12px; opacity:0.6; font-weight:600; border-top:1px solid rgba(128,128,128,0.2); padding-top:12px;";
            hTitle.textContent = "時間別予報";
            detail.appendChild(hTitle);

            const hContainer = document.createElement("div");
            hContainer.style.cssText = "display:flex; flex-direction:row; gap:10px; overflow-x:auto; padding:4px 0 16px 0; margin:0 -4px; -webkit-overflow-scrolling:touch; scroll-snap-type:x mandatory; white-space:nowrap;";
            
            d.hourly.time.forEach((t, i) => {
              const timeObj = new Date(t);
              const timeStr = String(timeObj.getHours()).padStart(2, '0') + ":00";
              const item = document.createElement("div");
              const isDark = window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches;
              
              item.style.cssText = "flex: 0 0 96px; scroll-snap-align: start; text-align: center; padding: 10px 8px; border-radius: 14px; border: 1px solid rgba(128,128,128,0.2); background: " + (isDark ? 'rgba(255,255,255,0.08)' : '#ffffff') + "; box-shadow: 0 2px 6px rgba(0,0,0,0.05); display: inline-block; vertical-align: top;";
              
              const timeDiv = document.createElement("div");
              timeDiv.style.cssText = "opacity:0.6; margin-bottom:6px; font-size:11px; font-weight:600;";
              timeDiv.textContent = timeStr;
              
              const iconDiv = document.createElement("div");
              iconDiv.style.cssText = "font-size:24px; margin:8px 0;";
              const code = d.hourly.weathercode[i];
              const iconUrl = wmoToIconUrl(code, isNightHour(d.hourly.time[i]));
              iconDiv.innerHTML = '<img src="' + iconUrl + '" width="40" height="40" style="width:40px; height:40px; object-fit:contain; display:block; margin:0 auto;" />';
              
              // 時間別カード（時間→アイコン→天気内容→温度/湿度）
              timeDiv.style.cssText = "opacity:0.6; margin-bottom:6px; font-size:12px; font-weight:800;";
              iconDiv.style.cssText = "height:44px; margin:4px 0 6px 0; display:flex; align-items:center; justify-content:center;";

              const summaryDiv = document.createElement("div");
              summaryDiv.style.cssText = "font-size:11px; font-weight:700; margin-bottom:6px; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;";
              summaryDiv.textContent = wmoToJa(code);

              const hum = d.hourly.relativehumidity_2m && d.hourly.relativehumidity_2m[i] !== undefined
                ? d.hourly.relativehumidity_2m[i]
                : null;
              const thRow = document.createElement("div");
              thRow.style.cssText = "display:flex; align-items:baseline; justify-content:center; gap:10px; font-weight:900; font-size:15px; line-height:1;";

              const tSpan = document.createElement("span");
              tSpan.textContent = d.hourly.temperature_2m[i] + "°";
              const slash = document.createElement("span");
              slash.style.opacity = "0.5";
              slash.textContent = "/";
              const hSpan = document.createElement("span");
              hSpan.style.color = "#1c7ed6";
              hSpan.textContent = (hum === null ? "-" : (hum + "%"));
              thRow.appendChild(tSpan);
              thRow.appendChild(slash);
              thRow.appendChild(hSpan);
              
              item.appendChild(timeDiv);
              item.appendChild(iconDiv);
              item.appendChild(summaryDiv);
              item.appendChild(thRow);
              hContainer.appendChild(item);
            });
            detail.appendChild(hContainer);
          }
        }
      };
      scroll.appendChild(c);
    });
    main.appendChild(scroll);
  }

  const init = () => {
    const out = currentViewData || window.openai?.toolOutput;
    if (out) render(out);
    else setTimeout(init, 500);
  };
  init();

  btn.onclick = async () => {
    const originalText = headline.textContent;
    try {
      headline.textContent = "更新中...";
      const input = lastValidInput || window.openai?.toolInput;
      const hasLatLon =
        input &&
        typeof input.latitude === "number" &&
        Number.isFinite(input.latitude) &&
        typeof input.longitude === "number" &&
        Number.isFinite(input.longitude);
      if (!hasLatLon) throw new Error("位置情報が特定できません");
      
      const next = await window.openai.callTool("get_forecast", {
        latitude: input.latitude, longitude: input.longitude, days: input.days || 7, label: input.label
      });
      if (next) render(next);
      else throw new Error("レスポンスが空です");
    } catch (e) {
      console.error("Update process failed:", e);
      headline.textContent = "更新失敗 (" + e.message + ")";
      setTimeout(() => { headline.textContent = originalText; }, 3000);
    }
  };

  window.addEventListener("openai:set_globals", () => {
    render(currentViewData || window.openai.toolOutput);
  });
</script>
`.trim();
}

const geocodePlaceSchema = z.object({
  place: z.string().describe("場所名"),
  count: z.number().int().min(1).max(10).default(5),
});

const getForecastSchema = z.object({
  latitude: z.number(),
  longitude: z.number(),
  days: z.number().int().min(1).max(7).default(7),
  label: z.string().optional(),
});

const handler = createMcpHandler(
  (server) => {
    server.registerResource("weather-widget", WIDGET_TEMPLATE_URI, {} as any, async () => ({
      contents: [{
        uri: WIDGET_TEMPLATE_URI,
        mimeType: "text/html+skybridge",
        text: widgetHtml() as string,
        _meta: {
          "openai/widgetDomain": "weather-widget",
          "openai/widgetCSP": {
            connect_domains: ["https://geocoding-api.open-meteo.com", "https://api.open-meteo.com"],
            resource_domains: WIDGET_RESOURCE_DOMAINS,
          },
        },
      }],
    }));

    server.registerTool("geocode_place", {
      title: "候補地検索", description: "場所名から候補地を検索します。",
      inputSchema: geocodePlaceSchema,
      _meta: { "openai/outputTemplate": WIDGET_TEMPLATE_URI, "openai/widgetAccessible": true }
    }, async (input: any) => {
      const candidates = await geocodeCandidates(input.place, input.count);
      return { structuredContent: { kind: "geocode", query: input.place, candidates }, content: [{ type: "text", text: "候補を表示しました" }] };
    });

    server.registerTool("get_forecast", {
      title: "天気取得", description: "天気予報を取得します。",
      inputSchema: getForecastSchema,
      _meta: { "openai/outputTemplate": WIDGET_TEMPLATE_URI, "openai/widgetAccessible": true }
    }, async (input: any) => {
      const f = await forecastByCoords(input.latitude, input.longitude, input.days);
      const rangeFromNumbers = (values: Array<number | null | undefined> | undefined) => {
        if (!values || values.length === 0) return null;
        const nums = values.filter((v): v is number => typeof v === "number" && Number.isFinite(v));
        if (nums.length === 0) return null;
        return { min: Math.min(...nums), max: Math.max(...nums) };
      };

      const daily = (f.daily?.time ?? []).map((d, i) => {
        // Slice hourly data for this day (24 hours)
        const hourlyStart = i * 24;
        const hourlyEnd = hourlyStart + 24;
        const hourlyData = f.hourly ? {
          time: f.hourly.time?.slice(hourlyStart, hourlyEnd) || [],
          weathercode: f.hourly.weathercode?.slice(hourlyStart, hourlyEnd) || [],
          temperature_2m: f.hourly.temperature_2m?.slice(hourlyStart, hourlyEnd) || [],
          precipitation_probability: f.hourly.precipitation_probability?.slice(hourlyStart, hourlyEnd) || [],
          relativehumidity_2m: f.hourly.relativehumidity_2m?.slice(hourlyStart, hourlyEnd) || [],
          pressure_msl: f.hourly.pressure_msl?.slice(hourlyStart, hourlyEnd) || [],
        } : undefined;

        const humidityRange = rangeFromNumbers(f.hourly?.relativehumidity_2m?.slice(hourlyStart, hourlyEnd));
        const pressureRange = rangeFromNumbers(f.hourly?.pressure_msl?.slice(hourlyStart, hourlyEnd));
        const weathercode = f.daily?.weathercode?.[i];

        return {
          date: d,
          weathercode,
          summary_ja: wmoToJa(weathercode),
          icon: wmoToIcon(weathercode),
          temp_max_c: f.daily?.temperature_2m_max?.[i],
          temp_min_c: f.daily?.temperature_2m_min?.[i],
          precip_prob_max_percent: f.daily?.precipitation_probability_max?.[i],
          precip_sum_mm: f.daily?.precipitation_sum?.[i],
          rain_sum_mm: f.daily?.rain_sum?.[i],
          snowfall_sum_cm: f.daily?.snowfall_sum?.[i],
          windspeed_max_kmh: f.daily?.windspeed_10m_max?.[i],
          humidity_min_percent: humidityRange?.min,
          humidity_max_percent: humidityRange?.max,
          pressure_msl_min_hpa: pressureRange?.min,
          pressure_msl_max_hpa: pressureRange?.max,
          hourly: hourlyData,
        };
      });
      return {
        structuredContent: {
          kind: "forecast",
          location: {
            name: input.label,
            latitude: input.latitude,
            longitude: input.longitude
          },
          daily
        },
        content: [{ type: "text", text: "天気を取得しました" }]
      };
    });
  },
  {},
  { basePath: "/api" }
);

export { handler as GET, handler as POST, handler as DELETE };
