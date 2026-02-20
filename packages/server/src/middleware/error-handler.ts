import type { Request, Response, NextFunction } from "express";
import { ValidateError } from "@tsoa/runtime";

export function errorHandler(
  err: unknown,
  _req: Request,
  res: Response,
  next: NextFunction,
): void {
  if (err instanceof ValidateError) {
    console.warn(`[validation] ${JSON.stringify(err.fields)}`);
    res.status(422).json({
      message: "Validation failed",
      details: err.fields,
    });
    return;
  }

  if (err instanceof Error) {
    console.error(`[error] ${err.message}`);
    const status = (err as unknown as { status?: number })["status"] ?? 500;
    res.status(status).json({ message: err.message });
    return;
  }

  next();
}
