import { Home, Pill, Truck, User, Users } from 'lucide-react';

const ITEMS = [
  { id: 'home', label: 'Home', icon: Home },
  { id: 'medication', label: 'Medication', icon: Pill },
  { id: 'patient-info', label: 'Patient Info', icon: Users },
  { id: 'orders', label: 'Orders', icon: Truck },
  { id: 'profile', label: 'Profile', icon: User },
];

export default function CaregiverNavbar({ active, onChange }) {
  return (
    <nav
      className="cg-bottomnav sticky bottom-0 z-40 grid w-full grid-cols-5 border-t border-slate-100 bg-white px-0 pb-[max(.6rem,env(safe-area-inset-bottom))] pt-2"
      aria-label="Caregiver navigation"
    >
      {ITEMS.map(({ id, label, icon: Icon }) => {
        const selected = active === id;
        return (
          <button
            aria-current={selected ? 'page' : undefined}
            className={`cg-bottomnav__item flex min-h-[54px] flex-col items-center justify-center gap-1 border-0 bg-transparent px-0.5 text-[10px] font-semibold transition active:scale-95 ${selected ? 'is-active text-blue-600' : 'text-slate-500 hover:text-slate-800'}`}
            key={id}
            onClick={() => onChange(id)}
            type="button"
          >
            <Icon className="h-5 w-5 stroke-[2.2]" aria-hidden="true" />
            <span className="whitespace-nowrap leading-tight">{label}</span>
          </button>
        );
      })}
    </nav>
  );
}
