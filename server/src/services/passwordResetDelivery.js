import { sendOtpEmail, setEmailDeliveryForTests } from './emailService.js';

export const setPasswordResetDeliveryForTests = setEmailDeliveryForTests;

export function deliverPasswordReset({ email, pin }) {
  return sendOtpEmail({ email, otp: pin, purpose: 'PASSWORD_RESET' });
}
