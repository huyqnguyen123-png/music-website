import { z } from "zod";
import { env } from "../../config/env.js";

const BASE_URL = "https://itunes.apple.com";
// iTunes allows roughly 20 requests per minute, so keep 3 seconds between calls
const MIN_INTERVAL_MS = 3000;

// Only the fields we use; everything else in the response is ignored
const trackSchema = z.object({
  wrapperType: z.literal("track"),
  kind: z.string().optional(),
  trackId: z.number(),
  trackName: z.string(),
  artistId: z.number(),
  artistName: z.string(),
  collectionId: z.number().optional(),
  collectionName: z.string().optional(),
  artworkUrl100: z.string().optional(),
  previewUrl: z.string().optional(),
  trackTimeMillis: z.number().optional(),
  trackNumber: z.number().optional(),
  releaseDate: z.string().optional(),
  primaryGenreName: z.string().optional(),
  trackViewUrl: z.string().optional(),
});

const responseSchema = z.object({
  resultCount: z.number(),
  results: z.array(z.unknown()),
});

export type ItunesSong = z.infer<typeof trackSchema> & { previewUrl: string };

// Simple rate limiter: each call reserves the next free time slot
let nextSlot = 0;
async function waitForSlot() {
  const now = Date.now();
  const wait = Math.max(0, nextSlot - now);
  nextSlot = Math.max(now, nextSlot) + MIN_INTERVAL_MS;
  if (wait > 0) await new Promise((resolve) => setTimeout(resolve, wait));
}

async function request(path: string, params: Record<string, string | number>, retry = true): Promise<unknown[]> {
  await waitForSlot();

  const url = new URL(path, BASE_URL);
  for (const [key, value] of Object.entries(params)) url.searchParams.set(key, String(value));
  url.searchParams.set("country", env.ITUNES_COUNTRY);

  const res = await fetch(url, { signal: AbortSignal.timeout(10_000) });

  // 403/429 means we hit the rate limit: wait a bit and try once more
  if ((res.status === 403 || res.status === 429) && retry) {
    await new Promise((resolve) => setTimeout(resolve, 15_000));
    return request(path, params, false);
  }
  if (!res.ok) throw new Error(`iTunes request failed with status ${res.status}`);

  return responseSchema.parse(await res.json()).results;
}

// Keep only playable songs (iTunes also returns artists, albums, videos…)
function onlySongs(results: unknown[]): ItunesSong[] {
  return results.flatMap((item) => {
    const parsed = trackSchema.safeParse(item);
    if (!parsed.success || parsed.data.kind !== "song" || !parsed.data.previewUrl) return [];
    return [{ ...parsed.data, previewUrl: parsed.data.previewUrl }];
  });
}

export async function searchSongs(term: string, limit = 25) {
  return onlySongs(await request("/search", { term, media: "music", entity: "song", limit }));
}

export async function lookupAlbumTracks(collectionId: string) {
  return onlySongs(await request("/lookup", { id: collectionId, entity: "song" }));
}
