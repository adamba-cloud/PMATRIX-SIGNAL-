import nodemailer from "nodemailer";

const {
  SMTP_HOST,
  SMTP_PORT,
  SMTP_USER,
  SMTP_PASS,
  SMTP_FROM,
  APP_URL,
} = process.env;

function createTransport() {
  if (!SMTP_HOST || !SMTP_USER || !SMTP_PASS) return null;
  return nodemailer.createTransport({
    host: SMTP_HOST,
    port: Number(SMTP_PORT ?? 587),
    secure: Number(SMTP_PORT ?? 587) === 465,
    auth: { user: SMTP_USER, pass: SMTP_PASS },
  });
}

const from = SMTP_FROM ?? `PESAMATRIX <noreply@pesamatrix.com>`;
const baseUrl = APP_URL ?? "https://pesamatrix.replit.app";

export async function sendPasswordResetEmail(email: string, name: string, token: string): Promise<void> {
  const link = `${baseUrl}/reset-password?token=${token}`;
  const transport = createTransport();

  if (!transport) {
    console.warn(`[mailer] SMTP not configured — password reset link for ${email}: ${link}`);
    return;
  }

  await transport.sendMail({
    from,
    to: email,
    subject: "Reset your PESAMATRIX password",
    html: `
<!DOCTYPE html>
<html>
<body style="margin:0;padding:0;background:#0f172a;font-family:Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#0f172a;padding:40px 0;">
    <tr><td align="center">
      <table width="480" cellpadding="0" cellspacing="0" style="background:#1e293b;border-radius:12px;border:1px solid #334155;padding:40px;">
        <tr><td align="center" style="padding-bottom:32px;">
          <span style="font-size:24px;font-weight:bold;color:#22c55e;">PESAMATRIX</span>
        </td></tr>
        <tr><td style="color:#f1f5f9;font-size:18px;font-weight:bold;padding-bottom:12px;">
          Password Reset Request
        </td></tr>
        <tr><td style="color:#94a3b8;font-size:14px;line-height:1.6;padding-bottom:32px;">
          Hi ${name}, we received a request to reset your password. Click the button below to choose a new one.
          This link expires in <strong style="color:#f1f5f9;">1 hour</strong>.
        </td></tr>
        <tr><td align="center" style="padding-bottom:32px;">
          <a href="${link}" style="display:inline-block;background:#16a34a;color:#ffffff;text-decoration:none;padding:14px 32px;border-radius:8px;font-size:15px;font-weight:bold;">
            Reset Password
          </a>
        </td></tr>
        <tr><td style="color:#475569;font-size:12px;border-top:1px solid #334155;padding-top:20px;">
          If you didn't request a password reset, you can safely ignore this email — your password won't change.<br/>
          Or paste this link in your browser: <span style="color:#22c55e;">${link}</span>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`,
  });
}

export async function sendVerificationEmail(email: string, name: string, token: string): Promise<void> {
  const link = `${baseUrl}/verify-email?token=${token}`;
  const transport = createTransport();

  if (!transport) {
    console.warn(`[mailer] SMTP not configured — verification link for ${email}: ${link}`);
    return;
  }

  await transport.sendMail({
    from,
    to: email,
    subject: "Verify your PESAMATRIX account",
    html: `
<!DOCTYPE html>
<html>
<body style="margin:0;padding:0;background:#0f172a;font-family:Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#0f172a;padding:40px 0;">
    <tr><td align="center">
      <table width="480" cellpadding="0" cellspacing="0" style="background:#1e293b;border-radius:12px;border:1px solid #334155;padding:40px;">
        <tr><td align="center" style="padding-bottom:32px;">
          <span style="font-size:24px;font-weight:bold;color:#22c55e;">PESAMATRIX</span>
        </td></tr>
        <tr><td style="color:#f1f5f9;font-size:18px;font-weight:bold;padding-bottom:12px;">
          Welcome, ${name}!
        </td></tr>
        <tr><td style="color:#94a3b8;font-size:14px;line-height:1.6;padding-bottom:32px;">
          Thanks for creating your account. Please verify your email address to access the trading terminal.
          This link expires in <strong style="color:#f1f5f9;">24 hours</strong>.
        </td></tr>
        <tr><td align="center" style="padding-bottom:32px;">
          <a href="${link}" style="display:inline-block;background:#16a34a;color:#ffffff;text-decoration:none;padding:14px 32px;border-radius:8px;font-size:15px;font-weight:bold;">
            Verify Email Address
          </a>
        </td></tr>
        <tr><td style="color:#475569;font-size:12px;border-top:1px solid #334155;padding-top:20px;">
          If you didn't create an account, you can safely ignore this email.<br/>
          Or paste this link in your browser: <span style="color:#22c55e;">${link}</span>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`,
  });
}
