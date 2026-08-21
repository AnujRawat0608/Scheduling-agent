import { ChatGroq } from "@langchain/groq";
import { format } from "date-fns";
import type { SchedulingRequest, TimeSlot } from "../state.js";
import { MEETING_TEMPLATES } from "./meetingTemplates.js";

const llm = new ChatGroq({
  model: "openai/gpt-oss-20b",
  temperature: 0.4,
});

function fallbackMessage(request: SchedulingRequest, slot: TimeSlot): string {
  return `Scheduled via automated assistant for ${format(new Date(slot.start), "EEEE, MMM d 'at' h:mm a")}.${
    request.constraints ? `\n\nNote: ${request.constraints}` : ""
  }`;
}

export async function generateInviteMessage(
  request: SchedulingRequest,
  slot: TimeSlot
): Promise<string> {
  const template = MEETING_TEMPLATES[request.meetingType ?? "general"];

  try {
    const response = await llm.invoke([
      {
        role: "system",
        content: `Write a short, 2-3 sentence calendar invite description. Plain text, no markdown, no subject line, no greeting like 'Dear' — just the body. ${template.toneInstruction}`,
      },
      {
        role: "user",
        content: JSON.stringify({
          title: request.title,
          durationMinutes: request.durationMinutes,
          when: format(new Date(slot.start), "EEEE, MMM d 'at' h:mm a"),
          constraints: request.constraints ?? null,
        }),
      },
    ]);

    const text = typeof response.content === "string" ? response.content.trim() : "";
    return text.length > 0 ? text : fallbackMessage(request, slot);
  } catch {
    return fallbackMessage(request, slot);
  }
}