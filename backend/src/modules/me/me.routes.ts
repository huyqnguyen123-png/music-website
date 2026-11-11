import { Router } from "express";
import { z } from "zod";
import { currentUserId } from "../../middleware/auth.js";
import { parseBody, parseQuery } from "../../middleware/validate.js";
import { listUserPlaylists } from "../playlists/playlists.service.js";
import * as me from "./me.service.js";

export const meRouter = Router();

meRouter.get("/playlists", async (req, res) => {
  res.json(await listUserPlaylists(currentUserId(req)));
});

meRouter.get("/likes", async (req, res) => {
  res.json(await me.listLikedSongs(currentUserId(req)));
});

meRouter.get("/likes/ids", async (req, res) => {
  res.json(await me.listLikedIds(currentUserId(req)));
});

meRouter.put("/likes/:songId", async (req, res) => {
  await me.likeSong(currentUserId(req), req.params.songId);
  res.status(204).end();
});

meRouter.delete("/likes/:songId", async (req, res) => {
  await me.unlikeSong(currentUserId(req), req.params.songId);
  res.status(204).end();
});

meRouter.get("/history", async (req, res) => {
  const { limit } = parseQuery(z.object({ limit: z.coerce.number().int().min(1).max(100).default(30) }), req);
  res.json(await me.listHistory(currentUserId(req), limit));
});

meRouter.post("/history", async (req, res) => {
  const { songId } = parseBody(z.object({ songId: z.string().min(1) }), req);
  await me.recordPlay(currentUserId(req), songId);
  res.status(201).json({ ok: true });
});

meRouter.get("/friends-activity", async (req, res) => {
  res.json(await me.friendsActivity(currentUserId(req)));
});
