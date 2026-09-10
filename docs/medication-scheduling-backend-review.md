# Medication scheduling backend review

## Scope and schema

Backend scheduling, dose lifecycle, shared schedule reads, reminders and history. Existing medication and schedule tables, approval states, audit tables and per-version uniqueness constraints were reused. No new migration or production data repair was applied. Tests use the isolated `pharmate_schedule_regression_test` database.

## Bugs addressed

- Daily frequency counts could become evenly spaced clock times without an explicit interval.
- The newer solver could shift exact entered times to satisfy constraints.
- PRN with entered times could be inferred as a recurring specific-times schedule.
- Reconfirming identical schedules replaced dose identities; regeneration could erase unswept historical doses or recreate logged doses.
- Reminder dispatch and missed-dose processing did not consistently exclude inactive medicines or outdated versions.
- Late confirmed intake could be classified as missed, and generated reflow suggestions changed subsequent timing without an independently validated correction.
- Calendar date validation accepted impossible dates.
- Patient deletion could cascade into recorded dose logs.
- No single review-response endpoint was available across all three authorized roles.

## Generation and approval

Daily counts are not interpreted as intervals. Explicit prescription schedule times override patient timing in the prescription-driven path. Entered exact times are fixed solver candidates, not movable suggestions. The active generation route requires entered timing; missing or conflicting timing cannot produce an active plan. Existing intake/definition workflows retain NEEDS_REVIEW or PENDING_APPROVAL states for review.

The shared confirmation path expands an explicit interval from its starting time continuously across the treatment dates. The alternate daily-pattern generator rejects intervals that cannot repeat safely as a 24-hour pattern; those require review instead of an invented pattern. PRN is non-recurring. Weekly/specific-day definitions require selected weekdays.

Existing permissions remain in effect: caregivers do not gain medication-edit permissions, prescription changes require pharmacist review, and patient confirmation is allowed only within the existing workflow. Modified medicines pause reminders through their approval state. Shared confirmation locks records, checks the loaded revision and records an audit snapshot. A repeated unchanged confirmation retains its version and dose IDs. The alternate save-reminders path retains matching dose IDs, although it still records a new confirmation version.

## Shared data and dose status

`getPatientMedicationSchedule` remains the read source for patient dashboard, today, calendar and history APIs. `getSharedScheduleReview` adds stored definitions, times, directions, treatment dates, approval state and audit attribution for patient, linked caregiver and pharmacist review.

TAKEN wins when a taken log/timestamp exists. Otherwise scheduled time determines UPCOMING, DUE within the configured 30-minute window, and MISSED after that window. Five-minute reminders remain restricted to eligible due doses. Neither missed status nor late intake authorizes replacement doses or automatic movement of later doses.

Date reads use patient-local midnight bounds, not UTC calendar dates. Date-range history retains previous taken/missed entries, including elapsed unswept records. Deletion is now restricted to unlogged future reminders; historical deletion returns `DOSE_HISTORY_PROTECTED` without deleting records.

## Endpoints

New read endpoints:

- `GET /api/patient/schedule/records?date=YYYY-MM-DD`
- `GET /api/caregiver/patients/:code/schedule?date=YYYY-MM-DD` (active link required)
- `GET /api/pharmacist/patients/:code/schedule?date=YYYY-MM-DD` (existing pharmacist roster permissions)

Affected existing paths:

- `/api/patient/schedule`, `/api/patient/schedule/confirm`, `/api/patient/schedule/items`
- `/api/patient/doses/today`, `/api/patient/doses/calendar`, `/api/patient/doses/history`, dose logging/sync
- `/api/patient/dashboard`
- `/api/medications/generate-schedule`, `/api/medications/save-intake`, `/api/medications/save-reminders`
- caregiver dose reminders and the existing caregiver today/history APIs
- medication-edit reminder invalidation and scheduled reminder/missed-dose jobs

## Files changed

Services: `server/src/services/scheduleDefinition.js`, `schedule.js`, `scheduleEngine.js`, `medicationSchedule.js`, `doses.js`, `reminders.js`, `patientMedications.js`.

Routes: `server/src/routes/patient.js`, `medication.js`, `caregiver.js`, `pharmacist.js`.

Tests: `server/src/__tests__/scheduleTimingRegression.test.js` (new), `scheduleDefinition.test.js`, `medicationScheduleConsistency.test.js`, `automatedScheduleRoute.test.js`, `schedule.test.js`, `doses.test.js`.

## Verification

Nine targeted suites passed together: 81 tests covering explicit 08:00/20:00 timing, intake persistence, repeat confirmation, missed retention, next-day exclusion, ambiguous frequency, explicit intervals, PRN, timezone boundaries, reminders, prescription direction priority, shared role responses, and deletion protection. Server lint passed. The final confirmation revision and dose response changes were followed by a rerun of the affected schedule, dose and consistency suites.

## Remaining limitations

- Frontend code was deliberately not changed. New shared review endpoints still need UI integration; older frontend local fallback/status calculations and deletion copy need a separate cleanup.
- Schedule generation remains configured for the Philippine/Manila deployment. Read queries support patient timezones, but generation for travel/DST zones needs additional work and testing.
- Historical dose instances/logs are preserved; historical display text can still reflect current medication details rather than an immutable per-dose instruction snapshot.
- The alternate save-reminders route preserves dose IDs but still increments confirmation version on an identical resubmission.
- Complex tapering, alternating regimens, waking-hours-only intervals, ambiguous natural-language prescriptions and unsupported recurrence require pharmacist review. The alternate daily generator deliberately declines non-divisor intervals.
- Existing stopped/deleted data was not reconstructed. No claim of medical validation, approved clinical knowledge completeness, or pharmacist testing is made. Clinical sources and licensed review remain necessary.
- Signed-in UI and real-device reminder delivery were not tested. No commit or push was performed for this work.
