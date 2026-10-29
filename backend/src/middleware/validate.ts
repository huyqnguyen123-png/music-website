import type { Request } from "express";
import type { ZodTypeAny, z } from "zod";

// Parse and type request input; ZodError is handled by the error middleware
export const parseBody = <T extends ZodTypeAny>(schema: T, req: Request): z.infer<T> =>
  schema.parse(req.body);

export const parseQuery = <T extends ZodTypeAny>(schema: T, req: Request): z.infer<T> =>
  schema.parse(req.query);
