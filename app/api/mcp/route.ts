import { createMcpHandler } from "mcp-handler";
import { z } from "zod";
import type {
  GeoCandidate,
  OpenMeteoGeocodingResponse,
  OpenMeteoForecastResponse,
} from "./types";
import { APIError, ValidationError } from "./types";
import {
  geocodeCache,
  forecastCache,
  generateGeocodeKey,
  generateForecastKey,
} from "./cache";

const CONFIG = {
  GEOCODING_API_URL: process.env.NEXT_PUBLIC_GEOCODING_API_URL ?? "https://geocoding-api.open-meteo.com/v1/search",
  FORECAST_API_URL: process.env.NEXT_PUBLIC_FORECAST_API_URL ?? "https://api.open-meteo.com/v1/forecast",
  REQUEST_TIMEOUT: parseInt(process.env.MCP_REQUEST_TIMEOUT ?? "30", 10) * 1000,
  RETRY_ATTEMPTS: parseInt(process.env.MCP_RETRY_ATTEMPTS ?? "3", 10),
} as const;

async function fetchWithTimeout(url: string, options: RequestInit = {}) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), CONFIG.REQUEST_TIMEOUT);
  try {
    return await fetch(url, { ...options, signal: controller.signal });
  } finally {
    clearTimeout(timeoutId);
  }
}

async function fetchWithRetry(url: string, options: RequestInit = {}, retries = CONFIG.RETRY_ATTEMPTS): Promise<Response> {
  try {
    return await fetchWithTimeout(url, options);
  } catch (error) {
    if (retries > 0) {
      await new Promise((resolve) => setTimeout(resolve, 100 * Math.pow(2, CONFIG.RETRY_ATTEMPTS - retries)));
      return fetchWithRetry(url, options, retries - 1);
    }
    throw error;
  }
}

const WMO_JA: Record<number, string> = {
  0: "快晴", 1: "ほぼ快晴", 2: "晴れ時々くもり", 3: "くもり", 45: "霧", 48: "着氷性の霧",
  51: "弱い霧雨", 53: "霧雨", 55: "強い霧雨", 61: "弱い雨", 63: "雨", 65: "強い雨",
  71: "弱い雪", 73: "雪", 75: "強い雪", 80: "にわか雨（弱）", 81: "にわか雨", 82: "にわか雨（強）", 95: "雷雨",
};

function wmoToJa(code: number | null | undefined) {
  if (code === null || code === undefined) return "不明";
  return WMO_JA[code] ?? `不明（code=${code}）`;
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

  const r = await fetchWithRetry(url.toString());
  if (!r.ok) throw new APIError("GEO_ERR", `HTTP ${r.status}`);
  const data: OpenMeteoGeocodingResponse = await r.json();
  const candidates: GeoCandidate[] = (data?.results ?? []).map((hit: any) => ({
    name: hit.name, country: hit.country, admin1: hit.admin1,
    latitude: hit.latitude, longitude: hit.longitude, timezone: hit.timezone,
  }));
  geocodeCache.set(cacheKey, candidates);
  return candidates;
}

async function forecastByCoords(lat: number, lon: number, days: number, timezone: string): Promise<OpenMeteoForecastResponse> {
  const cacheKey = generateForecastKey(lat, lon, days, timezone);
  const cached = forecastCache.get(cacheKey);
  if (cached) return cached;

  const url = new URL(CONFIG.FORECAST_API_URL);
  url.searchParams.set("latitude", String(lat));
  url.searchParams.set("longitude", String(lon));
  url.searchParams.set("timezone", timezone);
  url.searchParams.set("current_weather", "true");
  url.searchParams.set("forecast_days", String(days));
  url.searchParams.set("daily", ["weathercode", "temperature_2m_max", "temperature_2m_min", "precipitation_probability_max"].join(","));

  const r = await fetchWithRetry(url.toString());
  if (!r.ok) throw new APIError("FC_ERR", `HTTP ${r.status}`);
  const data: OpenMeteoForecastResponse = await r.json();
  forecastCache.set(cacheKey, data);
  return data;
}

function widgetHtml() {
  return `
<style>
  :root { color-scheme: light dark; }
  body { font-family: ui-sans-serif, system-ui; padding: 10px; margin: 0; }
  .container { border: 1px solid rgba(0,0,0,.1); border-radius: 12px; padding: 12px; background: rgba(0,0,0,.02); }
  .btn { padding: 8px 12px; border-radius: 8px; border: 1px solid rgba(0,0,0,.15); background: #fff; cursor: pointer; }
  .card { flex-shrink: 0; min-width: 85px; padding: 8px; border: 1px solid rgba(0,0,0,.08); border-radius: 10px; text-align: center; background: #fff; }
  @media (prefers-color-scheme: dark) {
    body { background: #1e1e1e; color: #eee; }
    .container { background: #2d2d2d; border-color: #444; }
    .btn { background: #444; color: #fff; border-color: #555; }
    .card { background: #333; border-color: #444; }
  }
</style>

<div class="container">
  <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:8px;">
    <div id="headline" style="font-size:16px; font-weight:600;">読み込み中...</div>
    <button id="refresh" class="btn">更新</button>
  </div>
  <div id="panel"></div>
  <div id="debug" style="margin-top:10px; font-size:10px; color:#888; white-space:pre-wrap; display:none; border-top:1px dashed #ccc; padding-top:5px;"></div>
</div>

<script type="module">
  const headline = document.getElementById("headline");
  const panel = document.getElementById("panel");
  const debug = document.getElementById("debug");
  const btn = document.getElementById("refresh");

  function log(msg, obj) {
    console.log(msg, obj);
    debug.style.display = "block";
    debug.textContent += msg + (obj ? ": " + JSON.stringify(obj).substring(0, 100) + "..." : "") + "\\n";
  }

  function render(data) {
    log("Rendering data", data);
    if (!data) return;
    
    // データの正規化（どんな階層でも探しに行く）
    const out = data.structuredContent || data;
    const candidates = out.candidates || [];
    const daily = out.daily || [];
    const loc = out.location || {};

    if (candidates.length > 0) {
      headline.textContent = (out.query || "場所") + "の候補";
      panel.innerHTML = "";
      const wrap = document.createElement("div");
      wrap.style.cssText = "display:grid; gap:6px;";
      candidates.forEach(c => {
        const b = document.createElement("button");
        b.className = "btn";
        b.style.width = "100%";
        b.style.textAlign = "left";
        b.textContent = c.name + (c.admin1 ? " (" + c.admin1 + ")" : "");
        b.onclick = async () => {
          log("Candidate clicked", c);
          const next = await window.openai.callTool("get_forecast", {
            latitude: c.latitude, longitude: c.longitude, days: 7, label: c.name
          });
          render(next);
        };
        wrap.appendChild(b);
      });
      panel.appendChild(wrap);
    } else if (daily.length > 0) {
      headline.textContent = loc.label || loc.name || "天気予報";
      panel.innerHTML = "";
      const scroll = document.createElement("div");
      scroll.style.cssText = "display:flex; gap:8px; overflow-x:auto; padding-bottom:5px;";
      daily.forEach(d => {
        const c = document.createElement("div");
        c.className = "card";
        const date = d.date ? d.date.split("-")[2] : "-";
        c.innerHTML = "<div>" + date + "日</div><div style='font-size:14px; margin:4px 0;'>" + d.summary_ja + "</div><div style='font-weight:600;'>" + d.temp_max_c + "℃</div>";
        scroll.appendChild(c);
      });
      panel.appendChild(scroll);
    } else {
      headline.textContent = "データ解析中...";
      log("Data format not recognized", out);
    }
  }

  async function start() {
    log("Widget start");
    let count = 0;
    const check = setInterval(() => {
      count++;
      const out = window.openai?.toolOutput;
      if (out) {
        log("Data found at attempt " + count, out);
        clearInterval(check);
        render(out);
      } else if (count > 20) {
        log("Data not found after 20s");
        headline.textContent = "データ待機中...";
      }
    }, 1000);
  }

  btn.onclick = async () => {
    log("Refresh clicked");
    const next = await window.openai.callTool("get_forecast", window.openai.toolInput);
    render(next);
  };

  start();
  window.addEventListener("openai:set_globals", () => {
    log("Globals updated");
    render(window.openai.toolOutput);
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
    server.registerResource("weather-widget", "ui://widget/weather.html", {} as any, async () => ({
      contents: [{
        uri: "ui://widget/weather.html",
        mimeType: "text/html+skybridge",
        text: widgetHtml(),
        _meta: {
          "openai/widgetDomain": "weather-widget",
          "openai/widgetCSP": {
            connect_domains: ["https://geocoding-api.open-meteo.com", "https://api.open-meteo.com"],
          },
        },
      }],
    }));

    server.registerTool("geocode_place", {
      title: "候補地検索", description: "場所名から候補地を検索します。",
      inputSchema: geocodePlaceSchema,
      _meta: { "openai/outputTemplate": "ui://widget/weather.html", "openai/widgetAccessible": true }
    }, async (input: any) => {
      const candidates = await geocodeCandidates(input.place, input.count);
      const structuredContent = { kind: "geocode", query: input.place, candidates };
      return { structuredContent, content: [{ type: "text", text: `検索結果: ${candidates.length}件` }] };
    });

    server.registerTool("get_forecast", {
      title: "天気取得", description: "天気予報を取得します。",
      inputSchema: getForecastSchema,
      _meta: { "openai/outputTemplate": "ui://widget/weather.html", "openai/widgetAccessible": true }
    }, async (input: any) => {
      const f = await forecastByCoords(input.latitude, input.longitude, input.days, "Asia/Tokyo");
      const daily = (f.daily?.time ?? []).map((d, i) => ({
        date: d, summary_ja: wmoToJa(f.daily?.weathercode?.[i]),
        temp_max_c: f.daily?.temperature_2m_max?.[i], temp_min_c: f.daily?.temperature_2m_min?.[i],
      }));
      const structuredContent = { kind: "forecast", location: { name: input.label }, daily };
      return { structuredContent, content: [{ type: "text", text: "天気を取得しました" }] };
    });
  },
  {},
  { basePath: "/api" }
);

export { handler as GET, handler as POST, handler as DELETE };
