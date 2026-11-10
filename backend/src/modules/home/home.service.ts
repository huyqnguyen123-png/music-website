import { albumInclude, playlistSummaryInclude, toAlbum, toPlaylistSummary } from "../../lib/dto.js";
import { prisma } from "../../lib/prisma.js";

// Everything the home page needs in a single request
export async function getHome(userId: string) {
  const [banners, curated, history, newReleases] = await Promise.all([
    prisma.banner.findMany({ orderBy: { sortOrder: "asc" } }),
    prisma.playlist.findMany({
      where: { isCurated: true },
      orderBy: { createdAt: "asc" },
      include: playlistSummaryInclude,
    }),
    prisma.playHistory.findMany({
      where: { userId },
      orderBy: { playedAt: "desc" },
      take: 60,
      include: { song: { include: { album: { include: albumInclude } } } },
    }),
    prisma.album.findMany({ orderBy: { releaseDate: "desc" }, take: 10, include: albumInclude }),
  ]);

  // Turn recent plays into a de-duplicated list of albums
  const seen = new Set<string>();
  const recentlyPlayed = [];
  for (const { song } of history) {
    if (!song.album || seen.has(song.album.id)) continue;
    seen.add(song.album.id);
    recentlyPlayed.push(toAlbum(song.album));
    if (recentlyPlayed.length === 10) break;
  }

  return {
    banners: banners.map(({ sortOrder: _, ...b }) => b),
    curated: curated.map(toPlaylistSummary),
    recentlyPlayed,
    newReleases: newReleases.map(toAlbum),
  };
}
