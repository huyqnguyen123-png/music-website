import { Router } from "express";
import { z } from "zod";
import { currentUserId } from "../../middleware/auth.js";
import { parseBody } from "../../middleware/validate.js";
import * as playlists from "./playlists.service.js";

const createSchema = z.object({
  name: z.string().trim().min(1).max(100).optional(),
  description: z.string().trim().max(300).optional(),
});
const updateSchema = z.object({
  name: z.string().trim().min(1).max(100).optional(),
  description: z.string().trim().max(300).nullable().optional(),
});
const addSongSchema = z.object({ songId: z.string().min(1) });

export const playlistsRouter = Router();

playlistsRouter.get("/:id", async (req, res) => {
  res.json(await playlists.getPlaylist(req.params.id, currentUserId(req)));
});

playlistsRouter.post("/", async (req, res) => {
  res.status(201).json(await playlists.createPlaylist(currentUserId(req), parseBody(createSchema, req)));
});

playlistsRouter.patch("/:id", async (req, res) => {
  res.json(await playlists.updatePlaylist(req.params.id, currentUserId(req), parseBody(updateSchema, req)));
});

playlistsRouter.delete("/:id", async (req, res) => {
  await playlists.deletePlaylist(req.params.id, currentUserId(req));
  res.status(204).end();
});

playlistsRouter.post("/:id/songs", async (req, res) => {
  const { songId } = parseBody(addSongSchema, req);
  await playlists.addSong(req.params.id, currentUserId(req), songId);
  res.status(201).json({ ok: true });
});

playlistsRouter.delete("/:id/songs/:songId", async (req, res) => {
  await playlists.removeSong(req.params.id, currentUserId(req), req.params.songId);
  res.status(204).end();
});
