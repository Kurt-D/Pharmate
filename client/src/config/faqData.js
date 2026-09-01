const faqData = [
  {
    id: 'create-schedule',
    category: 'Schedule & Doses',
    question: 'How do I create or manage a medicine schedule?',
    keywords: ['add medicine', 'schedule', 'dose', 'time', 'reminder', 'maintenance'],
    summary: 'Add the medicine first, then review the reminder times before saving.',
    stepByStep: [
      'Tap the Medications tab on the bottom navigation bar.',
      'Tap the blue + Add Medicine button.',
      'Choose the medicine and the dose shown on its label.',
      'Select how often you take it and choose the daily reminder times.',
      'Set the start and end dates, or choose Ongoing for maintenance medicine.',
      'Review the suggested or manual schedule, then save it.',
    ],
    importantRule: 'Always compare the saved schedule with your prescription label.',
    tourStep: {
      id: 'create-schedule',
      path: '/patient/medications',
      target:
        '.pm-med-setup-empty .pm-primary-large, .pm-med-setup-empty .pm-med-section-head button, .pm-med-library .pm-med-section-head button',
      title: 'Create a Medicine Schedule',
      description:
        'Tap this plus button to add a medicine, set the dose, and choose daily reminder times.',
    },
  },
  {
    id: 'log-dose',
    category: 'Taking Medicine',
    question: 'How do I record that I took my medicine?',
    keywords: ['taken', 'log dose', 'checkmark', 'daily list', 'medicine checklist'],
    summary: 'Use Mark as Taken only after you have taken the correct medicine.',
    stepByStep: [
      'Open Home and find the medicine that is due.',
      'Read the medicine name, dose, and instructions carefully.',
      'Take the medicine as prescribed.',
      'Tap Mark as Taken and confirm the medicine is correct.',
      'PharMate records the time and updates your daily history.',
    ],
    importantRule: 'Complete every scheduled dose before 11:59 PM to maintain your streak.',
    tourStep: {
      id: 'log-dose',
      path: '/patient/today',
      target: '.pm-voice-card .pm-tour-mark-taken',
      title: 'Record a Taken Dose',
      description:
        'After you take the correct medicine, tap Mark as Taken to update your daily record.',
    },
  },
  {
    id: 'scan-label',
    category: 'Orders & Scans',
    question: 'How do I scan a prescription or medicine label?',
    keywords: ['scan', 'camera', 'label', 'ocr', 'voice confirmation'],
    summary: 'Scan the label to check the medicine before it is logged.',
    stepByStep: [
      'Open Home or Medications and tap Scan Medicine.',
      'Point the camera steadily at the bottle, box, or prescription label.',
      'Capture a clear image with the medicine name and dose visible.',
      'Review the scanned medicine details and listen to the confirmation if Listening is enabled.',
      'Confirm only when the scanned medicine matches the scheduled dose.',
    ],
    importantRule: 'Do not confirm a scan when the name or dose is different from your label.',
    tourStep: {
      id: 'scan-label',
      path: '/patient/today',
      target: '.pm-voice-card .pm-tour-scan-medicine',
      title: 'Scan a Medicine Label',
      description:
        'Tap Scan Medicine to check the label and confirm that the correct medicine is being taken.',
    },
  },
  {
    id: 'safety-spacing',
    category: 'Schedule & Doses',
    question: 'How does safe medicine spacing work?',
    keywords: ['interaction', 'safety', 'spacing', 'interval', 'conflict'],
    summary: 'PharMate reviews reminder intervals to reduce timing conflicts.',
    stepByStep: [
      'Add every medicine you take to PharMate.',
      'Choose Suggested Schedule when creating reminder times.',
      'Review the safety notice and the proposed time gap between medicines.',
      'Ask a licensed pharmacist when your label instructions are unclear or different from the reminder schedule.',
    ],
    importantRule: 'A schedule suggestion does not replace advice from a licensed pharmacist.',
    tourStep: {
      id: 'safety-spacing',
      path: '/patient/schedule',
      target: '.pm-schedule-safety, .pm-safe-strip',
      title: 'Review Safe Reminder Spacing',
      description:
        'This notice explains how saved reminder times are spaced. Review changes before saving.',
    },
  },
  {
    id: 'streak-rewards',
    category: 'Streaks & Rewards',
    question: 'How do the 7-day streak and rewards work?',
    keywords: ['streak', 'reward', 'day 3', 'day 6', 'day 7', 'midnight'],
    summary: 'Complete all scheduled doses each day to move the 7-day progress forward.',
    stepByStep: [
      'Mark every scheduled medicine as taken on the day it is due.',
      'Completing the full day advances your streak by one.',
      'You earn 1 token on Day 3, 1 token on Day 6, and 2 tokens on Day 7.',
      'An unlogged dose after midnight resets the streak to 0.',
      'Complete all doses on the next active day to restart at Day 1.',
    ],
    importantRule: 'A partly completed day does not count toward the streak.',
    tourStep: {
      id: 'streak-rewards',
      path: '/patient/streak',
      target: '.pm-streak-reward-path, .pm-streak-progress',
      title: 'Follow Your 7-Day Progress',
      description:
        'Complete every scheduled dose before midnight to grow your streak and earn tokens.',
    },
  },
  {
    id: 'priority-chat',
    category: 'Pharmacist & Tokens',
    question: 'How do Priority Tokens and pharmacist chat work?',
    keywords: ['pharmacist', 'chat', 'priority', 'token', 'standard chat'],
    summary: 'Standard chat is free; Priority Chat uses one token for faster handling.',
    stepByStep: [
      'Earn tokens at the Day 3, Day 6, and Day 7 streak milestones.',
      'Open Ask a Pharmacist.',
      'Choose Standard Chat for the regular queue or Priority Chat for faster handling.',
      'Priority Chat deducts 1 token after you submit the request.',
    ],
    importantRule: 'Priority handling is not an emergency service.',
    tourStep: {
      id: 'priority-chat',
      path: '/patient/ask',
      target: '#pm-tour-chat-type-options',
      title: 'Choose Standard or Priority Chat',
      description:
        'Use one token for Priority Chat, or choose Standard Chat without spending a token.',
    },
  },
  {
    id: 'order-medicine',
    category: 'Orders & Scans',
    question: 'How do I order OTC or prescription medicine?',
    keywords: ['order', 'otc', 'prescription', 'upload', 'pharmacy', 'delivery'],
    summary: 'OTC medicines can be browsed directly; prescription items require pharmacist review.',
    stepByStep: [
      'Open the Orders tab.',
      'Choose OTC & Vitamins to browse non-prescription products.',
      'For prescription medicine, choose Prescription (Rx) Meds and upload a clear prescription.',
      'Wait for pharmacist approval before payment and fulfillment.',
      'Use Track Orders to follow packing, dispatch, and delivery.',
    ],
    importantRule: 'Prescription quantities cannot exceed the pharmacist-approved balance.',
    tourStep: {
      id: 'order-medicine',
      path: '/patient/shop',
      target: '.pm-shop-mode-tabs, .pm-shop-track-button',
      title: 'Order Pharmacy Medicines',
      description:
        'Choose OTC products for direct purchase or upload a prescription for pharmacist review.',
    },
  },
  {
    id: 'connect-caregiver',
    category: 'Family / Caregiver',
    question: 'How do I connect a family member or caregiver?',
    keywords: ['caregiver', 'family', 'patient code', 'link', 'invite', 'PM code'],
    summary: 'Generate a temporary secure code and share it only with someone you trust.',
    stepByStep: [
      'Open Profile and find Caregiver Access.',
      'Generate a new secure caregiver code.',
      'Give the code to your trusted caregiver before it expires.',
      'The caregiver enters the code and selects their relationship to you.',
      'Review linked caregivers in Profile at any time.',
    ],
    importantRule: 'Do not post your caregiver code publicly.',
    tourStep: {
      id: 'connect-caregiver',
      path: '/patient/profile',
      target: '.pm-caregiver-card',
      title: 'Connect a Trusted Caregiver',
      description:
        'Generate a secure code here and share it only with the family member helping with your medicines.',
    },
  },
];

export const FAQ_CATEGORIES = [
  'All',
  'Schedule & Doses',
  'Taking Medicine',
  'Streaks & Rewards',
  'Pharmacist & Tokens',
  'Orders & Scans',
  'Family / Caregiver',
];

export default faqData;
