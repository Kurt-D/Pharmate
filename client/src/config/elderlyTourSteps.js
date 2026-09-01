import faqData from './faqData.js';

export const PATIENT_ELDERLY_TOUR_STEPS = faqData.map((faq, index) => ({
  ...faq.tourStep,
  title: `${index + 1}. ${faq.tourStep.title}`,
}));

export const PATIENT_TUTORIAL_MODULES = {
  welcome: {
    title: 'Replay Full Tour',
    description: 'Review all eight important PharMate patient features.',
    steps: PATIENT_ELDERLY_TOUR_STEPS,
  },
};

export const CAREGIVER_ELDERLY_TOUR_STEPS = [
  {
    id: 'caregiver-monitoring',
    path: '/caregiver/home',
    target: '.cg-adherence-card',
    icon: 'family',
    preview: 'dose-card',
    title: '1. Check Today’s Medicine Progress',
    description:
      'This card shows how many scheduled medicines your linked patient has taken, which are coming up, and which are overdue.',
    voicePrompt: 'This card shows your linked patient’s medicine progress for today.',
  },
  {
    id: 'caregiver-reminder',
    path: '/caregiver/home',
    target: '.cg-dose-alert, .cg-timeline-card',
    icon: 'voice',
    preview: 'voice',
    title: '2. Send a Helpful Voice Reminder',
    description:
      'When a dose is due or overdue, press Send Voice Reminder. Your linked patient will receive a clear spoken reminder on their device.',
    voicePrompt:
      'When medicine is due, press Send Voice Reminder to send a spoken reminder to your linked patient.',
  },
  {
    id: 'caregiver-medication',
    path: '/caregiver/medication',
    target: '.cg-scroll-area main section',
    icon: 'package',
    preview: 'warning',
    title: '3. Review Medicines and Refills',
    description:
      'Use the Medication page to review the patient’s schedule, taken and missed doses, medicine supply, and refill warnings.',
    voicePrompt:
      'Use the Medication page to review schedules, dose records, and medicines that may need a refill.',
  },
  {
    id: 'caregiver-patient',
    path: '/caregiver/home',
    target: '.cg-patient-switcher, .cg-home-hero',
    icon: 'link',
    preview: 'caregiver',
    title: '4. Choose or Link a Patient',
    description:
      'Use the patient selector to switch between linked family members. Press Add when a patient gives you a new secure linking code.',
    voicePrompt:
      'Use the patient selector to choose a linked family member or add a patient with their secure code.',
  },
];
