import { createMcpHandler } from "mcp-handler";
import { z } from "zod";
import type { GeoCandidate, OpenMeteoGeocodingResponse, OpenMeteoForecastResponse } from "./types";
import { APIError } from "./types";
import { geocodeCache, forecastCache, generateGeocodeKey, generateForecastKey } from "./cache";
import { ICON_PNG_BASE64 } from "./iconData";

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
const WIDGET_TEMPLATE_URI = "ui://widget/weather-v7.html";

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
  const url = new URL(CONFIG.GEOCODING_API_URL);
  url.searchParams.set("name", place);
  url.searchParams.set("count", String(count));
  url.searchParams.set("language", "ja");
  url.searchParams.set("format", "json");
  const r = await fetch(url.toString());
  if (!r.ok) throw new APIError("GEO_ERR", `HTTP ${r.status}`);
  const data: OpenMeteoGeocodingResponse = await r.json();
  const candidates: GeoCandidate[] = (data?.results ?? []).map((hit: any) => ({
    name: hit.name, country: hit.country, admin1: hit.admin1,
    latitude: hit.latitude, longitude: hit.longitude, timezone: hit.timezone,
  }));
  geocodeCache.set(cacheKey, candidates);
  return candidates;
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
  .chart-area { margin-left: 40px; margin-right: 10px; height: 320px; position: relative; }
  .chart-area svg { pointer-events: none; }
  .chart-x-axis { margin-left: 40px; margin-right: 10px; display: grid; grid-template-columns: repeat(7, 1fr); margin-top: 15px; font-size: 8px; color: #666; }
  .detail-panel { margin-top: 12px; padding: 14px; border-radius: 12px; background: rgba(0,0,0,0.04); font-size: 13px; line-height: 1.6; display: none; }

  @media (prefers-color-scheme: dark) {
    body { color: #eee; }
    .container { border-color: rgba(255,255,255,0.1); background: rgba(0,0,0,0.2); }
    .btn { background: #444; color: #fff; border-color: rgba(255,255,255,0.1); }
    .card { background: rgba(255,255,255,0.05); border-color: rgba(255,255,255,0.1); }
    .chart-wrapper { background: rgba(255,255,255,0.03); }
    .chart-y-axis { border-color: rgba(255,255,255,0.2); color: #999; }
    .chart-x-axis { color: #999; }
    .detail-panel { background: rgba(255,255,255,0.1); }
    .hourly-temp { color: #fff; }
    .hourly-prob { color: #74c0fc; }
  }

  .candidate-card {
    padding: 16px;
    border-radius: 12px;
    border: 1px solid rgba(0,0,0,0.08);
    background: rgba(255,255,255,0.4);
    cursor: pointer;
    transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1);
    display: flex;
    align-items: center;
    gap: 12px;
    margin-bottom: 8px;
    box-shadow: 0 2px 4px rgba(0,0,0,0.02);
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
  .candidate-icon {
    font-size: 20px;
  }
  .candidate-info {
    flex: 1;
  }
  .candidate-region {
    font-size: 11px;
    opacity: 0.6;
    margin-bottom: 2px;
    font-weight: 500;
  }
  .candidate-name {
    font-size: 16px;
    font-weight: 700;
    color: #333;
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
      if (out?.location?.latitude && out?.location?.longitude) {
        lastValidInput = {
          latitude: out.location.latitude,
          longitude: out.location.longitude,
          label: out.location.name || out.location.label
        };
      } else if (window.openai?.toolInput?.latitude) {
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
    main.innerHTML = '<div id="list" style="padding: 4px 0;"></div>';
    const list = main.querySelector("#list");
    
    candidates.forEach(c => {
      const card = document.createElement("div");
      card.className = "candidate-card";
      
      const region = c.admin1 || "";
      const name = c.name;
      const country = c.country || "";
      const lat = typeof c.latitude === "number" ? c.latitude : null;
      const lon = typeof c.longitude === "number" ? c.longitude : null;
      const latLon = (lat !== null && lon !== null)
        ? (lat.toFixed(4) + " / " + lon.toFixed(4))
        : "";
      
      card.innerHTML = \`
        <div class="candidate-icon">📍</div>
        <div class="candidate-info">
          <div class="candidate-region">\${[country, region].filter(Boolean).join(" / ")}</div>
          <div class="candidate-name">\${name}</div>
          <div style="font-size: 11px; opacity: 0.6; margin-top: 2px; font-weight: 500;">\${latLon}</div>
        </div>
        <div style="opacity: 0.3; font-size: 18px;">›</div>
      \`;
      
      card.onclick = async () => {
        headline.textContent = "取得中...";
        main.innerHTML = '<div style="text-align:center; padding:40px; opacity:0.6;">予報を読み込み中...</div>';
        const fullLabel = (region ? region + " " : "") + name;
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

    // グラフ描画
    try {
      const maxT = 45;
      const minT = -20;
      const range = maxT - minT;

      const chartWrapper = document.createElement("div");
      chartWrapper.className = "chart-wrapper";

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
        } else {
          document.querySelectorAll(".card").forEach(el => el.classList.remove("active"));
          activeDate = d.date;
          c.classList.add("active");
          detail.style.display = "block";
          
          detail.innerHTML = "";
          
          const header = document.createElement("div");
          header.style.cssText = "font-weight:700; margin-bottom:12px; font-size:14px; color: inherit;";
          header.textContent = d.date + ' (' + day + ') の詳細';
          detail.appendChild(header);

          const grid = document.createElement("div");
          grid.style.cssText = "display:grid; grid-template-columns: 1fr 1fr; gap: 10px; margin-bottom: 16px; font-size: 13px; opacity: 0.9;";
          
          const fmtRange = (min, max, unit) => {
            const nMin = typeof min === "number" && isFinite(min) ? Math.round(min) : null;
            const nMax = typeof max === "number" && isFinite(max) ? Math.round(max) : null;
            if (nMin === null && nMax === null) return "-";
            if (nMin !== null && nMax !== null) return nMin === nMax ? (nMin + unit) : (nMin + "〜" + nMax + unit);
            return (nMin ?? nMax) + unit;
          };

          const stats = [
            { label: '🌡 気温', value: d.temp_min_c + '〜' + d.temp_max_c + '℃' },
            { label: '☔ 降水確率', value: d.precip_prob_max_percent + '%' },
            { label: '☔ 降水量', value: (d.precip_sum_mm || 0) + 'mm' },
            { label: '🌧 雨', value: ((d.rain_sum_mm ?? 0)) + 'mm' },
            { label: '❄️ 雪', value: ((d.snowfall_sum_cm ?? 0)) + 'cm' },
            { label: '💧 湿度', value: fmtRange(d.humidity_min_percent, d.humidity_max_percent, '%') },
            { label: '📈 気圧', value: fmtRange(d.pressure_msl_min_hpa, d.pressure_msl_max_hpa, 'hPa') },
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
      if (!input || !input.latitude || !input.longitude) throw new Error("位置情報が特定できません");
      
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
