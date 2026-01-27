import { createMcpHandler } from "mcp-handler";
import { z } from "zod";
import type {
  GeoCandidate,
  GeocodingResult,
  ForecastResult,
  CurrentWeather,
  DailyForecast,
  ToolResponse,
  APIError as APIErrorType,
  OpenMeteoGeocodingResponse,
  OpenMeteoForecastResponse,
} from "./types";
import { APIError, ValidationError } from "./types";
import {
  geocodeCache,
  forecastCache,
  generateGeocodeKey,
  generateForecastKey,
  cleanupCaches,
} from "./cache";

// Configuration from environment variables
const CONFIG = {
  GEOCODING_API_URL:
    process.env.NEXT_PUBLIC_GEOCODING_API_URL ??
    "https://geocoding-api.open-meteo.com/v1/search",
  FORECAST_API_URL:
    process.env.NEXT_PUBLIC_FORECAST_API_URL ??
    "https://api.open-meteo.com/v1/forecast",
  REQUEST_TIMEOUT: parseInt(process.env.MCP_REQUEST_TIMEOUT ?? "30", 10) * 1000, // Convert to ms
  RETRY_ATTEMPTS: parseInt(process.env.MCP_RETRY_ATTEMPTS ?? "3", 10),
} as const;

// Utility: Fetch with timeout
async function fetchWithTimeout(url: string, options: RequestInit = {}) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), CONFIG.REQUEST_TIMEOUT);

  try {
    const response = await fetch(url, {
      ...options,
      signal: controller.signal,
    });
    return response;
  } finally {
    clearTimeout(timeoutId);
  }
}

// Utility: Retry logic for failed requests
async function fetchWithRetry(
  url: string,
  options: RequestInit = {},
  retries = CONFIG.RETRY_ATTEMPTS
): Promise<Response> {
  try {
    return await fetchWithTimeout(url, options);
  } catch (error) {
    if (retries > 0) {
      // Exponential backoff: 100ms, 200ms, 400ms
      const delay = 100 * Math.pow(2, CONFIG.RETRY_ATTEMPTS - retries);
      await new Promise((resolve) => setTimeout(resolve, delay));
      return fetchWithRetry(url, options, retries - 1);
    }
    throw error;
  }
}

const WMO_JA: Record<number, string> = {
  0: "快晴",
  1: "ほぼ快晴",
  2: "晴れ時々くもり",
  3: "くもり",
  45: "霧",
  48: "着氷性の霧",
  51: "弱い霧雨",
  53: "霧雨",
  55: "強い霧雨",
  61: "弱い雨",
  63: "雨",
  65: "強い雨",
  71: "弱い雪",
  73: "雪",
  75: "強い雪",
  80: "にわか雨（弱）",
  81: "にわか雨",
  82: "にわか雨（強）",
  95: "雷雨",
};

function wmoToJa(code: number | null | undefined) {
  if (code === null || code === undefined) return "不明";
  return WMO_JA[code] ?? `不明（code=${code}）`;
}

async function geocodeCandidates(
  place: string,
  count: number
): Promise<GeoCandidate[]> {
  if (!place || place.trim().length === 0) {
    throw new ValidationError("place", "Place name cannot be empty");
  }

  const cacheKey = generateGeocodeKey(place, count);

  // Check cache first
  const cachedResult = geocodeCache.get(cacheKey);
  if (cachedResult) {
    return cachedResult;
  }

  try {
    const url = new URL(CONFIG.GEOCODING_API_URL);
    url.searchParams.set("name", place);
    url.searchParams.set("count", String(count));
    url.searchParams.set("language", "ja");
    url.searchParams.set("format", "json");

    const r = await fetchWithRetry(url.toString());
    if (!r.ok) {
      throw new APIError(
        "GEOCODING_API_ERROR",
        `Geocoding API error: HTTP ${r.status}`,
        r.status,
        r.status >= 500
      );
    }

    const data: OpenMeteoGeocodingResponse = await r.json();
    const results = (data?.results ?? []) as any[];

    const candidates: GeoCandidate[] = results.map((hit) => ({
      name: hit.name as string,
      country: hit.country as string | undefined,
      admin1: hit.admin1 as string | undefined,
      latitude: hit.latitude as number,
      longitude: hit.longitude as number,
      timezone: hit.timezone as string | undefined,
    }));

    // Cache the result (24 hours for geocoding)
    geocodeCache.set(cacheKey, candidates);

    return candidates;
  } catch (error) {
    if (error instanceof APIError || error instanceof ValidationError) {
      throw error;
    }
    const message = error instanceof Error ? error.message : String(error);
    throw new APIError(
      "GEOCODING_FETCH_ERROR",
      `Failed to fetch geocoding candidates: ${message}`,
      undefined,
      true
    );
  }
}

async function forecastByCoords(
  lat: number,
  lon: number,
  days: number,
  timezone: string
): Promise<OpenMeteoForecastResponse> {
  // Validate inputs
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) {
    throw new ValidationError(
      "coordinates",
      "Latitude and longitude must be valid numbers"
    );
  }

  const cacheKey = generateForecastKey(lat, lon, days, timezone);

  // Check cache first
  const cachedResult = forecastCache.get(cacheKey);
  if (cachedResult) {
    return cachedResult;
  }

  try {
    const url = new URL(CONFIG.FORECAST_API_URL);
    url.searchParams.set("latitude", String(lat));
    url.searchParams.set("longitude", String(lon));
    url.searchParams.set("timezone", timezone);
    url.searchParams.set("current_weather", "true");
    url.searchParams.set("forecast_days", String(days));
    url.searchParams.set(
      "daily",
      [
        "weathercode",
        "temperature_2m_max",
        "temperature_2m_min",
        "precipitation_probability_max",
      ].join(",")
    );

    console.log(`[forecastByCoords] API URL: ${url.toString()}`);

    const r = await fetchWithRetry(url.toString());
    if (!r.ok) {
      throw new APIError(
        "FORECAST_API_ERROR",
        `Forecast API error: HTTP ${r.status}`,
        r.status,
        r.status >= 500
      );
    }

    const data: OpenMeteoForecastResponse = await r.json();

    // Cache the result (1 hour for forecast data)
    forecastCache.set(cacheKey, data);

    return data;
  } catch (error) {
    if (error instanceof APIError || error instanceof ValidationError) {
      throw error;
    }
    const message = error instanceof Error ? error.message : String(error);
    throw new APIError(
      "FORECAST_FETCH_ERROR",
      `Failed to fetch forecast data: ${message}`,
      undefined,
      true
    );
  }
}

function widgetHtml() {
  return `
<style>
  :root {
    color-scheme: light dark;
  }
  
  @media (prefers-color-scheme: dark) {
    body { background: #1e1e1e; color: #ffffff; }
    .widget-container { border-color: rgba(255,255,255,.2); background: #2d2d2d; }
    .widget-button { background: #404040; color: #ffffff; border-color: rgba(255,255,255,.2); }
    .widget-button:hover { background: #505050; }
    .daily-card { border-color: rgba(255,255,255,.1); background: #353535; }
    .daily-row { border-color: rgba(255,255,255,.1); }
    .candidate-btn { background: #404040; color: #ffffff; border-color: rgba(255,255,255,.2); }
    .candidate-btn:hover { background: #505050; }
  }
</style>

<div style="font-family: ui-sans-serif, system-ui; padding: 12px;">
  <div class="widget-container" style="border: 1px solid rgba(0,0,0,.12); border-radius: 12px; padding: 12px; transition: all 0.2s;">
    <div style="display:flex; justify-content:space-between; align-items:center; gap: 8px; margin-bottom: 4px;">
      <div>
        <div style="font-size: 14px; opacity:.8;">天気</div>
        <div id="headline" style="font-size: 18px; font-weight: 600;">-</div>
      </div>
      <button id="refresh" class="widget-button"
        style="padding: 8px 10px; border-radius: 10px; border: 1px solid rgba(0,0,0,.18); background: white; cursor:pointer; transition: all 0.2s;">
        更新
      </button>
    </div>

    <div id="period-selector" style="display:none; font-size:12px; margin-bottom:8px; opacity:.8;">
      📅 表示期間: <span id="days-display">7日</span>
    </div>

    <div id="panel" style="margin-top: 10px;"></div>
    <div id="err" style="margin-top:10px; color:#b00020; font-size:13px;"></div>
  </div>
</div>

<script type="module">
  const headline = document.getElementById("headline");
  const panel = document.getElementById("panel");
  const err = document.getElementById("err");
  const btn = document.getElementById("refresh");
  const periodSelector = document.getElementById("period-selector");
  const daysDisplay = document.getElementById("days-display");

  // ダークモード検出
  const isDark = window.matchMedia("(prefers-color-scheme: dark)").matches;

  function clear() {
    err.textContent = "";
    panel.innerHTML = "";
  }

  function setBusy(busy) {
    btn.disabled = busy;
    btn.style.opacity = busy ? "0.6" : "1";
    btn.style.cursor = busy ? "default" : "pointer";
  }

  function renderCandidates(out) {
    const q = out?.query ?? out?.location?.query ?? "-";
    headline.textContent = q + " の候補";
    periodSelector.style.display = "none";
    clear();

    const candidates = out?.candidates ?? [];
    if (!candidates.length) {
      panel.textContent = "候補が見つかりませんでした。別の地名で試してください。";
      return;
    }

    const wrap = document.createElement("div");
    wrap.style.cssText = "display:grid; gap:8px;";

    candidates.forEach((c) => {
      const label = [
        c.name,
        c.admin1 ? "（" + c.admin1 + "）" : "",
        c.country ? " / " + c.country : ""
      ].join("");

      const b = document.createElement("button");
      b.className = "candidate-btn";
      b.textContent = label;
      b.style.cssText = "text-align:left; padding:10px; border-radius:10px; border:1px solid rgba(0,0,0,.10); background:white; cursor:pointer; transition: all 0.2s;";
      b.addEventListener("click", async () => {
        try {
          setBusy(true);
          err.textContent = "";
          const days = Math.min(7, Math.max(1, window.openai?.toolInput?.days ?? 7));
          const timezone = c.timezone || "Asia/Tokyo";
          const next = await window.openai?.callTool("get_forecast", {
            latitude: c.latitude,
            longitude: c.longitude,
            days,
            timezone,
            label
          });
          render(next?.structuredContent ?? next);
        } catch(e) {
          err.textContent = String(e?.message ?? e);
        } finally {
          setBusy(false);
        }
      });
      wrap.appendChild(b);
    });

    panel.appendChild(wrap);
  }

  function renderForecast(out) {
    const loc = out?.location;
    headline.textContent = loc?.label ?? loc?.name ?? loc?.query ?? "-";
    const daily = out?.daily ?? [];
    const days = daily.length;
    daysDisplay.textContent = days + "日";
    periodSelector.style.display = "inline";
    clear();

    // Debug: コンソールに出力
    console.log("renderForecast called", { days, dailyLength: daily.length, daily: daily });

    const now = out?.current;
    const nowDiv = document.createElement("div");
    nowDiv.style.cssText = "font-size:14px; margin-bottom:10px; padding:8px; border-radius:8px; background:rgba(0,0,0,.04);";
    nowDiv.textContent = now
      ? ("🌡️ いま: " + now.temperature_c + "℃ | 💨 風 " + now.windspeed + " km/h")
      : "いま: -";
    panel.appendChild(nowDiv);

    // 常に横スクロール対応のカード表示
    const scrollDiv = document.createElement("div");
    scrollDiv.style.cssText = "display:flex; gap:12px; overflow-x:auto; padding:8px 0; margin-top:8px; -webkit-overflow-scrolling: touch;";
    daily.forEach((d) => {
      const card = document.createElement("div");
      card.className = "daily-card";
      card.style.cssText = "flex-shrink:0; min-width:90px; padding:10px; border:1px solid rgba(0,0,0,.08); border-radius:10px; text-align:center; font-size:12px; background: rgba(0,0,0,.01);";
      const dateStr = d.date ? d.date.split("-")[2] : "-";
      const dayOfWeek = ["日", "月", "火", "水", "木", "金", "土"][(new Date(d.date).getDay ? new Date(d.date).getDay() : 0)];
      card.innerHTML = \`
        <div style="font-weight:600; margin-bottom:6px; font-size:13px;">\${dateStr}日</div>
        <div style="font-size:11px; color:#999; margin-bottom:4px;">(\${dayOfWeek})</div>
        <div style="font-size:14px; margin:8px 0;">\${d.summary_ja}</div>
        <div style="margin:6px 0; font-weight:500; font-size:13px;">\${d.temp_min_c}〜\${d.temp_max_c}℃</div>
        <div style="font-size:11px; opacity:.8;">☔ \${d.precip_prob_max_percent}%</div>
      \`;
      scrollDiv.appendChild(card);
    });
    panel.appendChild(scrollDiv);
  }

  function render(out) {
    if (out?.candidates) return renderCandidates(out);
    return renderForecast(out);
  }

  render(window.openai?.toolOutput);

  btn.addEventListener("click", async () => {
    try {
      setBusy(true);
      err.textContent = "";
      const input = window.openai?.toolInput ?? {};
      const out = window.openai?.toolOutput;
      const isGeocode = !!out?.candidates;

      if (isGeocode) {
        const next = await window.openai?.callTool("geocode_place", input);
        render(next?.structuredContent ?? next);
      } else {
        const next = await window.openai?.callTool("get_forecast", {
          ...input,
          days: Math.min(7, Math.max(1, input.days ?? 7))
        });
        render(next?.structuredContent ?? next);
      }
    } catch(e) {
      err.textContent = String(e?.message ?? e);
    } finally {
      setBusy(false);
    }
  });

  window.addEventListener("openai:set_globals", () => {
    render(window.openai?.toolOutput);
  }, { passive: true });
</script>
  `.trim();
}

// Zod スキーマ定義
const geocodePlaceSchema = z.object({
  place: z.string().describe("場所名（例: 中央区 / Shibuya / Tokyo）"),
  count: z.number().int().min(1).max(10).default(5),
  days: z.number().int().min(1).max(7).default(3),
});

const getForecastSchema = z.object({
  latitude: z.number().describe("緯度"),
  longitude: z.number().describe("経度"),
  days: z.number().int().min(1).max(7).default(7),
  timezone: z.string().default("Asia/Tokyo"),
  label: z.string().optional().describe("表示用ラベル（任意）"),
});

const handler = createMcpHandler(
  (server) => {
    // UI resource: ChatGPT内でウィジェットとして表示されます
    server.registerResource(
      "weather-widget",
      "ui://widget/weather.html",
      {} as any,
      async () => ({
        contents: [
          {
            uri: "ui://widget/weather.html",
            mimeType: "text/html+skybridge",
            text: widgetHtml(),
          },
        ],
      })
    );

    // 1) 候補地検索（ジオコード）
    server.registerTool(
      "geocode_place",
      {
        title: "候補地検索（ジオコード）",
        description: "場所名から候補地（緯度経度）を複数返します。",
        inputSchema: geocodePlaceSchema,
        _meta: {
          "openai/outputTemplate": "ui://widget/weather.html",
          "openai/widgetAccessible": true,
          "openai/toolInvocation/invoking": "候補地を検索中…",
          "openai/toolInvocation/invoked": "候補を表示しました",
        },
      },
      async (input: any) => {
        const place = String(input.place ?? "").trim();
        const count = Math.max(1, Math.min(10, Number(input.count ?? 5)));
        const days = Math.max(1, Math.min(7, Number(input.days ?? 3)));

        if (!place) throw new Error("place を指定してください");

        const candidates = await geocodeCandidates(place, count);

        const structuredContent = {
          kind: "geocode",
          query: place,
          days,
          candidates,
        };

        const lines: string[] = [];
        lines.push(`検索: ${place}`);
        if (!candidates.length) {
          lines.push("候補が見つかりませんでした。");
        } else {
          lines.push("候補:");
          candidates.forEach((c, i) => {
            const label = `${c.name}${c.admin1 ? "（" + c.admin1 + "）" : ""}${c.country ? " / " + c.country : ""}`;
            lines.push(`${i + 1}. ${label} (${c.latitude}, ${c.longitude})`);
          });
        }

        return {
          structuredContent,
          content: [{ type: "text" as const, text: lines.join("\n") }],
        };
      }
    );

    // 2) 天気取得（緯度経度）
    server.registerTool(
      "get_forecast",
      {
        title: "天気取得（緯度経度）",
        description: "緯度経度から現在天気と数日予報を返します。",
        inputSchema: getForecastSchema,
        _meta: {
          "openai/outputTemplate": "ui://widget/weather.html",
          "openai/widgetAccessible": true,
          "openai/toolInvocation/invoking": "天気を取得中…",
          "openai/toolInvocation/invoked": "天気を更新しました",
        },
      },
      async (input: any) => {
        const latitude = Number(input.latitude);
        const longitude = Number(input.longitude);
        const days = Math.max(1, Math.min(7, Number(input.days ?? 7)));
        const timezone = String(input.timezone ?? "Asia/Tokyo");
        const label = (input.label ? String(input.label) : undefined);

        if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) {
          throw new Error("latitude / longitude が不正です");
        }

        const f = await forecastByCoords(latitude, longitude, days, timezone);
        const current = f.current_weather ?? null;

        const daily = f.daily ?? {};
        const time: string[] = daily.time ?? [];
        const weathercode: number[] = daily.weathercode ?? [];
        const tmax: number[] = daily.temperature_2m_max ?? [];
        const tmin: number[] = daily.temperature_2m_min ?? [];
        const pop: number[] = daily.precipitation_probability_max ?? [];

        // Debug: ログに出力
        console.log(`[forecast] requested days: ${days}, received time array length: ${time.length}`);

        const dailyRows = time.map((d, i) => ({
          date: d,
          weathercode: weathercode[i],
          summary_ja: wmoToJa(weathercode[i]),
          temp_max_c: tmax[i],
          temp_min_c: tmin[i],
          precip_prob_max_percent: pop[i],
        }));

        const structuredContent = {
          kind: "forecast",
          location: {
            latitude,
            longitude,
            timezone,
            label,
          },
          current: current
            ? {
                temperature_c: current.temperature,
                windspeed: current.windspeed,
                winddirection: current.winddirection,
                is_day: current.is_day,
                time: current.time,
              }
            : null,
          daily: dailyRows,
          source: "Open-Meteo",
        };

        const lines: string[] = [];
        lines.push(`座標: ${latitude}, ${longitude} (${timezone})${label ? " / " + label : ""}`);
        if (structuredContent.current) {
          lines.push(`いま: ${structuredContent.current.temperature_c}℃ / 風 ${structuredContent.current.windspeed}`);
        }
        for (const row of dailyRows) {
          lines.push(`${row.date}: ${row.summary_ja} / ${row.temp_min_c}〜${row.temp_max_c}℃ / 降水 最大${row.precip_prob_max_percent}%`);
        }

        return {
          structuredContent,
          content: [{ type: "text" as const, text: lines.join("\n") }],
        };
      }
    );
  },
  {},
  { basePath: "/api" }
);

export { handler as GET, handler as POST, handler as DELETE };
