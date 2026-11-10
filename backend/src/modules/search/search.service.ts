import { searchSongs } from "../../integrations/itunes/itunes.client.js";
import { importSongs } from "../../integrations/itunes/itunes.import.js";
import {
  albumInclude,
  playlistSummaryInclude,
  songInclude,
  toAlbum,
  toPlaylistSummary,
  toSong,
} from "../../lib/dto.js";
import { prisma } from "../../lib/prisma.js";
import { TtlCache } from "../../lib/ttl-cache.js";

// Below this many local songs we also ask iTunes
const MIN_LOCAL_RESULTS = 5;
// Search terms already fetched from iTunes recently (24h)
const fetchedTerms = new TtlCache(24 * 60 * 60 * 1000);

// Case-insensitive substring search (ILIKE) across our own catalog
async function searchLocal(q: string, limit: number) {
  const contains = { contains: q, mode: "insensitive" as const };

  const [songs, artists, albums, playlists] = await Promise.all([
    prisma.song.findMany({
      where: { OR: [{ title: contains }, { artist: { name: contains } }, { album: { title: contains } }] },
      orderBy: { playCount: "desc" },
      take: limit,
      include: songInclude,
    }),
    prisma.artist.findMany({ where: { name: contains }, take: limit, select: { id: true, name: true, imageUrl: true } }),
    prisma.album.findMany({
      where: { OR: [{ title: contains }, { artist: { name: contains } }] },
      take: limit,
      include: albumInclude,
    }),
    prisma.playlist.findMany({
      where: { isPublic: true, OR: [{ name: contains }, { description: contains }] },
      take: limit,
      include: playlistSummaryInclude,
    }),
  ]);

  return {
    songs: songs.map(toSong),
    artists,
    albums: albums.map(toAlbum),
    playlists: playlists.map(toPlaylistSummary),
  };
}

/**
 * Read-through cache: search our database first; if it has few results,
 * import matching songs from iTunes once per term and search again.
 */
export async function search(q: string, limit: number) {
  const local = await searchLocal(q, limit);

  const term = q.toLowerCase();
  if (local.songs.length >= MIN_LOCAL_RESULTS || q.length < 3 || fetchedTerms.has(term)) {
    return local;
  }

  fetchedTerms.add(term);
  try {
    const tracks = await searchSongs(q, 15);
    if (!tracks.length) return local;
    await importSongs(tracks.slice(0, 10));
    return await searchLocal(q, limit);
  } catch (err) {
    // iTunes down or rate limited: local results are still a valid answer
    console.warn("iTunes search failed:", (err as Error).message);
    return local;
  }
}
