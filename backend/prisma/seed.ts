import bcrypt from "bcryptjs";
import { searchSongs } from "../src/integrations/itunes/itunes.client.js";
import { importSongs } from "../src/integrations/itunes/itunes.import.js";
import { resizeArtwork } from "../src/lib/artwork.js";
import { prisma } from "../src/lib/prisma.js";

/**
 * Demo data: real songs imported from the iTunes Search API.
 * iTunes allows ~20 requests/minute, so this takes about a minute.
 */

const SONGS_PER_QUERY = 5;

type PlaylistSeed = { name: string; description: string; queries: string[] };

// Curated playlists shown on the home page (owned by the "Muse" editorial user)
const CURATED: PlaylistSeed[] = [
  { name: "Sunset Vibes", description: "Soft beats for golden hours", queries: ["Lord Huron", "Cigarettes After Sex"] },
  { name: "Lo-fi Study", description: "Focus. Breathe. Get things done.", queries: ["Laufey", "Joji"] },
  { name: "Rainy Day", description: "Slow songs for a calm mind", queries: ["Billie Eilish", "Bon Iver"] },
  { name: "Indie & Alternative", description: "New sounds, same feeling", queries: ["Arctic Monkeys", "The 1975"] },
  { name: "Late Night Drive", description: "For the moments that hit", queries: ["The Weeknd", "Tame Impala"] },
];

// The demo user's own playlists (sidebar)
const PERSONAL: PlaylistSeed[] = [
  { name: "Vietnamese Indie", description: "Nhạc indie Việt", queries: ["Vũ.", "Ngọt"] },
  { name: "V-Pop Hits", description: "Hit Việt nghe nhiều", queries: ["Sơn Tùng M-TP", "HIEUTHUHAI"] },
  { name: "Workout", description: "Keep moving", queries: ["Imagine Dragons"] },
  { name: "Chill Vibes", description: "Wind down", queries: ["Beach House"] },
];

const avatar = (n: number) => `https://i.pravatar.cc/150?img=${n}`;
const minutesAgo = (m: number) => new Date(Date.now() - m * 60_000);
const unique = (ids: string[]) => [...new Set(ids)];

// Search iTunes for every query, save the songs, return our song ids
async function importQueries(queries: string[]) {
  const ids: string[] = [];
  for (const query of queries) {
    const tracks = await searchSongs(query, 15);
    if (!tracks.length) console.warn(`  ! no results for "${query}"`);
    ids.push(...(await importSongs(tracks.slice(0, SONGS_PER_QUERY))));
  }
  return unique(ids);
}

async function createPlaylist(ownerId: string, seed: PlaylistSeed, songIds: string[], isCurated = false) {
  const playlist = await prisma.playlist.create({
    data: {
      name: seed.name,
      description: seed.description,
      isCurated,
      ownerId,
      songs: { create: songIds.map((songId, position) => ({ songId, position })) },
    },
  });
  console.log(`  ✓ ${seed.name} (${songIds.length} songs)`);
  return playlist;
}

async function main() {
  // Start from a clean slate (children first because of foreign keys)
  await prisma.$transaction([
    prisma.banner.deleteMany(),
    prisma.playlistSong.deleteMany(),
    prisma.likedSong.deleteMany(),
    prisma.playHistory.deleteMany(),
    prisma.follow.deleteMany(),
    prisma.refreshToken.deleteMany(),
    prisma.playlist.deleteMany(),
    prisma.song.deleteMany(),
    prisma.album.deleteMany(),
    prisma.artist.deleteMany(),
    prisma.user.deleteMany(),
  ]);

  // --- Users -------------------------------------------------------------
  const passwordHash = await bcrypt.hash("password123", 10);
  const muse = await prisma.user.create({
    data: { email: "editorial@muse.dev", displayName: "Muse", passwordHash },
  });
  const demo = await prisma.user.create({
    data: { email: "demo@muse.dev", displayName: "Demo User", avatarUrl: avatar(47), passwordHash },
  });
  const friendSeeds: [string, number][] = [
    ["Minh Anh", 32],
    ["Duy Pham", 12],
    ["Trang Nguyen", 44],
    ["Hoang Tran", 15],
  ];
  const friends = [];
  for (const [i, [name, img]] of friendSeeds.entries()) {
    friends.push(
      await prisma.user.create({
        data: { email: `friend${i + 1}@muse.dev`, displayName: name, avatarUrl: avatar(img), passwordHash },
      }),
    );
  }

  // --- Playlists with real songs from iTunes ------------------------------
  console.log("Importing songs from iTunes (about 1 minute)...");
  const curated = [];
  for (const seed of CURATED) {
    curated.push(await createPlaylist(muse.id, seed, await importQueries(seed.queries), true));
  }
  for (const seed of PERSONAL) {
    await createPlaylist(demo.id, seed, await importQueries(seed.queries));
  }

  // Extra playlists built from songs we already imported (no API calls)
  const allSongIds = (await prisma.song.findMany({ select: { id: true }, orderBy: { createdAt: "asc" } })).map((s) => s.id);
  if (!allSongIds.length) throw new Error("No songs were imported. Is iTunes reachable?");
  await createPlaylist(demo.id, { name: "Discover Weekly", description: "Made for you", queries: [] }, allSongIds.filter((_, i) => i % 3 === 0));
  await createPlaylist(demo.id, { name: "Focus", description: "Deep work", queries: [] }, allSongIds.filter((_, i) => i % 4 === 1));

  // --- Hero banners (artwork of each playlist's first song) ---------------
  const firstCover = async (playlistId: string) => {
    const first = await prisma.playlistSong.findFirst({
      where: { playlistId },
      orderBy: { position: "asc" },
      include: { song: { include: { album: true } } },
    });
    return resizeArtwork(first?.song.album?.coverUrl ?? "", 1200);
  };
  const [sunset, lofi, , , drive] = curated;
  await prisma.banner.createMany({
    data: [
      { eyebrow: "Featured", title: "Good Music for Good Days", subtitle: "Handpicked playlists, fresh releases and more — just for you.", imageUrl: await firstCover(sunset.id), playlistId: sunset.id, sortOrder: 0 },
      { eyebrow: "Tonight", title: "Late Night Drive", subtitle: "City lights, empty roads and the perfect soundtrack.", imageUrl: await firstCover(drive.id), playlistId: drive.id, sortOrder: 1 },
      { eyebrow: "Focus", title: "Lo-fi to Study To", subtitle: "Gentle beats that keep you in the zone.", imageUrl: await firstCover(lofi.id), playlistId: lofi.id, sortOrder: 2 },
    ],
  });

  // --- Likes, listening history, friends ----------------------------------
  await prisma.likedSong.createMany({
    data: allSongIds.slice(0, 12).map((songId, i) => ({ userId: demo.id, songId, createdAt: minutesAgo(i * 90) })),
  });

  // One play per song, newest first, so "Recently played" covers many albums
  await prisma.playHistory.createMany({
    data: allSongIds.slice(0, 40).map((songId, i) => ({ userId: demo.id, songId, playedAt: minutesAgo(60 * (i + 1)) })),
  });

  await prisma.follow.createMany({ data: friends.map((f) => ({ followerId: demo.id, followingId: f.id })) });
  await prisma.playHistory.createMany({
    data: friends.map((f, i) => ({
      userId: f.id,
      songId: allSongIds[(i * 7 + 3) % allSongIds.length],
      playedAt: minutesAgo([3, 12, 18, 25][i]),
    })),
  });

  const [songs, artists, albums] = await Promise.all([prisma.song.count(), prisma.artist.count(), prisma.album.count()]);
  console.log(`Done: ${songs} songs, ${albums} albums, ${artists} artists.`);
  console.log("Demo login: demo@muse.dev / password123");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
