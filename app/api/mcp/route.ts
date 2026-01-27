import { createMcpHandler } from "mcp-handler";
import { z } from "zod";
import type { GeoCandidate, OpenMeteoGeocodingResponse, OpenMeteoForecastResponse } from "./types";
import { APIError } from "./types";
import { geocodeCache, forecastCache, generateGeocodeKey, generateForecastKey } from "./cache";

const CONFIG = {
  GEOCODING_API_URL: process.env.NEXT_PUBLIC_GEOCODING_API_URL ?? "https://geocoding-api.open-meteo.com/v1/search",
  FORECAST_API_URL: process.env.NEXT_PUBLIC_FORECAST_API_URL ?? "https://api.open-meteo.com/v1/forecast",
} as const;

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
  url.searchParams.set("daily", ["weathercode", "temperature_2m_max", "temperature_2m_min", "precipitation_probability_max", "precipitation_sum", "windspeed_10m_max"].join(","));
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
  .card:active { transform: scale(0.95); }
  .chart-container { margin: 16px 0; display: flex; align-items: flex-end; gap: 4px; height: 60px; padding: 0 4px; }
  .chart-bar { flex: 1; background: linear-gradient(to top, #4dabf7, #ff922b); border-radius: 4px 4px 2px 2px; position: relative; min-height: 4px; }
  .detail-panel { margin-top: 12px; padding: 14px; border-radius: 12px; background: rgba(0,0,0,0.04); font-size: 13px; line-height: 1.6; display: none; }
  @media (prefers-color-scheme: dark) {
    body { color: #eee; }
    .container { border-color: rgba(255,255,255,0.1); background: rgba(0,0,0,0.2); }
    .btn { background: #444; color: #fff; border-color: rgba(255,255,255,0.1); }
    .card { background: rgba(255,255,255,0.05); border-color: rgba(255,255,255,0.1); }
    .detail-panel { background: rgba(255,255,255,0.05); }
  }
</style>

<div class="container">
  <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:12px;">
    <div>
      <div style="font-size:13px; opacity:0.6; margin-bottom:2px;">天気予報</div>
      <div id="headline" style="font-size:20px; font-weight:700;">読み込み中...</div>
    </div>
    <button id="refresh" class="btn">更新</button>
  </div>
  <div id="panel"></div>
  <div id="detail" class="detail-panel"></div>
</div>

<script type="module">
  const headline = document.getElementById("headline");
  const panel = document.getElementById("panel");
  const detail = document.getElementById("detail");
  const btn = document.getElementById("refresh");

  function render(data) {
    if (!data) return;
    const out = data.structuredContent || data;
    const candidates = out.candidates || [];
    const daily = out.daily || [];
    const loc = out.location || {};

    if (candidates.length > 0) {
      headline.textContent = (out.query || "場所") + " の候補";
      detail.style.display = "none";
      panel.innerHTML = '<div id="list" style="display:grid; gap:8px;"></div>';
      const list = panel.querySelector("#list");
      candidates.forEach(c => {
        const b = document.createElement("button");
        b.className = "btn";
        b.style.width = "100%";
        b.style.textAlign = "left";
        b.textContent = c.name + (c.admin1 ? " (" + c.admin1 + ")" : "");
        b.onclick = async () => {
          headline.textContent = "取得中...";
          const next = await window.openai.callTool("get_forecast", {
            latitude: c.latitude, longitude: c.longitude, days: 7, label: c.name
          });
          render(next);
        };
        list.appendChild(b);
      });
    } else if (daily.length > 0) {
      headline.textContent = loc.name || loc.label || "天気予報";
      panel.innerHTML = "";

      // ビジュアルグラフ
      const temps = daily.map(d => d.temp_max_c).filter(t => !isNaN(t));
      const minT = Math.min(...temps);
      const maxT = Math.max(...temps);
      const range = (maxT - minT) || 1;

      const chart = document.createElement("div");
      chart.className = "chart-container";
      daily.forEach(d => {
        const bar = document.createElement("div");
        bar.className = "chart-bar";
        const height = ((d.temp_max_c - minT) / range * 80) + 20;
        bar.style.height = height + "%";
        bar.title = d.temp_max_c + "°";
        chart.appendChild(bar);
      });
      panel.appendChild(chart);

      // スクロールカード
      const scroll = document.createElement("div");
      scroll.style.cssText = "display:flex; gap:10px; overflow-x:auto; padding:4px 0; -webkit-overflow-scrolling: touch;";
      daily.forEach(d => {
        const c = document.createElement("div");
        c.className = "card";
        const date = d.date ? d.date.split("-")[2] : "-";
        const day = ["日","月","火","水","木","金","土"][new Date(d.date).getDay()];
        c.innerHTML = '<div style="font-size:11px; opacity:0.6;">' + date + ' (' + day + ')</div>' +
                      '<div style="font-size:18px; margin:8px 0;">' + d.summary_ja + '</div>' +
                      '<div style="font-weight:700; font-size:16px;">' + d.temp_max_c + '°</div>' +
                      '<div style="font-size:10px; margin-top:4px; opacity:0.7;">☔ ' + d.precip_prob_max_percent + '%</div>';
        
        c.onclick = () => {
          detail.style.display = "block";
          detail.innerHTML = '<div style="font-weight:700; margin-bottom:6px; font-size:14px;">' + d.date + ' (' + day + ') の詳細</div>' +
                             '<div style="display:grid; grid-template-columns: 1fr 1fr; gap: 8px;">' +
                             '<div>🌡 気温: ' + d.temp_min_c + '〜' + d.temp_max_c + '℃</div>' +
                             '<div>☔ 降水確率: ' + d.precip_prob_max_percent + '%</div>' +
                             '<div>💧 降水量: ' + (d.precip_sum_mm || 0) + 'mm</div>' +
                             '<div>💨 最大風速: ' + (d.windspeed_max_kmh || "-") + 'km/h</div>' +
                             '</div>';
          detail.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
        };
        scroll.appendChild(c);
      });
      panel.appendChild(scroll);
    }
  }

  const init = () => {
    const out = window.openai?.toolOutput;
    if (out) render(out);
    else setTimeout(init, 500);
  };
  init();

  btn.onclick = async () => {
    headline.textContent = "更新中...";
    const next = await window.openai.callTool("get_forecast", window.openai.toolInput);
    render(next);
  };

  window.addEventListener("openai:set_globals", () => render(window.openai.toolOutput));
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
      return { structuredContent: { kind: "geocode", query: input.place, candidates }, content: [{ type: "text", text: "候補を表示しました" }] };
    });

    server.registerTool("get_forecast", {
      title: "天気取得", description: "天気予報を取得します。",
      inputSchema: getForecastSchema,
      _meta: { "openai/outputTemplate": "ui://widget/weather.html", "openai/widgetAccessible": true }
    }, async (input: any) => {
      const f = await forecastByCoords(input.latitude, input.longitude, input.days);
      const daily = (f.daily?.time ?? []).map((d, i) => ({
        date: d, summary_ja: wmoToJa(f.daily?.weathercode?.[i]),
        temp_max_c: f.daily?.temperature_2m_max?.[i], temp_min_c: f.daily?.temperature_2m_min?.[i],
        precip_prob_max_percent: f.daily?.precipitation_probability_max?.[i],
        precip_sum_mm: f.daily?.precipitation_sum?.[i], windspeed_max_kmh: f.daily?.windspeed_10m_max?.[i],
      }));
      return { structuredContent: { kind: "forecast", location: { name: input.label }, daily }, content: [{ type: "text", text: "天気を取得しました" }] };
    });
  },
  {},
  { basePath: "/api" }
);

export { handler as GET, handler as POST, handler as DELETE };
