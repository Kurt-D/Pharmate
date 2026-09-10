export function scheduleFailure(error) {
  const status = Number(error?.status || 0);
  const retryable = !status || status >= 500 || status === 408 || status === 429;
  const messages = [
    error?.body?.error,
    error?.body?.message,
    ...(error?.body?.warnings || [])
      .filter((item) => item.severity === 'blocking')
      .map((item) => item.message),
  ].filter((value) => typeof value === 'string' && value.trim());
  return {
    retryable,
    drugId: error?.body?.drug_id || null,
    medicineName: error?.body?.medicine_name || null,
    code: error?.body?.code || null,
    message: retryable
      ? 'We could not reach the scheduling service. Your medicine details are still here. Please try again.'
      : [...new Set(messages)].join(' ') ||
        error?.message ||
        'Please review your medicine directions or ask your pharmacist before creating reminders.',
  };
}
