export type MeetingType =
  | "escalation"
  | "customer_support"
  | "sales"
  | "interview"
  | "internal"
  | "general";

interface MeetingTemplate {
  titlePrefix: string;
  toneInstruction: string;
}

export const MEETING_TEMPLATES: Record<MeetingType, MeetingTemplate> = {
  escalation: {
    titlePrefix: "[Escalation] ",
    toneInstruction:
      "Write in an urgent, direct tone. Make clear this needs priority attention. Keep it brief — this is time-sensitive.",
  },
  customer_support: {
    titlePrefix: "[Support] ",
    toneInstruction:
      "Write in a warm, reassuring, professional support tone. Acknowledge we're here to help resolve their issue.",
  },
  sales: {
    titlePrefix: "",
    toneInstruction:
      "Write in a professional, confident business tone appropriate for a prospect or client conversation.",
  },
  interview: {
    titlePrefix: "Interview: ",
    toneInstruction:
      "Write in a clear, welcoming, professional tone appropriate for a candidate. Briefly mention what to expect if relevant.",
  },
  internal: {
    titlePrefix: "",
    toneInstruction: "Write in a casual, friendly tone appropriate for a team sync.",
  },
  general: {
    titlePrefix: "",
    toneInstruction: "Write in a short, friendly, neutral tone.",
  },
};