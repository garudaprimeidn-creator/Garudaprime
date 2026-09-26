/** Branded HTML + plain text for Garuda Prime wallet-creation OTP emails. */

const APP_ORIGIN = "https://app.garudaprime.id";
const APP_OPEN_URL = `${APP_ORIGIN}/?entry=auth&flow=wallet-otp`;

export type WalletOtpEmailContent = {
  subject: string;
  text: string;
  html: string;
};

function normalizeOtpCode(code: string): string {
  return code.replace(/\D/g, "").slice(0, 6);
}

export function buildWalletOtpEmail(code: string, lang: "id" | "en"): WalletOtpEmailContent {
  const isId = lang === "id";
  const otpCode = normalizeOtpCode(code);

  const subject = isId
    ? "Garuda Prime, Kode OTP Pembuatan Dompet"
    : "Garuda Prime, Wallet Creation OTP Code";

  const headline = isId ? "Verifikasi Pembuatan Dompet" : "Verify Wallet Creation";
  const intro = isId
    ? "Gunakan kode OTP berikut untuk menyelesaikan pembuatan dompet Garuda Prime Anda."
    : "Use the OTP code below to complete your Garuda Prime wallet setup.";
  const expiry = isId
    ? "Kode berlaku 5 menit."
    : "This code expires in 5 minutes.";
  const securityTitle = isId ? "Keamanan akun" : "Account security";
  const securityBody = isId
    ? "Jangan bagikan kode ini kepada siapa pun. Tim Garuda Prime tidak pernah meminta OTP via telepon atau chat."
    : "Never share this code with anyone. Garuda Prime staff will never ask for your OTP by phone or chat.";
  const ignore = isId
    ? "Jika Anda tidak meminta kode ini, abaikan email ini."
    : "If you did not request this code, you can safely ignore this email.";
  const footer = isId
    ? "Email otomatis · Garuda Prime Fintech"
    : "Automated message · Garuda Prime Fintech";
  const cta = isId ? "Buka Garuda Prime" : "Open Garuda Prime";

  const text = isId
    ? `${headline}\n\nKode OTP Anda: ${otpCode}\n\n${expiry} ${securityBody}\n\n${ignore}\n\n,  Garuda Prime\n${APP_OPEN_URL}`
    : `${headline}\n\nYour OTP code: ${otpCode}\n\n${expiry} ${securityBody}\n\n${ignore}\n\n,  Garuda Prime\n${APP_OPEN_URL}`;

  const html = `<!DOCTYPE html>
<html lang="${isId ? "id" : "en"}">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <meta http-equiv="X-UA-Compatible" content="IE=edge" />
  <title>${subject}</title>
</head>
<body style="margin:0;padding:0;background:#eef4f1;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;color:#0f172a;">
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#eef4f1;padding:32px 16px;">
    <tr>
      <td align="center">
        <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:520px;background:#ffffff;border-radius:20px;overflow:hidden;border:1px solid #d1e7dd;box-shadow:0 12px 40px rgba(5,150,105,0.08);">
          <tr>
            <td style="background:linear-gradient(135deg,#064e3b 0%,#059669 55%,#10b981 100%);padding:28px 32px 24px;text-align:center;">
              <div style="font-size:11px;letter-spacing:0.22em;text-transform:uppercase;color:rgba(255,255,255,0.82);font-weight:700;">Garuda Prime</div>
              <div style="font-size:22px;line-height:1.3;font-weight:800;color:#ffffff;margin-top:8px;">${headline}</div>
            </td>
          </tr>
          <tr>
            <td style="padding:32px 32px 12px;">
              <p style="margin:0 0 20px;font-size:15px;line-height:1.65;color:#334155;">${intro}</p>
              <div style="text-align:center;padding:20px 16px;border-radius:16px;background:#f0fdf4;border:1px solid #bbf7d0;">
                <div style="font-size:34px;line-height:1.15;font-weight:800;letter-spacing:0.18em;color:#065f46;font-family:ui-monospace,SFMono-Regular,Menlo,Monaco,Consolas,monospace;white-space:nowrap;display:inline-block;max-width:100%;overflow:hidden;text-overflow:ellipsis;">${otpCode}</div>
                <div style="font-size:13px;color:#047857;margin-top:10px;font-weight:600;">${expiry}</div>
              </div>
            </td>
          </tr>
          <tr>
            <td style="padding:8px 32px 24px;">
              <div style="padding:16px 18px;border-radius:14px;background:#fffbeb;border:1px solid #fde68a;">
                <div style="font-size:12px;font-weight:800;color:#92400e;margin-bottom:6px;">${securityTitle}</div>
                <div style="font-size:13px;line-height:1.6;color:#78350f;">${securityBody}</div>
              </div>
              <p style="margin:18px 0 0;font-size:13px;line-height:1.6;color:#64748b;">${ignore}</p>
            </td>
          </tr>
          <tr>
            <td style="padding:0 32px 32px;text-align:center;">
              <a href="${APP_OPEN_URL}" style="display:inline-block;padding:14px 32px;border-radius:12px;background:linear-gradient(135deg,#059669,#10b981);color:#ffffff;text-decoration:none;font-size:15px;font-weight:700;box-shadow:0 8px 24px rgba(5,150,105,0.25);">${cta}</a>
            </td>
          </tr>
          <tr>
            <td style="padding:18px 32px 24px;border-top:1px solid #e2e8f0;background:#f8fafc;text-align:center;">
              <div style="font-size:12px;color:#64748b;line-height:1.5;">${footer}</div>
              <div style="font-size:11px;color:#94a3b8;margin-top:6px;">${APP_ORIGIN}</div>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;

  return { subject, text, html };
}
