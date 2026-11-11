import request from "supertest";
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { createApp } from "../src/app.js";
import { prisma } from "../src/lib/prisma.js";

// Integration tests against a seeded database (run `npm run db:seed` first)
const app = createApp();
const email = `test-${Date.now()}@muse.dev`;
let token = "";
let cookie: string[] = [];

beforeAll(async () => {
  const res = await request(app)
    .post("/api/auth/register")
    .send({ email, password: "supersecret", displayName: "Tester" });
  expect(res.status).toBe(201);
  token = res.body.accessToken;
  cookie = res.get("Set-Cookie") ?? [];
});

afterEach(() => {
  vi.unstubAllGlobals();
});

afterAll(async () => {
  await prisma.user.deleteMany({ where: { email } });
  await prisma.$disconnect();
});

const auth = () => ({ Authorization: `Bearer ${token}` });

describe("auth", () => {
  it("rejects duplicate emails", async () => {
    const res = await request(app)
      .post("/api/auth/register")
      .send({ email, password: "supersecret", displayName: "Tester" });
    expect(res.status).toBe(409);
  });

  it("rejects wrong password", async () => {
    const res = await request(app).post("/api/auth/login").send({ email, password: "wrong-password" });
    expect(res.status).toBe(401);
  });

  it("protects private routes", async () => {
    expect((await request(app).get("/api/home")).status).toBe(401);
  });

  it("rotates the refresh token and blocks reuse", async () => {
    const first = await request(app).post("/api/auth/refresh").set("Cookie", cookie);
    expect(first.status).toBe(200);
    expect(first.body.accessToken).toBeTruthy();

    // Using the old (now revoked) cookie again must fail
    const reused = await request(app).post("/api/auth/refresh").set("Cookie", cookie);
    expect(reused.status).toBe(401);
  });
});

describe("catalog & library", () => {
  it("returns the home feed", async () => {
    const res = await request(app).get("/api/home").set(auth());
    expect(res.status).toBe(200);
    expect(res.body.curated.length).toBeGreaterThan(0);
    expect(res.body.newReleases.length).toBeGreaterThan(0);
  });

  it("finds songs that are already in the database", async () => {
    const { body } = await request(app).get("/api/songs?limit=1").set(auth());
    const artistName = body.items[0].artist.name;

    // No network in this test: a failing iTunes must not break search
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("offline")));

    const res = await request(app).get("/api/search").query({ q: artistName }).set(auth());
    expect(res.status).toBe(200);
    expect(res.body.songs.some((s: { artist: { name: string } }) => s.artist.name === artistName)).toBe(true);
  });

  it("imports songs from iTunes when the database has no match", async () => {
    const term = `zz-test-${Date.now()}`;
    const fakeTrack = {
      wrapperType: "track",
      kind: "song",
      trackId: Date.now(),
      trackName: `${term} song`,
      artistId: Date.now() + 1,
      artistName: `${term} artist`,
      collectionId: Date.now() + 2,
      collectionName: `${term} album`,
      artworkUrl100: "https://example.com/100x100bb.jpg",
      previewUrl: "https://example.com/preview.m4a",
      trackTimeMillis: 180_000,
    };
    // Fake iTunes (one song) and Deezer (no photo) responses
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: URL) =>
        url.hostname === "itunes.apple.com"
          ? Response.json({ resultCount: 1, results: [fakeTrack] })
          : Response.json({ data: [] }),
      ),
    );

    const res = await request(app).get("/api/search").query({ q: term }).set(auth());
    expect(res.status).toBe(200);
    expect(res.body.songs[0].title).toBe(`${term} song`);
    expect(res.body.songs[0].coverUrl).toBe("https://example.com/600x600bb.jpg");

    // Clean up: deleting the artist cascades to its album and song
    await prisma.artist.deleteMany({ where: { name: `${term} artist` } });
  });

  it("likes a song idempotently", async () => {
    const { body } = await request(app).get("/api/songs?limit=1").set(auth());
    const songId = body.items[0].id;

    expect((await request(app).put(`/api/me/likes/${songId}`).set(auth())).status).toBe(204);
    expect((await request(app).put(`/api/me/likes/${songId}`).set(auth())).status).toBe(204);

    const ids = await request(app).get("/api/me/likes/ids").set(auth());
    expect(ids.body).toEqual([songId]);
  });

  it("creates a playlist and adds a song once", async () => {
    const created = await request(app).post("/api/playlists").set(auth()).send({ name: "Test mix" });
    expect(created.status).toBe(201);

    const { body } = await request(app).get("/api/songs?limit=1").set(auth());
    const add = () =>
      request(app).post(`/api/playlists/${created.body.id}/songs`).set(auth()).send({ songId: body.items[0].id });
    expect((await add()).status).toBe(201);
    expect((await add()).status).toBe(409);

    const detail = await request(app).get(`/api/playlists/${created.body.id}`).set(auth());
    expect(detail.body.songs).toHaveLength(1);
    expect(detail.body.isOwner).toBe(true);
  });

  it("forbids editing someone else's playlist", async () => {
    const home = await request(app).get("/api/home").set(auth());
    const curatedId = home.body.curated[0].id;
    const res = await request(app).delete(`/api/playlists/${curatedId}`).set(auth());
    expect(res.status).toBe(403);
  });
});
