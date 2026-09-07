import nodemailer from 'nodemailer';
import axios from 'axios';

let transporter;
let testDelivery;

function configurationError(message) {
  const error = new Error(message);
  error.code = 'EMAIL_NOT_CONFIGURED';
  return error;
}

function isPlaceholder(value) {
  return /(?:example\.com|your-email|changeme|replace-me)/i.test(String(value || ''));
}

function assertEmailConfiguration() {
  if (process.env.EMAIL_ENABLED !== 'true' && process.env.PASSWORD_RESET_EMAIL_ENABLED !== 'true') {
    throw configurationError('Email delivery is disabled');
  }
  const provider = String(process.env.EMAIL_PROVIDER || 'smtp').trim().toLowerCase();
  const from = process.env.EMAIL_FROM || process.env.SMTP_FROM || process.env.SMTP_SENDER;
  if (!from || isPlaceholder(from)) throw configurationError('A verified sender address is required');
  if (provider === 'resend') {
    if (!process.env.RESEND_API_KEY || isPlaceholder(process.env.RESEND_API_KEY)) {
      throw configurationError('Resend credentials are required');
    }
    return { provider, from };
  }
  const user = process.env.SMTP_USER || process.env.SMTP_USERNAME;
  const pass = process.env.SMTP_PASS || process.env.SMTP_PASSWORD;
  if (!process.env.SMTP_HOST || !process.env.SMTP_PORT || !user || !pass || isPlaceholder(user) || isPlaceholder(pass)) {
    throw configurationError('Valid SMTP credentials are required');
  }
  return { provider, from, user, pass };
}

export function setEmailDeliveryForTests(delivery) {
  if (process.env.NODE_ENV !== 'test') throw new Error('Email delivery override is test-only');
  testDelivery = delivery;
}

export async function sendOtpEmail({ email, otp, purpose }) {
  if (testDelivery) return testDelivery({ email, otp, pin: otp, purpose });
  if (process.env.NODE_ENV === 'test') return;
  const config = assertEmailConfiguration();
  const verification = purpose === 'EMAIL_VERIFICATION';
  const subject = verification
    ? 'PharMate Email Verification Code'
    : 'PharMate Password Reset Code';
  const action = verification ? 'verify your email address' : 'reset your password';
  const text = `Your PharMate verification code is ${otp}. Use it to ${action}. This code expires in 10 minutes. If you did not request this, ignore this email.`;
  const html = `<div style="font-family:Arial,sans-serif;max-width:520px;margin:auto;color:#1e2e4a"><h1>PharMate</h1><p>Use this one-time code to ${action}:</p><div style="font-size:32px;font-weight:800;letter-spacing:10px;text-align:center;background:#f0f6ff;border-radius:12px;padding:18px">${otp}</div><p>This code expires in 10 minutes. Never share it. If you did not request this, ignore this email.</p></div>`;

  if (config.provider === 'resend') {
    await axios.post(
      'https://api.resend.com/emails',
      { from: config.from, to: [email], subject, text, html },
      {
        headers: {
          Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
          'Content-Type': 'application/json',
        },
        timeout: 10_000,
      }
    );
    return;
  }

  transporter ||= nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: Number(process.env.SMTP_PORT),
    secure: Number(process.env.SMTP_PORT) === 465,
    auth: {
      user: config.user,
      pass: config.pass,
    },
  });
  await transporter.sendMail({
    from: config.from,
    to: email,
    subject,
    text,
    html,
  });
}
