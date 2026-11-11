import cookieParser from "cookie-parser";
import cors from "cors";
import express from "express";
import helmet from "helmet";
import morgan from "morgan";
import { env } from "./config/env.js";
import { prisma } from "./lib/prisma.js";
import { requireAuth } from "./middleware/auth.js";
import { errorHandler, notFoundHandler } from "./middleware/error.js";
import { authRouter } from "./modules/auth/auth.routes.js";
import { albumsRouter, artistsRouter, songsRouter } from "./modules/catalog/catalog.routes.js";
import { homeRouter } from "./modules/home/home.routes.js";
import { meRouter } from "./modules/me/me.routes.js";
import { playlistsRouter } from "./modules/playlists/playlists.routes.js";
import { searchRouter } from "./modules/search/search.routes.js";

export function createApp() {
  const app = express();

  // Security headers, CORS (with cookies) and body parsing
  app.use(helmet());
  app.use(cors({ origin: env.clientOrigins, credentials: true }));
  app.use(express.json({ limit: "100kb" }));
  app.use(cookieParser());
  if (env.NODE_ENV === "development") app.use(morgan("dev"));

  // Health check: also pings the database so we know the connection works
  app.get("/api/health", async (_req, res) => {
    await prisma.$queryRaw`SELECT 1`;
    res.json({ status: "ok", database: "up", uptime: process.uptime() });
  });

  // Public routes
  app.use("/api/auth", authRouter);

  // Everything below requires a logged-in user
  app.use("/api/home", requireAuth, homeRouter);
  app.use("/api/search", requireAuth, searchRouter);
  app.use("/api/songs", requireAuth, songsRouter);
  app.use("/api/albums", requireAuth, albumsRouter);
  app.use("/api/artists", requireAuth, artistsRouter);
  app.use("/api/playlists", requireAuth, playlistsRouter);
  app.use("/api/me", requireAuth, meRouter);

  app.use(notFoundHandler);
  app.use(errorHandler);
  return app;
}
