import jwt from "jsonwebtoken";
import type { Request, Response, NextFunction } from "express";

const JWT_SECRET = process.env.JWT_SECRET;
if (!JWT_SECRET) {
  throw new Error("JWT_SECRET environment variable is required");
}

// Admin tokens may use their own secret. Without ADMIN_JWT_SECRET they fall back to JWT_SECRET,
// and the tokenType check below still keeps buyer and supplier tokens out of admin routes.
const ADMIN_SECRET = process.env.ADMIN_JWT_SECRET || JWT_SECRET;

// Marks a token as an admin token. Buyer and supplier tokens never carry it.
const ADMIN_TOKEN_TYPE = "admin";

type AdminTokenPayload = {
  adminId: string;
  email: string;
  role: string;
};

export function signAdminToken(payload: AdminTokenPayload): string {
  return jwt.sign({ ...payload, tokenType: ADMIN_TOKEN_TYPE }, ADMIN_SECRET, {
    algorithm: "HS256",
    expiresIn: "1d",
  });
}

export function verifyAdminToken(token: string): AdminTokenPayload | null {
  try {
    const p = jwt.verify(token, ADMIN_SECRET, { algorithms: ["HS256"] }) as {
      adminId?: unknown;
      email?: unknown;
      role?: unknown;
      tokenType?: unknown;
    };
    // Any valid token signed with the shared secret is NOT enough: it must be an admin token.
    if (p.tokenType !== ADMIN_TOKEN_TYPE) return null;
    if (typeof p.adminId !== "string" || typeof p.email !== "string") return null;
    return {
      adminId: p.adminId,
      email: p.email,
      role: typeof p.role === "string" ? p.role : "admin",
    };
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