import { Router, type Response } from "express";
import rateLimit from "express-rate-limit";
import { z } from "zod";
import { env } from "../../config/env.js";
import { unauthorized } from "../../lib/http-error.js";
import { currentUserId, requireAuth } from "../../middleware/auth.js";
import { parseBody } from "../../middleware/validate.js";
import * as auth from "./auth.service.js";

const REFRESH_COOKIE = "muse_rt";

const registerSchema = z.object({
  email: z.string().trim().toLowerCase().email(),
  password: z.string().min(8, "Password must be at least 8 characters").max(72),
  displayName: z.string().trim().min(2).max(40),
});
const loginSchema = z.object({
  email: z.string().trim().toLowerCase().email(),
  password: z.string().min(1),
});

// Refresh token lives in an httpOnly cookie scoped to the auth routes
function setRefreshCookie(res: Response, token: string, expires: Date) {
  res.cookie(REFRESH_COOKIE, token, {
    httpOnly: true,
    secure: env.isProd || env.COOKIE_SAME_SITE === "none",
    sameSite: env.COOKIE_SAME_SITE,
    path: "/api/auth",
    expires,
  });
}

// Limit brute-force attempts on credential endpoints
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 30,
  standardHeaders: "draft-8",
  legacyHeaders: false,
  skip: () => env.NODE_ENV === "test",
});

export const authRouter = Router();

authRouter.post("/register", authLimiter, async (req, res) => {
  const { user, accessToken, refreshToken, refreshExpiresAt } = await auth.register(parseBody(registerSchema, req));
  setRefreshCookie(res, refreshToken, refreshExpiresAt);
  res.status(201).json({ user, accessToken });
});

authRouter.post("/login", authLimiter, async (req, res) => {
  const { user, accessToken, refreshToken, refreshExpiresAt } = await auth.login(parseBody(loginSchema, req));
  setRefreshCookie(res, refreshToken, refreshExpiresAt);
  res.json({ user, accessToken });
});

authRouter.post("/refresh", async (req, res) => {
  const token = req.cookies?.[REFRESH_COOKIE];
  if (!token) throw unauthorized("No session");
  const { user, accessToken, refreshToken, refreshExpiresAt } = await auth.refresh(token);
  setRefreshCookie(res, refreshToken, refreshExpiresAt);
  res.json({ user, accessToken });
});

authRouter.post("/logout", async (req, res) => {
  await auth.logout(req.cookies?.[REFRESH_COOKIE]);
  res.clearCookie(REFRESH_COOKIE, { path: "/api/auth" });
  res.status(204).end();
});

authRouter.get("/me", requireAuth, async (req, res) => {
  res.json({ user: await auth.getUser(currentUserId(req)) });
});
