import crypto from "node:crypto";
import jwt, { type SignOptions } from "jsonwebtoken";
import { env } from "../config/env.js";

type AccessPayload = { sub: string };

// Short-lived JWT sent in the Authorization header
export const signAccessToken = (userId: string) =>
  jwt.sign({ sub: userId } satisfies AccessPayload, env.JWT_ACCESS_SECRET, {
    expiresIn: env.ACCESS_TOKEN_TTL as SignOptions["expiresIn"],
  });

export const verifyAccessToken = (token: string) =>
  jwt.verify(token, env.JWT_ACCESS_SECRET) as AccessPayload;

// Refresh tokens are opaque random strings; only their SHA-256 hash is stored
export const generateRefreshToken = () => crypto.randomBytes(48).toString("hex");
export const hashToken = (token: string) => crypto.createHash("sha256").update(token).digest("hex");
