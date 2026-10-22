import { sendMail } from "./mailer.js";

export type MailOutcome = "sent" | "failed" | "timeout";

const DEFAULT_TIMEOUT_MS = Number(process.env.MAIL_TIMEOUT_MS ?? 10_000);

/**
 * Sends an email but never makes the caller wait longer than `ms`.
 * "timeout" means the send is still running in the background (result unknown).
 */
export async function sendMailBounded(
  opts: Parameters<typeof sendMail>[0],
  ms = DEFAULT_TIMEOUT_MS
): Promise<MailOutcome> {
  // The catch is attached here, so a late failure after a timeout can't crash the server.
  const send = sendMail(opts)
    .then(() => "sent" as const)
    .catch((err) => {
      console.error("Email send failed:", err);
      return "failed" as const;
    });

  let timer: NodeJS.Timeout | undefined;
  const timeout = new Promise<"timeout">((resolve) => {
    timer = setTimeout(() => resolve("timeout"), ms);
  });

  const outcome = await Promise.race([send, timeout]);
  if (timer) clearTimeout(timer);
  if (outcome === "timeout") console.warn(`Email to ${String(opts.to)} still pending after ${ms} ms`);
  return outcome;
}