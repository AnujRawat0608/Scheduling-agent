import jwt from "jsonwebtoken";
import type { Request, Response, NextFunction } from "express";
import { signSupplierToken, requireSupplierAuth } from "../agent/lib/supplierAuth.js";
import { signProcurerToken, requireProcurerAuth } from "../agent/lib/procurerAuth.js";
import { signAdminToken, requireAdminAuth, verifyAdminToken } from "../agent/lib/adminAuth.js";

type Middleware = (req: Request, res: Response, next: NextFunction) => unknown;

/** Runs a middleware with a fake request. Returns "allowed" if next() was called, else the HTTP status. */
function probe(middleware: Middleware, token: string | null): "allowed" | number {
  let status = 0;
  let allowed = false;
  const req = { headers: token ? { authorization: `Bearer ${token}` } : {} } as unknown as Request;
  const res = {
    status(code: number) {
      status = code;
      return this;
    },
    json() {
      return this;
    },
  } as unknown as Response;
  middleware(req, res, () => {
    allowed = true;
  });
  return allowed ? "allowed" : status;
}

export function runAuthEvals() {
  console.log("\n=== Auth separation evals (deterministic) ===\n");
  let passed = 0;
  let failed = 0;

  const check = (name: string, ok: boolean, detail = "") => {
    if (ok) {
      passed++;
      console.log(`  PASS  ${name}`);
    } else {
      failed++;
      console.log(`  FAIL  ${name}${detail ? ` - ${detail}` : ""}`);
    }
  };

  const tokens = {
    supplier: signSupplierToken({ supplierId: "supplier-1", email: "s@example.com" }),
    buyer: signProcurerToken({ procurerId: "buyer-1", email: "b@example.com" }),
    admin: signAdminToken({ adminId: "admin-1", email: "a@example.com", role: "admin" }),
  };

  // Each kind of route must accept only its own kind of token.
  const guards: [string, Middleware, keyof typeof tokens][] = [
    ["supplier routes", requireSupplierAuth, "supplier"],
    ["buyer routes", requireProcurerAuth, "buyer"],
    ["admin routes", requireAdminAuth, "admin"],
  ];

  for (const [guardName, guard, owner] of guards) {
    for (const [tokenName, token] of Object.entries(tokens)) {
      const result = probe(guard, token);
      if (tokenName === owner) {
        check(`${guardName} accept ${tokenName} token`, result === "allowed", `got ${result}`);
      } else {
        check(`${guardName} reject ${tokenName} token`, result === 401, `got ${result}`);
      }
    }
    check(`${guardName} reject missing token`, probe(guard, null) === 401);
    check(`${guardName} reject garbage token`, probe(guard, "not-a-token") === 401);
  }

  // An old-style admin token (no tokenType) and a token signed with another secret must both fail.
  const legacyAdminToken = jwt.sign(
    { adminId: "admin-1", email: "a@example.com", role: "admin" },
    process.env.JWT_SECRET as string,
    { expiresIn: "1h" }
  );
  check("admin routes reject token without tokenType", verifyAdminToken(legacyAdminToken) === null);

  const foreignToken = jwt.sign(
    { adminId: "admin-1", email: "a@example.com", role: "admin", tokenType: "admin" },
    "some-other-secret",
    { expiresIn: "1h" }
  );
  check("admin routes reject token signed with another secret", verifyAdminToken(foreignToken) === null);

  console.log(`\n  ${passed} passed, ${failed} failed\n`);
  return { passed, failed };
}