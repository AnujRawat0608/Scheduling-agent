import jwt from "jsonwebtoken";
import type { Request, Response, NextFunction } from "express";

const JWT_SECRET = process.env.JWT_SECRET;
if (!JWT_SECRET) {
  throw new Error("JWT_SECRET environment variable is required");
}

type AdminTokenPayload = {
  adminId: string;
  email: string;
  role: string;
};

export function signAdminToken(payload: AdminTokenPayload): string {
  return jwt.sign(payload, JWT_SECRET as string, { expiresIn: "7d" });
}

export function verifyAdminToken(token: string): AdminTokenPayload | null {
  try {
    return jwt.verify(token, JWT_SECRET as string) as AdminTokenPayload;
  } catch {
    return null;
  }
}

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      admin?: AdminTokenPayload;
    }
  }
}

/**
 * Middleware for routes that require a logged-in admin. On success,
 * attaches `req.admin = { adminId, email, role }`. On failure, responds
 * 401 and does not call next().
 */
export function requireAdminAuth(req: Request, res: Response, next: NextFunction) {
  const authHeader = req.headers.authorization;
  const token = authHeader?.startsWith("Bearer ") ? authHeader.slice(7) : null;

  if (!token) {
    return res.status(401).json({ error: "Not logged in" });
  }

  const payload = verifyAdminToken(token);
  if (!payload) {
    return res.status(401).json({ error: "Session expired or invalid" });
  }

  req.admin = payload;
  next();
}