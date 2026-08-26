/* oxlint-disable react/only-export-components */
import { createContext, useContext, useMemo, useState } from 'react';

const translations = {
  en: {
    'nav.home': 'Home',
    'nav.medications': 'Medications',
    'nav.ask': 'Ask',
    'nav.orders': 'Orders',
    'nav.profile': 'Profile',
    'profile.title': 'Profile',
    'profile.subtitle': 'Edit your profile.',
    'profile.personal': 'Personal Data',
    'profile.member': 'Member since',
    'profile.patientId': 'Patient ID',
    'profile.caregiverTitle': 'Caregiver Access',
    'profile.caregiverSubtitle': 'Share your health information with a trusted caregiver.',
    'profile.shareTitle': 'Share with your caregiver',
    'profile.shareHelp': 'Generate a secure, single-use code for someone you trust.',
    'profile.code': 'Your Caregiver Code',
    'profile.generate': 'Generate a new code',
    'profile.expiry': 'Codes expire after 15 minutes.',
    'profile.share': 'Share',
    'profile.copy': 'Copy',
    'profile.newCode': 'New Code',
    'profile.linked': 'Linked caregivers',
    'profile.edit': 'Edit Profile',
    'profile.fullName': 'Full name',
    'profile.condition': 'Medical condition',
    'profile.save': 'Save Changes',
    'profile.language': 'Language',
    'profile.displayLanguage': 'Display language',
    'profile.notifications': 'Notifications',
    'profile.reminders': 'Medicine reminders',
    'profile.voice': 'Voice reminders',
    'profile.vibration': 'Vibration',
    'profile.privacy': 'Settings & Privacy',
    'profile.privacyText':
      'Your personal information is encrypted. Pharmacists identify you using your patient code, while caregiver access requires your one-time invitation.',
    'profile.others': 'Others',
    'profile.support': 'Priority Support',
    'profile.logout': 'Log out',
  },
  fil: {
    'nav.home': 'Home',
    'nav.medications': 'Mga Gamot',
    'nav.ask': 'Magtanong',
    'nav.orders': 'Mga Order',
    'nav.profile': 'Profile',
    'profile.title': 'Profile',
    'profile.subtitle': 'I-edit ang iyong profile.',
    'profile.personal': 'Personal na Impormasyon',
    'profile.member': 'Miyembro mula',
    'profile.patientId': 'Patient ID',
    'profile.caregiverTitle': 'Access ng Tagapag-alaga',
    'profile.caregiverSubtitle':
      'Ibahagi ang impormasyong pangkalusugan sa pinagkakatiwalaang tagapag-alaga.',
    'profile.shareTitle': 'Ibahagi sa iyong tagapag-alaga',
    'profile.shareHelp': 'Gumawa ng ligtas at isang-beses-gamitin na code.',
    'profile.code': 'Code ng Tagapag-alaga',
    'profile.generate': 'Gumawa ng bagong code',
    'profile.expiry': 'Mag-e-expire ang code pagkalipas ng 15 minuto.',
    'profile.share': 'Ibahagi',
    'profile.copy': 'Kopyahin',
    'profile.newCode': 'Bagong Code',
    'profile.linked': 'Mga nakakonektang tagapag-alaga',
    'profile.edit': 'I-edit ang Profile',
    'profile.fullName': 'Buong pangalan',
    'profile.condition': 'Kondisyong medikal',
    'profile.save': 'I-save ang mga Pagbabago',
    'profile.language': 'Wika',
    'profile.displayLanguage': 'Wika ng display',
    'profile.notifications': 'Mga Abiso',
    'profile.reminders': 'Paalala sa gamot',
    'profile.voice': 'Paalalang may boses',
    'profile.vibration': 'Pag-vibrate',
    'profile.privacy': 'Mga Setting at Privacy',
    'profile.privacyText':
      'Naka-encrypt ang iyong personal na impormasyon. Patient ID lamang ang nakikita ng parmasyutiko, at kailangan ng isang-beses-gamitin na imbitasyon para sa caregiver access.',
    'profile.others': 'Iba pa',
    'profile.support': 'Prayoridad na Suporta',
    'profile.logout': 'Mag-log out',
  },
};

const LanguageContext = createContext(null);
export function LanguageProvider({ children }) {
  const [language, setLanguageState] = useState(() =>
    localStorage.getItem('pm_language') === 'Filipino' ? 'fil' : 'en'
  );
  const value = useMemo(
    () => ({
      language,
      setLanguage(next) {
        localStorage.setItem('pm_language', next === 'fil' ? 'Filipino' : 'English');
        setLanguageState(next);
      },
      t(key) {
        return translations[language]?.[key] || translations.en[key] || key;
      },
    }),
    [language]
  );
  return <LanguageContext.Provider value={value}>{children}</LanguageContext.Provider>;
}
export function useLanguage() {
  const context = useContext(LanguageContext);
  if (!context) throw new Error('useLanguage must be used inside LanguageProvider');
  return context;
}
