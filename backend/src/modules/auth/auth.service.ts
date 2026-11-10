import bcrypt from "bcryptjs";
import { env } from "../../config/env.js";
import { conflict, unauthorized } from "../../lib/http-error.js";
import { prisma } from "../../lib/prisma.js";
import { generateRefreshToken, hashToken, signAccessToken } from "../../lib/tokens.js";

const publicUser = { id: true, email: true, displayName: true, avatarUrl: true } as const;

// Creates an access token + a stored (hashed) refresh token for a user
async function issueTokens(userId: string) {
  const refreshToken = generateRefreshToken();
  const expiresAt = new Date(Date.now() + env.REFRESH_TOKEN_TTL_DAYS * 86_400_000);
  await prisma.refreshToken.create({ data: { userId, tokenHash: hashToken(refreshToken), expiresAt } });
  return { accessToken: signAccessToken(userId), refreshToken, refreshExpiresAt: expiresAt };
}

export async function register(input: { email: string; password: string; displayName: string }) {
  const exists = await prisma.user.findUnique({ where: { email: input.email } });
  if (exists) throw conflict("Email is already registered");

  const user = await prisma.user.create({
    data: {
      email: input.email,
      displayName: input.displayName,
      passwordHash: await bcrypt.hash(input.password, 10),
    },
    select: publicUser,
  });
  return { user, ...(await issueTokens(user.id)) };
}

export async function login(input: { email: string; password: string }) {
  const user = await prisma.user.findUnique({ where: { email: input.email } });
  // Same error for unknown email and wrong password (don't leak which one)
  if (!user || !(await bcrypt.compare(input.password, user.passwordHash))) {
    throw unauthorized("Invalid email or password");
  }
  const { passwordHash: _, createdAt: __, ...safeUser } = user;
  return { user: safeUser, ...(await issueTokens(user.id)) };
}

// Refresh token rotation: the old token is revoked and a new pair is issued
export async function refresh(token: string) {
  const stored = await prisma.refreshToken.findUnique({ where: { tokenHash: hashToken(token) } });
  if (!stored || stored.expiresAt < new Date()) throw unauthorized("Session expired");

  if (stored.revokedAt) {
    // A revoked token was reused → possible theft, kill every session of this user
    await prisma.refreshToken.updateMany({
      where: { userId: stored.userId, revokedAt: null },
      data: { revokedAt: new Date() },
    });
    throw unauthorized("Session expired");
  }

  await prisma.refreshToken.update({ where: { id: stored.id }, data: { revokedAt: new Date() } });
  const user = await prisma.user.findUniqueOrThrow({ where: { id: stored.userId }, select: publicUser });
  return { user, ...(await issueTokens(user.id)) };
}

export async function logout(token: string | undefined) {
  if (!token) return;
  await prisma.refreshToken.updateMany({
    where: { tokenHash: hashToken(token), revokedAt: null },
    data: { revokedAt: new Date() },
  });
}

export const getUser = (id: string) =>
  prisma.user.findUniqueOrThrow({ where: { id }, select: publicUser });
