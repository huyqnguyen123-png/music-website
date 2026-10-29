import { z } from "zod";

const responseSchema = z.object({
  data: z.array(z.object({ name: z.string(), picture_xl: z.string().nullish() })),
});

// Compare names ignoring case and accents ("Beyoncé" === "beyonce")
const normalize = (name: string) =>
  name.normalize("NFKD").replace(/\p{Diacritic}/gu, "").toLowerCase().trim();

// Returns a large artist photo from Deezer, or null when there is no confident match
export async function findArtistImage(name: string): Promise<string | null> {
  try {
    const url = new URL("https://api.deezer.com/search/artist");
    url.searchParams.set("q", name);
    url.searchParams.set("limit", "5");

    const res = await fetch(url, { signal: AbortSignal.timeout(8_000) });
    if (!res.ok) return null;

    const parsed = responseSchema.safeParse(await res.json());
    if (!parsed.success) return null;

    const match = parsed.data.data.find((artist) => normalize(artist.name) === normalize(name));
    const picture = match?.picture_xl;
    // Deezer uses a grey placeholder (".../artist//...") when it has no photo
    return picture && !picture.includes("/artist//") ? picture : null;
  } catch {
    // A missing photo should never break an import
    return null;
  }
}
