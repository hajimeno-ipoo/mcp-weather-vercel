import { NextResponse } from "next/server";
import { z } from "zod";
import { geocodeCandidates } from "../mcp/geocodeCandidates";

const CONFIG = {
  GEOCODING_API_URL:
    process.env.NEXT_PUBLIC_GEOCODING_API_URL ?? "https://geocoding-api.open-meteo.com/v1/search",
} as const;

const querySchema = z.object({
  place: z.string().min(1),
  count: z.coerce.number().int().min(1).max(20).default(20),
});

function withCors(res: NextResponse) {
  res.headers.set("Access-Control-Allow-Origin", "*");
  res.headers.set("Access-Control-Allow-Methods", "GET,OPTIONS");
  res.headers.set("Access-Control-Allow-Headers", "Content-Type");
  res.headers.set("Cache-Control", "no-store");
  return res;
}

export async function OPTIONS() {
  return withCors(new NextResponse(null, { status: 204 }));
}

export async function GET(req: Request) {
  const url = new URL(req.url);
  const parsed = querySchema.safeParse({
    place: url.searchParams.get("place") ?? "",
    count: url.searchParams.get("count") ?? undefined,
  });

  if (!parsed.success) {
    return withCors(
      NextResponse.json(
        { error: "invalid_query", details: parsed.error.flatten() },
        { status: 400 }
      )
    );
  }

  const { place, count } = parsed.data;
  const candidates = await geocodeCandidates(place, count, CONFIG.GEOCODING_API_URL);

  return withCors(
    NextResponse.json({
      kind: "geocode",
      query: place,
      candidates,
    })
  );
}

