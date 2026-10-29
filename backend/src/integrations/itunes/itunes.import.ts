import { resizeArtwork } from "../../lib/artwork.js";
import { prisma } from "../../lib/prisma.js";
import { findArtistImage } from "../deezer/deezer.client.js";
import type { ItunesSong } from "./itunes.client.js";

// Create the artist once; new artists get a photo from Deezer (or the track's artwork)
async function upsertArtist(track: ItunesSong) {
  const itunesId = String(track.artistId);
  const existing = await prisma.artist.findUnique({ where: { itunesId } });
  if (existing) return existing;

  const imageUrl =
    (await findArtistImage(track.artistName)) ??
    (track.artworkUrl100 ? resizeArtwork(track.artworkUrl100, 600) : null);

  return prisma.artist.upsert({
    where: { itunesId },
    create: { itunesId, name: track.artistName, imageUrl },
    update: {},
  });
}

async function upsertAlbum(track: ItunesSong, artistId: string) {
  if (!track.collectionId) return null;
  const itunesId = String(track.collectionId);

  return prisma.album.upsert({
    where: { itunesId },
    create: {
      itunesId,
      title: track.collectionName ?? track.trackName,
      coverUrl: track.artworkUrl100 ? resizeArtwork(track.artworkUrl100, 600) : "",
      releaseDate: track.releaseDate ? new Date(track.releaseDate) : new Date(),
      genre: track.primaryGenreName,
      artistId,
    },
    update: {},
  });
}

/**
 * Save iTunes songs into our database (artist → album → song).
 * Upserting by itunesId makes it safe to import the same song many times.
 * Returns our song ids in the same order as the input.
 */
export async function importSongs(tracks: ItunesSong[]) {
  const ids: string[] = [];

  // Sequential on purpose: keeps external API calls and DB writes predictable
  for (const track of tracks) {
    const artist = await upsertArtist(track);
    const album = await upsertAlbum(track, artist.id);

    const song = await prisma.song.upsert({
      where: { itunesId: String(track.trackId) },
      create: {
        itunesId: String(track.trackId),
        title: track.trackName,
        durationSec: Math.round((track.trackTimeMillis ?? 30_000) / 1000),
        previewUrl: track.previewUrl,
        externalUrl: track.trackViewUrl,
        genre: track.primaryGenreName,
        trackNumber: track.trackNumber ?? 1,
        artistId: artist.id,
        albumId: album?.id,
      },
      // Preview links can change over time, so refresh them on re-import
      update: { previewUrl: track.previewUrl },
    });
    ids.push(song.id);
  }

  return ids;
}
