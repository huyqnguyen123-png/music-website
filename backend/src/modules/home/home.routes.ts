import { Router } from "express";
import { currentUserId } from "../../middleware/auth.js";
import { getHome } from "./home.service.js";

export const homeRouter = Router();

homeRouter.get("/", async (req, res) => {
  res.json(await getHome(currentUserId(req)));
});
