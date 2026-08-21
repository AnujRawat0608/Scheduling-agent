export interface ExtractionScenario {
  name: string;
  text: string;
  expectedDurationMinutes: number;
  expectedAttendeeEmails: string[];
  expectedConstraintKeywords?: string[];
    expectedAvoidMornings?: boolean;
  expectedAvoidAfternoons?: boolean;
}

export const extractionScenarios: ExtractionScenario[] = [
  {
    name: "simple-duration-and-email",
    text: "30 min with sarah@company.com next week",
    expectedDurationMinutes: 30,
    expectedAttendeeEmails: ["sarah@company.com"],
  },
  {
    name: "hour-meeting-two-attendees",
    text: "Can you set up an hour long sync with priya@acme.com and dev@acme.com sometime this week?",
    expectedDurationMinutes: 60,
    expectedAttendeeEmails: ["priya@acme.com", "dev@acme.com"],
  },
    {
    name: "constraint-avoid-mornings",
    text: "15 minute check-in with tom@startup.io, avoid mornings please",
    expectedDurationMinutes: 15,
    expectedAttendeeEmails: ["tom@startup.io"],
    expectedAvoidMornings: true,
  },
  {
    name: "no-email-present",
    text: "Set up a meeting with the design team sometime next week",
    expectedDurationMinutes: 30,
    expectedAttendeeEmails: [],
  },
  {
    name: "default-duration-when-unstated",
    text: "Grab time with lee@example.com to discuss the roadmap",
    expectedDurationMinutes: 30,
    expectedAttendeeEmails: ["lee@example.com"],
  },
];