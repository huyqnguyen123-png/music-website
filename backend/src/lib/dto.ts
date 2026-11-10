import type { Prisma } from "@prisma/client";

// Prisma "include" fragments + mappers that shape DB rows into API responses

export const songInclude = {
  artist: { select: { id: true, name: true } },
  album: { select: { id: true, title: true, coverUrl: true } },
} satisfies Prisma.SongInclude;

type SongRow = Prisma.SongGetPayload<{ include: typeof songInclude }>;

export const toSong = (s: SongRow) => ({
  id: s.id,
  title: s.title,
  durationSec: s.durationSec,
  previewUrl: s.previewUrl,
  externalUrl: s.externalUrl,
  coverUrl: s.album?.coverUrl || null,
  artist: s.artist,
  album: s.album ? { id: s.album.id, title: s.album.title } : null,
});

export const albumInclude = {
  artist: { select: { id: true, name: true } },
} satisfies Prisma.AlbumInclude;

type AlbumRow = Prisma.AlbumGetPayload<{ include: typeof albumInclude }>;

export const toAlbum = (a: AlbumRow) => ({
  id: a.id,
  title: a.title,
  coverUrl: a.coverUrl || null,
  releaseDate: a.releaseDate,
  genre: a.genre,
  artist: a.artist,
});

export const playlistSummaryInclude = {
  owner: { select: { id: true, displayName: true } },
  _count: { select: { songs: true } },
  // First track's album cover is used when the playlist has no cover
  songs: {
    take: 1,
    orderBy: { position: "asc" },
    select: { song: { select: { album: { select: { coverUrl: true } } } } },
  },
} satisfies Prisma.PlaylistInclude;

type PlaylistRow = Prisma.PlaylistGetPayload<{ include: typeof playlistSummaryInclude }>;

export const toPlaylistSummary = (p: PlaylistRow) => ({
  id: p.id,
  name: p.name,
  description: p.description,
  coverUrl: p.coverUrl || p.songs[0]?.song.album?.coverUrl || null,
  isCurated: p.isCurated,
  owner: p.owner,
  songCount: p._count.songs,
});
