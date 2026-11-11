import { playlistSummaryInclude, songInclude, toPlaylistSummary, toSong } from "../../lib/dto.js";
import { conflict, forbidden, notFound } from "../../lib/http-error.js";
import { prisma } from "../../lib/prisma.js";

// Loads a playlist and makes sure the user is allowed to modify it
async function getOwnedPlaylist(id: string, userId: string) {
  const playlist = await prisma.playlist.findUnique({ where: { id } });
  if (!playlist) throw notFound("Playlist not found");
  if (playlist.ownerId !== userId) throw forbidden("You can only edit your own playlists");
  return playlist;
}

export async function getPlaylist(id: string, userId: string) {
  const playlist = await prisma.playlist.findUnique({
    where: { id },
    include: {
      ...playlistSummaryInclude,
      songs: { orderBy: { position: "asc" }, include: { song: { include: songInclude } } },
    },
  });
  if (!playlist || (!playlist.isPublic && playlist.ownerId !== userId)) throw notFound("Playlist not found");

  const songs = playlist.songs.map((ps) => toSong(ps.song));
  return {
    ...toPlaylistSummary({ ...playlist, songs: playlist.songs.slice(0, 1) }),
    isOwner: playlist.ownerId === userId,
    totalDurationSec: songs.reduce((sum, s) => sum + s.durationSec, 0),
    songs,
  };
}

export async function listUserPlaylists(userId: string) {
  const playlists = await prisma.playlist.findMany({
    where: { ownerId: userId },
    orderBy: { createdAt: "asc" },
    include: playlistSummaryInclude,
  });
  return playlists.map(toPlaylistSummary);
}

export async function createPlaylist(userId: string, input: { name?: string; description?: string }) {
  const count = await prisma.playlist.count({ where: { ownerId: userId } });
  const playlist = await prisma.playlist.create({
    data: { ownerId: userId, name: input.name ?? `My Playlist #${count + 1}`, description: input.description },
    include: playlistSummaryInclude,
  });
  return toPlaylistSummary(playlist);
}

export async function updatePlaylist(id: string, userId: string, input: { name?: string; description?: string | null }) {
  await getOwnedPlaylist(id, userId);
  const playlist = await prisma.playlist.update({ where: { id }, data: input, include: playlistSummaryInclude });
  return toPlaylistSummary(playlist);
}

export async function deletePlaylist(id: string, userId: string) {
  await getOwnedPlaylist(id, userId);
  await prisma.playlist.delete({ where: { id } });
}

export async function addSong(id: string, userId: string, songId: string) {
  await getOwnedPlaylist(id, userId);
  const song = await prisma.song.findUnique({ where: { id: songId } });
  if (!song) throw notFound("Song not found");

  const exists = await prisma.playlistSong.findUnique({ where: { playlistId_songId: { playlistId: id, songId } } });
  if (exists) throw conflict("Song is already in this playlist");

  // Append to the end of the playlist
  const last = await prisma.playlistSong.aggregate({ where: { playlistId: id }, _max: { position: true } });
  await prisma.playlistSong.create({
    data: { playlistId: id, songId, position: (last._max.position ?? -1) + 1 },
  });
}

export async function removeSong(id: string, userId: string, songId: string) {
  await getOwnedPlaylist(id, userId);
  await prisma.playlistSong.deleteMany({ where: { playlistId: id, songId } });
}
