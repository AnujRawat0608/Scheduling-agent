import { createCalendarEvent } from "../tools/googleCalendar.js";
import { generateInviteMessage } from "../lib/generateInviteMessage.js";
import { MEETING_TEMPLATES } from "../lib/meetingTemplates.js";
import type { SchedulingStateType } from "../state.js";

export async function sendInvites(state: SchedulingStateType) {
  const { request, selectedSlot } = state;
  if (!selectedSlot) {
    return { status: "failed" as const, conflictReason: "No slot selected" };
  }

  try {
    const description = await generateInviteMessage(request, selectedSlot);
    const template = MEETING_TEMPLATES[request.meetingType ?? "general"];
    const title = `${template.titlePrefix}${request.title}`;

    await createCalendarEvent({
      organizerEmail: request.organizer.email,
      title,
      description,
      start: selectedSlot.start,
      end: selectedSlot.end,
      attendeeEmails: request.attendees.map((a) => a.email),
    });

    return { status: "done" as const };
  } catch (err) {
    return {
      status: "failed" as const,
      conflictReason: `Failed to create event: ${String(err)}`,
    };
  }
}