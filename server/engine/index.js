/**
 * PharMate Schedule Engine — pure module (Sprint 4)
 *
 * Rules:
 *   - No I/O, no clock reads, no database calls inside this module.
 *   - All inputs are passed in by the caller; curated drug data injected.
 *   - Same inputs ⇒ byte-identical output (determinism property).
 *
 * This file is the entry point; full implementation lands in Sprint 4.
 * The frequencyParser and constraint checkers are in sibling files.
 */

import { parseFrequency } from './frequencyParser.js';

/**
 * @typedef {Object} EngineInput
 * @property {string}    patientId
 * @property {Object}    anchors          - wake/sleep/meal anchor times (HH:MM strings)
 * @property {Object[]}  medications      - active, non-PRN medications for the patient
 * @property {Object[]}  drugReference    - curated drug_reference rows (injected)
 * @property {Object[]}  drugInteractions - curated drug_interactions rows (injected)
 * @property {string}    generationDate   - ISO date string (YYYY-MM-DD) for the day plan
 *
 * @typedef {Object} ScheduleSlot
 * @property {string}  medicationId
 * @property {string}  scheduledTime    - ISO datetime string (UTC)
 * @property {string}  generatedReason
 * @property {boolean} isConfirmed
 * @property {boolean} isPrnSlot
 * @property {string}  status           - 'scheduled'
 *
 * @typedef {Object} EngineOutput
 * @property {ScheduleSlot[]} slots
 * @property {Object[]}       unresolved  - medications that could not be placed
 * @property {number}         version     - schedule_version (caller must increment from stored)
 */

/**
 * Generate a day plan for a single patient on a given date.
 *
 * @param {EngineInput} input
 * @returns {EngineOutput}
 */
export function generateSchedule(input) {
  // Sprint 4 — full implementation.
  // Returning a stub so callers can integrate against the interface now.
  void parseFrequency; // imported; will be used in S4

  return {
    slots: [],
    unresolved: input.medications.map((m) => ({
      medicationId: m.id,
      reason: 'ENGINE_NOT_YET_IMPLEMENTED',
    })),
    version: 1,
  };
}
