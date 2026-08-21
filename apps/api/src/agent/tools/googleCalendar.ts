import { google } from "googleapis";
import { db } from "../../db/client.js";
import { calendarConnections } from "../../db/schema.js";
import { eq } from "drizzle-orm";
import type { BusySlot } from "../state.js";

/**
 * Only the organizer ever needs to complete OAuth (see routes/auth.ts).
 * Attendees are never asked to connect anything — they just receive a
 * normal calendar invite over email, same as any meeting.
 */
export async function getOrganizerAuthedClient(organizerEmail: string) {
  const [conn] = await db
    .select()
    .from(calendarConnections)
    .where(eq(calendarConnections.userEmail, organizerEmail))
    .limit(1);

  if (!conn) {
    throw new Error(`NO_CALENDAR_CONNECTION:${organizerEmail}`);
  }

  const auth = new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET
  );
  auth.setCredentials({
    access_token: conn.accessToken,
    refresh_token: conn.refreshToken ?? undefined,
  });

  // googleapis auto-refreshes and hands back a new access token when the
  // current one expires — persist it so we don't re-hit the refresh
  // endpoint on every call.
  auth.on("tokens", (tokens) => {
    if (tokens.access_token) {
      db.update(calendarConnections)
        .set({ accessToken: tokens.access_token })
        .where(eq(calendarConnections.userEmail, organizerEmail))
        .catch((err) => console.error("Failed to persist refreshed token", err));
    }
  });

  return auth;
}

export interface FreeBusyResult {
  busyByAttendee: Record<string, BusySlot[]>;
  inaccessible: string[]; // attendees whose calendar we couldn't see at all
}

/**
 * Single freebusy.query call, made with the organizer's token, asking
 * about every attendee (including the organizer) at once. Google fills
 * in busy blocks for any calendar it can see (same Workspace domain,
 * or a calendar explicitly shared with the organizer) and returns an
 * `errors` entry per calendar it can't — that's the normal case for
 * attendees outside the organizer's org, not a failure of our code.
 */
export async function fetchFreeBusyForAttendees(
  organizerEmail: string,
  attendeeEmails: string[],
  timeMin: string,
  timeMax: string
): Promise<FreeBusyResult> {
  const auth = await getOrganizerAuthedClient(organizerEmail);
  const calendar = google.calendar({ version: "v3", auth });

  const allEmails = Array.from(new Set([organizerEmail, ...attendeeEmails]));

  const res = await calendar.freebusy.query({
    requestBody: {
      timeMin,
      timeMax,
      items: allEmails.map((id) => ({ id })),
    },
  });

  const busyByAttendee: Record<string, BusySlot[]> = {};
  const inaccessible: string[] = [];

  for (const email of allEmails) {
    const entry = res.data.calendars?.[email];
    if (!entry || (entry.errors && entry.errors.length > 0)) {
      inaccessible.push(email);
      continue;
    }
    busyByAttendee[email] = (entry.busy ?? []).map((b) => ({
      start: b.start!,
      end: b.end!,
    }));
  }

  return { busyByAttendee, inaccessible };
}

/**
 * Creates the calendar event and sends invites to all attendees.
 * Returns the created event's id/htmlLink for the run record.
 */
export async function createCalendarEvent(params: {
  organizerEmail: string;
  title: string;
  description?: string;
  start: string;
  end: string;
  attendeeEmails: string[];
}) {
  const auth = await getOrganizerAuthedClient(params.organizerEmail);
  const calendar = google.calendar({ version: "v3", auth });

  const res = await calendar.events.insert({
    calendarId: "primary",
    sendUpdates: "all",
    requestBody: {
      summary: params.title,
      description: params.description,
      start: { dateTime: params.start },
      end: { dateTime: params.end },
      attendees: params.attendeeEmails.map((email) => ({ email })),
    },
  });

  return { eventId: res.data.id, htmlLink: res.data.htmlLink };
}