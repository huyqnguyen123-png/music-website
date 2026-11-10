import { lookupAlbumTracks } from "../../integrations/itunes/itunes.client.js";
import { importSongs } from "../../integrations/itunes/itunes.import.js";
import { albumInclude, songInclude, toAlbum, toSong } from "../../lib/dto.js";
import { notFound } from "../../lib/http-error.js";
import { prisma } from "../../lib/prisma.js";
import { TtlCache } from "../../lib/ttl-cache.js";

// Albums whose full track list we already fetched from iTunes (24h)
const syncedAlbums = new TtlCache(24 * 60 * 60 * 1000);

// Cursor pagination: fetch one extra row to know whether there is a next page
export async function listSongs(limit: number, cursor?: string) {
  const rows = await prisma.song.findMany({
    take: limit + 1,
    ...(cursor && { cursor: { id: cursor }, skip: 1 }),
    orderBy: [{ createdAt: "desc" }, { id: "asc" }],
    include: songInclude,
  });
  const hasMore = rows.length > limit;
  const items = rows.slice(0, limit).map(toSong);
  return { items, nextCursor: hasMore ? items[items.length - 1].id : null };
}

export async function getSong(id: string) {
  const song = await prisma.song.findUnique({ where: { id }, include: songInclude });
  if (!song) throw notFound("Song not found");
  return toSong(song);
}

export async function listAlbums(limit: number) {
  const albums = await prisma.album.findMany({
    take: limit,
    orderBy: { releaseDate: "desc" },
    include: albumInclude,
  });
  return albums.map(toAlbum);
}

const loadAlbum = (id: string) =>
  prisma.album.findUnique({
    where: { id },
    include: { ...albumInclude, songs: { include: songInclude, orderBy: { trackNumber: "asc" } } },
  });

export async function getAlbum(id: string) {
  let album = await loadAlbum(id);
  if (!album) throw notFound("Album not found");

  // We usually only have a few tracks of an album: fetch the rest from iTunes once
  if (!syncedAlbums.has(album.id)) {
    syncedAlbums.add(album.id);
    try {
      await importSongs(await lookupAlbumTracks(album.itunesId));
      album = (await loadAlbum(id)) ?? album;
    } catch (err) {
      console.warn("Could not sync album tracks from iTunes:", (err as Error).message);
    }
  }

  return { ...toAlbum(album), songs: album.songs.map(toSong) };
}

export async function getArtist(id: string) {
  const artist = await prisma.artist.findUnique({
    where: { id },
    include: {
      albums: { include: albumInclude, orderBy: { releaseDate: "desc" } },
      songs: { include: songInclude, orderBy: { playCount: "desc" }, take: 10 },
    },
  });
  if (!artist) throw notFound("Artist not found");
  return {
    id: artist.id,
    name: artist.name,
    imageUrl: artist.imageUrl,
    albums: artist.albums.map(toAlbum),
    popularSongs: artist.songs.map(toSong),
  };
}
