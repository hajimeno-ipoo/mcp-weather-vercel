import { readFile } from "node:fs/promises";
import path from "node:path";
import type { GeoCandidate } from "./types";

type GeoNamesRow = {
  name: string;
  asciiname: string;
  alternatenames: string;
  latitude: number;
  longitude: number;
  featureClass: string;
  featureCode: string;
  admin1Code: string;
  population: number;
  timezone: string;
};

type GeoNamesIndex = {
  rows: GeoNamesRow[];
  admin1NameByCode: Map<string, string>;
};

let geonamesJpIndexPromise: Promise<GeoNamesIndex> | null = null;

function normalizePlaceQuery(input: string) {
  return input.normalize("NFKC").trim();
}

function hasJapaneseChars(input: string) {
  return /[\u3040-\u30ff\u3400-\u9fff]/.test(input);
}

function escapeRegExp(input: string) {
  return input.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function pickBestJaName(name: string, alternatenames: string, query: string) {
  if (!alternatenames) return name;
  const alts = alternatenames.split(",");
  const queryLooksJa = hasJapaneseChars(query);

  if (queryLooksJa) {
    for (const alt of alts) {
      if (alt && alt.includes(query) && hasJapaneseChars(alt)) return alt;
    }
  }

  for (const alt of alts) {
    if (alt && hasJapaneseChars(alt)) return alt;
  }
  return name;
}

async function loadGeoNamesJpIndex(): Promise<GeoNamesIndex> {
  const filePath = path.join(process.cwd(), "JP", "JP.txt");
  const text = await readFile(filePath, "utf8");
  const rows: GeoNamesRow[] = [];
  const admin1NameByCode = new Map<string, string>();

  for (const line of text.split(/\r?\n/)) {
    if (!line) continue;
    if (line.startsWith("#")) continue;
    const cols = line.split("\t");
    if (cols.length < 19) continue;

    const name = cols[1] ?? "";
    const asciiname = cols[2] ?? "";
    const alternatenames = cols[3] ?? "";
    const latitude = Number(cols[4]);
    const longitude = Number(cols[5]);
    const featureClass = cols[6] ?? "";
    const featureCode = cols[7] ?? "";
    const admin1Code = cols[10] ?? "";
    const population = Number(cols[14] ?? 0) || 0;
    const timezone = cols[17] ?? "Asia/Tokyo";

    if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) continue;

    const row: GeoNamesRow = {
      name,
      asciiname,
      alternatenames,
      latitude,
      longitude,
      featureClass,
      featureCode,
      admin1Code,
      population,
      timezone,
    };
    rows.push(row);

    if (featureClass === "A" && featureCode === "ADM1" && admin1Code) {
      admin1NameByCode.set(admin1Code, pickBestJaName(name, alternatenames, ""));
    }
  }

  return { rows, admin1NameByCode };
}

async function getGeoNamesJpIndex() {
  if (!geonamesJpIndexPromise) {
    geonamesJpIndexPromise = loadGeoNamesJpIndex().catch((err) => {
      geonamesJpIndexPromise = null;
      throw err;
    });
  }
  return geonamesJpIndexPromise;
}

function scoreRow(row: GeoNamesRow, query: string) {
  const exactAltRe = new RegExp(`(^|,)${escapeRegExp(query)}(,|$)`);
  const altExact = row.alternatenames ? exactAltRe.test(row.alternatenames) : false;
  const altIncludes = row.alternatenames ? row.alternatenames.includes(query) : false;

  const scoreField = (value: string) => {
    if (!value) return 0;
    if (value === query) return 1000;
    if (value.startsWith(query)) return 700;
    if (value.includes(query)) return 500;
    return 0;
  };

  let score = 0;
  score = Math.max(score, scoreField(row.name), scoreField(row.asciiname));
  if (altExact) score = Math.max(score, 950);
  else if (altIncludes) score = Math.max(score, 600);

  // なるべく「地名っぽい」候補を上に
  if (row.featureClass === "P") score += 40;
  if (row.featureClass === "A") score += 60;
  if (row.featureCode === "PPLC") score += 80;
  if (row.featureCode === "PPLA") score += 60;
  if (row.featureCode === "ADM1") score += 70;

  // 人口が大きいほど上（上限つき）
  if (row.population > 0) {
    score += Math.min(200, Math.log10(row.population + 1) * 30);
  }
  return score;
}

export async function searchGeoNamesJpCandidates(place: string, count: number): Promise<GeoCandidate[]> {
  const query = normalizePlaceQuery(place);
  if (!query) return [];

  const { rows, admin1NameByCode } = await getGeoNamesJpIndex();
  const hits: Array<{ row: GeoNamesRow; score: number }> = [];

  for (const row of rows) {
    // ノイズを減らす：行政区(A) と 町/都市(P) を優先
    if (row.featureClass !== "A" && row.featureClass !== "P") continue;

    const matched =
      (row.name && row.name.includes(query)) ||
      (row.asciiname && row.asciiname.includes(query)) ||
      (row.alternatenames && row.alternatenames.includes(query));
    if (!matched) continue;

    hits.push({ row, score: scoreRow(row, query) });
  }

  hits.sort((a, b) => b.score - a.score);

  const candidates: GeoCandidate[] = [];
  for (const { row } of hits.slice(0, Math.max(0, count))) {
    const admin1 = row.admin1Code ? admin1NameByCode.get(row.admin1Code) : undefined;
    candidates.push({
      name: pickBestJaName(row.name, row.alternatenames, query),
      country: "日本",
      admin1,
      latitude: row.latitude,
      longitude: row.longitude,
      timezone: row.timezone || "Asia/Tokyo",
    });
  }

  return candidates;
}

