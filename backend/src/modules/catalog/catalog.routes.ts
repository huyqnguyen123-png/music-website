import { Router } from "express";
import { z } from "zod";
import { parseQuery } from "../../middleware/validate.js";
import * as catalog from "./catalog.service.js";

const listQuery = z.object({
  limit: z.coerce.number().int().min(1).max(50).default(20),
  cursor: z.string().optional(),
});

export const songsRouter = Router();

songsRouter.get("/", async (req, res) => {
  const { limit, cursor } = parseQuery(listQuery, req);
  res.json(await catalog.listSongs(limit, cursor));
});

songsRouter.get("/:id", async (req, res) => {
  res.json(await catalog.getSong(req.params.id));
});

export const albumsRouter = Router();

albumsRouter.get("/", async (req, res) => {
  const { limit } = parseQuery(listQuery, req);
  res.json(await catalog.listAlbums(limit));
});

albumsRouter.get("/:id", async (req, res) => {
  res.json(await catalog.getAlbum(req.params.id));
});

export const artistsRouter = Router();

artistsRouter.get("/:id", async (req, res) => {
  res.json(await catalog.getArtist(req.params.id));
});
