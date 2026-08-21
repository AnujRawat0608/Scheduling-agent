import { addDays, formatISO } from "date-fns";
import { fetchFreeBusyForAttendees } from "../tools/googleCalendar.js";
import type { SchedulingStateType } from "../state.js";

/**
 * Only the organizer needs a connected calendar. We ask Google for
 * free/busy on every attendee anyway (via the organizer's token) —
 * Google fills in what it can see (same-domain colleagues, shared
 * calendars) and reports the rest as inaccessible. That's not a
 * failure; it's just information the human sees before approving.
 */
export async function fetchCalendars(state: SchedulingStateType) {
  const { request } = state;
  const organizerEmail = request.organizer.email;
  const attendeeEmails = request.attendees.map((a) => a.email);

  const timeMin = request.earliestStart ?? formatISO(new Date());
  const timeMax = formatISO(addDays(new Date(timeMin), 14)); // 2-week search window

  try {
    const { busyByAttendee, inaccessible } = await fetchFreeBusyForAttendees(
      organizerEmail,
      attendeeEmails,
      timeMin,
      timeMax
    );

    const calendarErrors = inaccessible
      .filter((email) => email !== organizerEmail) // organizer's own calendar should always resolve
      .map((email) => {
        const attendee = request.attendees.find((a) => a.email === email);
        return `Can't see ${attendee?.name ?? email}'s calendar — proposed times aren't confirmed for them yet.`;
      });

    return {
      calendarData: busyByAttendee,
      calendarErrors,
      status: "proposing" as const,
    };
  } catch (err) {
    const msg = String((err as Error)?.message ?? err);
    if (msg.startsWith("NO_CALENDAR_CONNECTION")) {
      // The organizer themselves hasn't connected Google Calendar —
      // this is a hard stop, surfaced through approval as a freeform ask.
      return {
        status: "awaiting_approval" as const,
        approvalRequest: {
          question:
            "Your calendar isn't connected yet, so I can't check availability. Connect it and retry?",
          options: [],
          allowFreeform: true,
        },
      };
    }
    return {
      calendarErrors: [`Couldn't fetch calendars: ${msg}`],
      status: "proposing" as const,
    };
  }
}
