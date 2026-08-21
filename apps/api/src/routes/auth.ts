import { Router } from "express";
import { google } from "googleapis";
import { db } from "../db/client.js";
import { calendarConnections } from "../db/schema.js";
import { eq } from "drizzle-orm";

export const authRouter = Router();

const SCOPES = [
  "https://www.googleapis.com/auth/calendar.events",
  "https://www.googleapis.com/auth/calendar.freebusy",
];

function oauthClient() {
  return new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET,
    process.env.GOOGLE_REDIRECT_URI // e.g. http://localhost:3001/auth/google/callback
  );
}

/**
 * GET /auth/google?organizerEmail=you@company.com
 * Redirects the organizer to Google's consent screen. `state` carries
 * the organizer email through so the callback knows whose row to write.
 */
authRouter.get("/google", (req, res) => {
  const organizerEmail = req.query.organizerEmail as string;
  if (!organizerEmail) {
    return res.status(400).json({ error: "organizerEmail query param required" });
  }

  const url = oauthClient().generateAuthUrl({
    access_type: "offline", // needed to get a refresh_token
    prompt: "consent", // force refresh_token on repeat connects too
    scope: SCOPES,
    state: organizerEmail,
  });

  res.redirect(url);
});

/**
 * GET /auth/google/callback
 * Exchanges the auth code for tokens and upserts calendar_connections
 * for the organizer. This is the only place tokens are written.
 */
authRouter.get("/google/callback", async (req, res) => {
  const code = req.query.code as string;
  const organizerEmail = req.query.state as string;

  if (!code || !organizerEmail) {
    return res.status(400).send("Missing code or state");
  }

  const client = oauthClient();
  const { tokens } = await client.getToken(code);

  if (!tokens.access_token) {
    return res.status(500).send("Google didn't return an access token");
  }

  await db
    .insert(calendarConnections)
    .values({
      userEmail: organizerEmail,
      provider: "google",
      accessToken: tokens.access_token,
      refreshToken: tokens.refresh_token ?? undefined,
      expiresAt: tokens.expiry_date ? new Date(tokens.expiry_date) : undefined,
    })
    .onConflictDoUpdate({
      target: calendarConnections.userEmail,
      set: {
        accessToken: tokens.access_token,
        // Google only returns refresh_token on first consent — don't
        // overwrite an existing one with undefined on reconnect.
        ...(tokens.refresh_token ? { refreshToken: tokens.refresh_token } : {}),
        expiresAt: tokens.expiry_date ? new Date(tokens.expiry_date) : undefined,
      },
    });

  // Redirect back into the app. Swap for your actual frontend URL.
  res.redirect(process.env.WEB_APP_URL ?? "http://localhost:3000?calendar_connected=1");
});

/**
 * GET /auth/google/status?organizerEmail=...
 * Lets the frontend check "is this organizer connected" before letting
 * them submit a scheduling request.
 */
authRouter.get("/google/status", async (req, res) => {
  const organizerEmail = req.query.organizerEmail as string;
  const [conn] = await db
    .select()
    .from(calendarConnections)
    .where(eq(calendarConnections.userEmail, organizerEmail))
    .limit(1);

  res.json({ connected: Boolean(conn) });
});
