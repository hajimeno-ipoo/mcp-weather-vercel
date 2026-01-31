import type { GeoCandidate, OpenMeteoGeocodingResponse } from "./types";
import { APIError } from "./types";
import { geocodeCache, generateGeocodeKey } from "./cache";
import { searchGeoNamesJpCandidates } from "./geonamesJp";

function dedupeByLatLon(candidates: GeoCandidate[]): GeoCandidate[] {
  const seen = new Set<string>();
  const out: GeoCandidate[] = [];
  for (const c of candidates) {
    const lat = typeof c.latitude === "number" && Number.isFinite(c.latitude) ? c.latitude : null;
    const lon = typeof c.longitude === "number" && Number.isFinite(c.longitude) ? c.longitude : null;
    const key = lat === null || lon === null ? "" : `${lat.toFixed(6)},${lon.toFixed(6)}`;
    if (key && seen.has(key)) continue;
    if (key) seen.add(key);
    out.push(c);
  }
  return out;
}

export async function geocodeCandidates(
  place: string,
  count: number,
  geocodingApiUrl: string
): Promise<GeoCandidate[]> {
  const cacheKey = generateGeocodeKey(place, count);
  const cached = geocodeCache.get(cacheKey);
  if (cached) return cached;

  // 1) ローカルGeoNames(JP/JP.txt)で部分一致検索
  try {
    const local = await searchGeoNamesJpCandidates(place, count);
    if (local.length > 0) {
      const deduped = dedupeByLatLon(local);
      geocodeCache.set(cacheKey, deduped);
      return deduped;
    }
  } catch {
    // ローカルが読めない/壊れてても、リモートにフォールバック
  }

  const fetchOpenMeteo = async (language: "ja" | "en") => {
    const url = new URL(geocodingApiUrl);
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
    const deduped = dedupeByLatLon(ja);
    geocodeCache.set(cacheKey, deduped);
    return deduped;
  }
  const en = await fetchOpenMeteo("en");
  const deduped = dedupeByLatLon(en);
  geocodeCache.set(cacheKey, deduped);
  return deduped;
}
