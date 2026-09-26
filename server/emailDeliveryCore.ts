/**
 * Transactional email, Google SMTP (Gmail/Workspace), Resend, or webhook.
 * Used by wallet OTP and optional QA alert webhooks.
 */

export type SendEmailInput = {
  to: string;
  subject: string;
  text: string;
  /** Optional HTML body */
  html?: string;
};

const fromAddress = (): string =>
  process.env.WALLET_OTP_FROM_EMAIL?.trim()
  || process.env.EMAIL_FROM_ADDRESS?.trim()
  || process.env.SMTP_FROM?.trim()
  || "Garuda Prime <noreply@garudaprime.id>";

function smtpConfigured(): boolean {
  return Boolean(
    process.env.SMTP_USER?.trim()
    && process.env.SMTP_PASS?.trim(),
  );
}

/** Gmail / Google Workspace SMTP (App Password). */
async function sendViaGoogleSmtp(input: SendEmailInput): Promise<boolean> {
  if (!smtpConfigured()) return false;

  const host = process.env.SMTP_HOST?.trim() || "smtp.gmail.com";
  const port = Number(process.env.SMTP_PORT?.trim() || "587");
  const user = process.env.SMTP_USER!.trim();
  const pass = process.env.SMTP_PASS!.trim();

  const nodemailer = await import("nodemailer");
  const transport = nodemailer.createTransport({
    host,
    port,
    secure: port === 465,
    auth: { user, pass },
  });

  await transport.sendMail({
    from: fromAddress(),
    to: input.to,
    subject: input.subject,
    text: input.text,
    html: input.html,
  });
  return true;
}

async function sendViaResend(input: SendEmailInput): Promise<boolean> {
  const apiKey = process.env.RESEND_API_KEY?.trim();
  if (!apiKey) return false;

  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: fromAddress(),
      to: [input.to],
      subject: input.subject,
      text: input.text,
      html: input.html,
    }),
  }).catch(() => null);

  if (res?.ok) return true;

  const errBody = await res?.json().catch(() => ({})) as { message?: string };
  const msg = errBody?.message?.trim();
  if (msg) {
    throw new Error(msg);
  }
  return false;
}

async function sendViaWebhook(input: SendEmailInput, webhookUrl: string): Promise<boolean> {
  const res = await fetch(webhookUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      email: input.to,
      to: input.to,
      subject: input.subject,
      text: input.text,
      html: input.html,
    }),
  }).catch(() => null);

  return Boolean(res?.ok);
}

export async function sendTransactionalEmail(input: SendEmailInput): Promise<void> {
  const trimmedTo = input.to.trim();
  if (!trimmedTo.includes("@")) {
    throw new Error("Alamat email penerima tidak valid");
  }

  if (await sendViaGoogleSmtp(input)) return;

  if (await sendViaResend(input)) return;

  const webhook = process.env.WALLET_OTP_EMAIL_WEBHOOK_URL?.trim()
    || process.env.QA_ALERT_EMAIL_WEBHOOK_URL?.trim();
  if (webhook && await sendViaWebhook(input, webhook)) return;

  if (process.env.NODE_ENV !== "production" || process.env.GARUDA_WALLET_OTP_LOG === "true") {
    console.info("[Garuda Email]", input.subject, "→", trimmedTo, "\n", input.text);
    return;
  }

  throw new Error(
    "Pengiriman email belum dikonfigurasi (SMTP_USER/SMTP_PASS, RESEND_API_KEY, atau WALLET_OTP_EMAIL_WEBHOOK_URL)",
  );
}
