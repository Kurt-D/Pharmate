export const ROLE_HOME = Object.freeze({
  admin: '/admin/dashboard',
  pharmacist: '/pharmacist/dashboard',
  patient: '/patient/today',
  caregiver: '/caregiver/overview',
});

export function homeForRole(role) {
  return ROLE_HOME[role] || '/login';
}
