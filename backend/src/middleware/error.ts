import type { ErrorRequestHandler, RequestHandler } from "express";
import { ZodError } from "zod";
import { HttpError } from "../lib/http-error.js";

export const notFoundHandler: RequestHandler = (req, res) => {
  res.status(404).json({ error: { message: `Route ${req.method} ${req.path} not found` } });
};

// Central error handler: every thrown error ends up here with a consistent JSON shape
export const errorHandler: ErrorRequestHandler = (err, _req, res, _next) => {
  if (err instanceof HttpError) {
    res.status(err.status).json({ error: { message: err.message, details: err.details } });
    return;
  }
  if (err instanceof ZodError) {
    res.status(400).json({ error: { message: "Validation failed", details: err.flatten().fieldErrors } });
    return;
  }
  console.error(err);
  res.status(500).json({ error: { message: "Internal server error" } });
};
