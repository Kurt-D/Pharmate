export const dayKey = (date) =>
  `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
export function summarizeDoses(rows, now = new Date()) {
  const eligible = rows.filter(
    (row) =>
      !row.is_prn &&
      String(row.schedule_type).toUpperCase() !== 'PRN' &&
      !['CANCELLED'].includes(String(row.status).toUpperCase())
  );
  const counts = { Taken: 0, Upcoming: 0, Missed: 0, Skipped: 0 };
  let due = 0;
  let takenDue = 0;
  for (const row of eligible) {
    const status = String(row.status).toUpperCase();
    const scheduled = new Date(row.scheduled_at || row.scheduled_time);
    const isDue = scheduled <= now;
    const taken = ['TAKEN', 'TAKEN_LATE'].includes(status);
    if (isDue) {
      due++;
      if (taken) takenDue++;
    }
    if (taken) counts.Taken++;
    else if (status === 'SKIPPED') counts.Skipped++;
    else if (status === 'MISSED' && isDue) counts.Missed++;
    else counts.Upcoming++;
  }
  return {
    counts,
    total: eligible.length,
    adherence: due ? Math.round((takenDue / due) * 100) : null,
  };
}
