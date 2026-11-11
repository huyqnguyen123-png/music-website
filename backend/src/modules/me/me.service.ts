import { songInclude, toSong } from "../../lib/dto.js";
import { notFound } from "../../lib/http-error.js";
import { prisma } from "../../lib/prisma.js";

export async function listLikedSongs(userId: string) {
  const likes = await prisma.likedSong.findMany({
    where: { userId },
    orderBy: { createdAt: "desc" },
    include: { song: { include: songInclude } },
  });
  return likes.map((l) => ({ ...toSong(l.song), likedAt: l.createdAt }));
}

export async function listLikedIds(userId: string) {
  const likes = await prisma.likedSong.findMany({ where: { userId }, select: { songId: true } });
  return likes.map((l) => l.songId);
}

// Idempotent: liking twice is not an error
export async function likeSong(userId: string, songId: string) {
  const song = await prisma.song.findUnique({ where: { id: songId }, select: { id: true } });
  if (!song) throw notFound("Song not found");
  await prisma.likedSong.upsert({
    where: { userId_songId: { userId, songId } },
    create: { userId, songId },
    update: {},
  });
}

export async function unlikeSong(userId: string, songId: string) {
  await prisma.likedSong.deleteMany({ where: { userId, songId } });
}

// Store a play and bump the song's play counter atomically
export async function recordPlay(userId: string, songId: string) {
  const song = await prisma.song.findUnique({ where: { id: songId }, select: { id: true } });
  if (!song) throw notFound("Song not found");
  await prisma.$transaction([
    prisma.playHistory.create({ data: { userId, songId } }),
    prisma.song.update({ where: { id: songId }, data: { playCount: { increment: 1 } } }),
  ]);
}

export async function listHistory(userId: string, limit: number) {
  const rows = await prisma.playHistory.findMany({
    where: { userId },
    orderBy: { playedAt: "desc" },
    take: limit,
    include: { song: { include: songInclude } },
  });
  return rows.map((r) => ({ ...toSong(r.song), playedAt: r.playedAt }));
}

// Latest track played by each user I follow, most recent first
export async function friendsActivity(userId: string) {
  const follows = await prisma.follow.findMany({
    where: { followerId: userId },
    include: {
      following: {
        select: {
          id: true,
          displayName: true,
          avatarUrl: true,
          history: { orderBy: { playedAt: "desc" }, take: 1, include: { song: { include: songInclude } } },
        },
      },
    },
  });

  return follows
    .filter((f) => f.following.history.length > 0)
    .map(({ following: { history, ...user } }) => ({
      user,
      song: toSong(history[0].song),
      playedAt: history[0].playedAt,
    }))
    .sort((a, b) => b.playedAt.getTime() - a.playedAt.getTime());
}
