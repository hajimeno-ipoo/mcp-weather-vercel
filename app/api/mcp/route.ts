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
  .card.active { border-color: #ff922b; background: rgba(255,146,43,0.1); }
  .card:active { transform: scale(0.95); }
  .chart-wrapper { margin: 25px 0 15px 0; background: rgba(0,0,0,0.02); border-radius: 12px; padding: 40px 10px 25px 10px; position: relative; }
  .chart-y-axis { position: absolute; left: 8px; top: 40px; bottom: 65px; width: 32px; display: flex; flex-direction: column; justify-content: space-between; font-size: 8px; color: #666; text-align: right; padding-right: 6px; border-right: 1px solid rgba(0,0,0,0.15); pointer-events: none; }
  .chart-area { margin-left: 40px; margin-right: 10px; height: 160px; position: relative; }
  .chart-x-axis { margin-left: 40px; margin-right: 10px; display: grid; grid-template-columns: repeat(7, 1fr); margin-top: 15px; font-size: 8px; color: #666; }
  .detail-panel { margin-top: 12px; padding: 14px; border-radius: 12px; background: rgba(0,0,0,0.04); font-size: 13px; line-height: 1.6; display: none; }
  @media (prefers-color-scheme: dark) {
    body { color: #eee; }
    .container { border-color: rgba(255,255,255,0.1); background: rgba(0,0,0,0.2); }
    .btn { background: #444; color: #fff; border-color: rgba(255,255,255,0.1); }
    .card { background: rgba(255,255,255,0.05); border-color: rgba(255,255,255,0.1); }
    .chart-wrapper { background: rgba(255,255,255,0.03); }
    .chart-y-axis { border-color: rgba(255,255,255,0.2); color: #999; }
    .chart-area { border-color: rgba(255,255,255,0.2); }
    .chart-x-axis { color: #999; }
    .detail-panel { background: rgba(255,255,255,0.05); }
  }
</style>

<div class="container">
  <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:12px;">
    <div>
      <div style="font-size:13px; opacity:0.6; margin-bottom:2px;">気温推移 (基準線: 0°C)</div>
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

  let activeDate = null;

  function render(data) {
    try {
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

        // グラフ描画を試みる
        try {
          const maxTemps = daily.map(d => d.temp_max_c).filter(t => !isNaN(t));
          const minTemps = daily.map(d => d.temp_min_c).filter(t => !isNaN(t));
          const allTemps = [...maxTemps, ...minTemps];
          
          // スケール計算: 0度を中央(500)に固定するためのロジック
          const maxAbs = Math.max(...allTemps.map(Math.abs), 10);
          const absLimit = Math.ceil(maxAbs / 5) * 5 + 5; // 5の倍数でキリよく
          const maxT = absLimit;
          const minT = -absLimit;
          const range = maxT - minT; // 常に 2 * absLimit

          const chartWrapper = document.createElement("div");
          chartWrapper.className = "chart-wrapper";

          // Y軸ラベル
          const yAxis = document.createElement("div");
          yAxis.className = "chart-y-axis";
          yAxis.innerHTML = '<span>' + maxT + '°</span><span>' + (maxT/2) + '°</span><span>0°</span><span>' + (minT/2) + '°</span><span>' + minT + '°</span>';
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

          const defs = document.createElementNS(svgNS, "defs");
          const gradMax = document.createElementNS(svgNS, "linearGradient");
          gradMax.setAttribute("id", "gradMax");
          gradMax.setAttribute("x1", "0%"); gradMax.setAttribute("y1", "0%"); gradMax.setAttribute("x2", "0%"); gradMax.setAttribute("y2", "100%");
          gradMax.innerHTML = '<stop offset="0%" style="stop-color:#ff922b;stop-opacity:0.4" /><stop offset="100%" style="stop-color:#ff922b;stop-opacity:0" />';
          defs.appendChild(gradMax);

          const gradMin = document.createElementNS(svgNS, "linearGradient");
          gradMin.setAttribute("id", "gradMin");
          gradMin.setAttribute("x1", "0%"); gradMin.setAttribute("y1", "100%"); gradMin.setAttribute("x2", "0%"); gradMin.setAttribute("y2", "0%");
          gradMin.innerHTML = '<stop offset="0%" style="stop-color:#339af0;stop-opacity:0.4" /><stop offset="100%" style="stop-color:#339af0;stop-opacity:0" />';
          defs.appendChild(gradMin);
          svg.appendChild(defs);

          // グリッド線（5度ごと）
          const gridCount = (maxT - minT) / 5;
          for (let i = 0; i <= gridCount; i++) {
            const temp = maxT - (i * i === 0 ? 0 : i * 5);
            const y = (maxT - (maxT - (i * 5))) / range * 1000;
            const line = document.createElementNS(svgNS, "line");
            line.setAttribute("x1", "0"); line.setAttribute("y1", y);
            line.setAttribute("x2", "1000"); line.setAttribute("y2", y);
            
            // 0度は太く、その他は薄く
            const isZero = Math.abs(maxT - (i * 5)) < 0.1;
            line.setAttribute("stroke", isZero ? "rgba(0,0,0,0.4)" : "rgba(0,0,0,0.05)");
            line.setAttribute("stroke-width", isZero ? "3" : "1");
            svg.appendChild(line);
          }

          const xStep = 1000 / daily.length;
          const xOffset = xStep / 2;
          
          // 座標計算関数: temp=maxTのときy=0, temp=0のときy=500, temp=minTのときy=1000
          const getValY = (temp) => (maxT - temp) / range * 1000;

          const maxPoints = daily.map((d, i) => ({
            x: xOffset + (i * xStep),
            y: getValY(d.temp_max_c),
            temp: d.temp_max_c
          }));
          const minPoints = daily.map((d, i) => ({
            x: xOffset + (i * xStep),
            y: getValY(d.temp_min_c),
            temp: d.temp_min_c
          }));

          const getCurvePath = (pts, baseLineY) => {
            if (pts.length < 2) return "";
            let d = "M" + pts[0].x + "," + baseLineY;
            d += " L" + pts[0].x + "," + pts[0].y;
            for (let i = 0; i < pts.length - 1; i++) {
              const p0 = pts[i];
              const p1 = pts[i+1];
              const cp1x = p0.x + (p1.x - p0.x) / 2;
              d += " C" + cp1x + "," + p0.y + " " + cp1x + "," + p1.y + " " + p1.x + "," + p1.y;
            }
            d += " L" + pts[pts.length-1].x + "," + baseLineY + " Z";
            return d;
          };

          const getLinePath = (pts) => {
            if (pts.length < 2) return "";
            let d = "M" + pts[0].x + "," + pts[0].y;
            for (let i = 0; i < pts.length - 1; i++) {
              const p0 = pts[i];
              const p1 = pts[i+1];
              const cp1x = p0.x + (p1.x - p0.x) / 2;
              d += " C" + cp1x + "," + p0.y + " " + cp1x + "," + p1.y + " " + p1.x + "," + p1.y;
            }
            return d;
          };

          const drawArea = (pathData, gradId) => {
            const p = document.createElementNS(svgNS, "path");
            p.setAttribute("d", pathData); p.setAttribute("fill", "url(#" + gradId + ")");
            svg.appendChild(p);
          };
          drawArea(getCurvePath(maxPoints, 500), "gradMax");
          drawArea(getCurvePath(minPoints, 500), "gradMin");

          const drawLine = (pathData, color) => {
            const p = document.createElementNS(svgNS, "path");
            p.setAttribute("d", pathData); p.setAttribute("fill", "none");
            p.setAttribute("stroke", color); p.setAttribute("stroke-width", "4");
            p.setAttribute("stroke-linecap", "round");
            svg.appendChild(p);
          };
          drawLine(getLinePath(maxPoints), "#ff922b");
          drawLine(getLinePath(minPoints), "#339af0");

          const drawPoints = (pts, color, isMax) => {
            pts.forEach(p => {
              const c = document.createElementNS(svgNS, "circle");
              c.setAttribute("cx", p.x); c.setAttribute("cy", p.y); c.setAttribute("r", "10");
              c.setAttribute("fill", "#fff"); c.setAttribute("stroke", color); c.setAttribute("stroke-width", "4");
              svg.appendChild(c);

              const t = document.createElementNS(svgNS, "text");
              // ラベルがグリッドと重なりすぎないよう調整
              t.setAttribute("x", p.x); t.setAttribute("y", isMax ? p.y - 30 : p.y + 50);
              t.setAttribute("text-anchor", "middle");
              t.setAttribute("font-size", "48");
              t.setAttribute("fill", color); t.setAttribute("font-weight", "800");
              t.style.fontFamily = "sans-serif";
              t.style.textShadow = "0 0 4px rgba(255,255,255,0.8)";
              t.textContent = p.temp + "°";
              svg.appendChild(t);
            });
          };
          drawPoints(maxPoints, "#ff922b", true);
          drawPoints(minPoints, "#339af0", false);

          chartArea.appendChild(svg);
          chartWrapper.appendChild(chartArea);

          const xAxis = document.createElement("div");
          xAxis.className = "chart-x-axis";
          daily.forEach(d => {
            const dateObj = new Date(d.date);
            const day = ["日","月","火","水","木","金","土"][dateObj.getDay()];
            const dateStr = d.date.split("-")[2];
            const span = document.createElement("span");
            span.style.textAlign = "center";
            span.innerHTML = '<span style="font-weight:700;">' + dateStr + '</span><br>(' + day + ')';
            xAxis.appendChild(span);
          });
          chartWrapper.appendChild(xAxis);
          panel.appendChild(chartWrapper);
        } catch (e) {
          console.error("Chart error:", e);
        }

        const scroll = document.createElement("div");
        scroll.style.cssText = "display:flex; gap:10px; overflow-x:auto; padding:4px 0; -webkit-overflow-scrolling: touch;";
        daily.forEach(d => {
          const c = document.createElement("div");
          c.className = "card";
          if (activeDate === d.date) c.classList.add("active");
          const date = d.date ? d.date.split("-")[2] : "-";
          const day = ["日","月","火","水","木","金","土"][new Date(d.date).getDay()];
          c.innerHTML = '<div style="font-size:11px; opacity:0.6;">' + date + ' (' + day + ')</div>' +
                        '<div style="font-size:18px; margin:8px 0;">' + d.summary_ja + '</div>' +
                        '<div style="font-weight:700; font-size:16px;">' + d.temp_max_c + '° / ' + d.temp_min_c + '°</div>' +
                        '<div style="font-size:10px; margin-top:4px; opacity:0.7;">☔ ' + d.precip_prob_max_percent + '%</div>';
          
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
              detail.innerHTML = '<div style="font-weight:700; margin-bottom:6px; font-size:14px;">' + d.date + ' (' + day + ') の詳細</div>' +
                                 '<div style="display:grid; grid-template-columns: 1fr 1fr; gap: 8px;">' +
                                 '<div>🌡 気温: ' + d.temp_min_c + '〜' + d.temp_max_c + '℃</div>' +
                                 '<div>☔ 降水確率: ' + d.precip_prob_max_percent + '%</div>' +
                                 '<div>💧 降水量: ' + (d.precip_sum_mm || 0) + 'mm</div>' +
                                 '<div>💨 最大風速: ' + (d.windspeed_max_kmh || "-") + 'km/h</div>' +
                                 '</div>';
              detail.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
            }
          };
          scroll.appendChild(c);
        });
        panel.appendChild(scroll);
      }
    } catch (e) {
      console.error("Render error:", e);
      headline.textContent = "表示エラーが発生しました";
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
