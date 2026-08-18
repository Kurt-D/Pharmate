import nodemailer from 'nodemailer';

let testDelivery = null;
let transporter = null;

export function setPasswordResetDeliveryForTests(delivery) {
  if (process.env.NODE_ENV !== 'test') {
    throw new Error('Password-reset delivery can only be replaced in tests');
  }
  testDelivery = delivery;
}

function resetUrl(rawToken) {
  const url = new URL('/reset-password', process.env.PUBLIC_APP_URL);
  url.searchParams.set('token', rawToken);
  return url.toString();
}

export async function deliverPasswordReset({ email, rawToken }) {
  const url = resetUrl(rawToken);
  if (testDelivery) return testDelivery({ email, url, rawToken });

  if (
    process.env.NODE_ENV === 'development' &&
    process.env.PASSWORD_RESET_DEV_LOG_TOKEN === 'true'
  ) {
    console.warn(
      'SECURITY WARNING: password-reset token logging is enabled for local development only.'
    );
    console.warn(`Password reset link for ${email}: ${url}`);
    return;
  }

  if (process.env.PASSWORD_RESET_EMAIL_ENABLED !== 'true') return;
  transporter ||= nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: Number(process.env.SMTP_PORT),
    secure: Number(process.env.SMTP_PORT) === 465,
    auth: { user: process.env.SMTP_USERNAME, pass: process.env.SMTP_PASSWORD },
  });
  await transporter.sendMail({
    from: process.env.SMTP_SENDER,
    to: email,
    subject: 'Reset your PharMate password',
    text: `Use this link within 30 minutes to reset your password: ${url}`,
    html: `<p>Use the link below within 30 minutes to reset your password.</p><p><a href="${url}">Reset password</a></p>`,
  });
}
