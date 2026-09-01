import nodemailer from 'nodemailer';

let testDelivery = null;
let transporter = null;

export function setPasswordResetDeliveryForTests(delivery) {
  if (process.env.NODE_ENV !== 'test') {
    throw new Error('Password-reset delivery can only be replaced in tests');
  }
  testDelivery = delivery;
}

export async function deliverPasswordReset({ email, pin }) {
  if (testDelivery) return testDelivery({ email, pin });

  if (
    process.env.NODE_ENV === 'development' &&
    process.env.PASSWORD_RESET_DEV_LOG_TOKEN === 'true'
  ) {
    console.warn(
      'SECURITY WARNING: password-reset token logging is enabled for local development only.'
    );
    console.warn(`Password reset PIN for ${email}: ${pin}`);
    return;
  }

  if (process.env.PASSWORD_RESET_EMAIL_ENABLED !== 'true') return;
  transporter ||= nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: Number(process.env.SMTP_PORT),
    secure: Number(process.env.SMTP_PORT) === 465,
    auth: {
      user: process.env.SMTP_USER || process.env.SMTP_USERNAME,
      pass: process.env.SMTP_PASS || process.env.SMTP_PASSWORD,
    },
  });
  await transporter.sendMail({
    from:
      process.env.SMTP_FROM ||
      process.env.SMTP_SENDER ||
      `PharMate Security <${process.env.SMTP_USER || process.env.SMTP_USERNAME}>`,
    to: email,
    subject: 'Your PharMate password reset PIN',
    text: `Your PharMate password reset PIN is ${pin}. It expires in 10 minutes. If you did not request this, you can ignore this email.`,
    html: `
      <div style="font-family:Arial,sans-serif;max-width:520px;margin:auto;color:#1e2e4a">
        <div style="border:1px solid #d7e3f2;border-radius:16px;overflow:hidden">
          <div style="background:#4c8ce4;color:#fff;padding:22px 26px">
            <strong style="font-size:22px">PharMate</strong>
            <div style="font-size:13px;margin-top:4px">Secure account recovery</div>
          </div>
          <div style="padding:26px">
            <h1 style="font-size:20px;margin:0 0 12px">Reset your password</h1>
            <p style="line-height:1.6">Enter this one-time PIN in PharMate. It expires in 10 minutes.</p>
            <div style="font-size:32px;font-weight:800;letter-spacing:10px;text-align:center;background:#f0f6ff;border-radius:12px;padding:18px;color:#2a67b8">${pin}</div>
            <p style="font-size:13px;line-height:1.6;color:#64748b">Never share this PIN. PharMate staff will not ask you for it. If you did not request a reset, ignore this email.</p>
          </div>
        </div>
      </div>`,
  });
}
