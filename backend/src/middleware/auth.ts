import type { RequestHandler } from "express";
import { unauthorized } from "../lib/http-error.js";
import { verifyAccessToken } from "../lib/tokens.js";

// Rejects requests without a valid "Authorization: Bearer <token>" header
export const requireAuth: RequestHandler = (req, _res, next) => {
  const header = req.headers.authorization;
  if (!header?.startsWith("Bearer ")) throw unauthorized("Missing access token");

  try {
    req.userId = verifyAccessToken(header.slice(7)).sub;
    next();
  } catch {
    throw unauthorized("Invalid or expired access token");
  }
};

// Helper for route handlers that run after requireAuth
export const currentUserId = (req: Parameters<RequestHandler>[0]) => {
  if (!req.userId) throw unauthorized();
  return req.userId;
};
