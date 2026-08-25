export const ROLE_HOME = Object.freeze({
  admin: '/admin/dashboard',
  pharmacist: '/pharmacist/verification-queue',
  patient: '/patient/today',
  caregiver: '/caregiver/overview',
});

export function homeForRole(role) {
  return ROLE_HOME[role] || '/login';
}
