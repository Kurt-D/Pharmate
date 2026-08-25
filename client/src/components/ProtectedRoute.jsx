import { Navigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext.jsx';
import { homeForRole } from '../config/roleRoutes.js';

export default function ProtectedRoute({ role, allowedRoles, children }) {
  const { user } = useAuth();
  if (!user) return <Navigate to="/login" replace />;
  const permittedRoles = allowedRoles || (role ? [role] : []);
  if (!permittedRoles.includes(user.role)) {
    return <Navigate to={homeForRole(user.role)} replace />;
  }
  return children;
}
