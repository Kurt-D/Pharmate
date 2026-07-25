import { Navigate } from 'react-router-dom';

/**
 * Sprint 2 will wire this to a real auth context.
 * For now it reads a stub token from localStorage so the shell renders.
 */
export default function ProtectedRoute({ role, children }) {
  const stored = localStorage.getItem('pm_user');
  if (!stored) return <Navigate to="/login" replace />;

  try {
    const user = JSON.parse(stored);
    if (user.role !== role) return <Navigate to="/login" replace />;
    return children;
  } catch {
    return <Navigate to="/login" replace />;
  }
}
