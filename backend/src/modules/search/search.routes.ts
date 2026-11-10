import { Router } from "express";
import { z } from "zod";
import { parseQuery } from "../../middleware/validate.js";
import { search } from "./search.service.js";

const searchQuery = z.object({
  q: z.string().trim().min(1).max(100),
  limit: z.coerce.number().int().min(1).max(30).default(10),
});

export const searchRouter = Router();

searchRouter.get("/", async (req, res) => {
  const { q, limit } = parseQuery(searchQuery, req);
  res.json(await search(q, limit));
});
