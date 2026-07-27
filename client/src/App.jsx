import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider } from './context/AuthContext.jsx';
import Login from './pages/Login.jsx';
import AnchorOnboarding from './pages/AnchorOnboarding.jsx';
import PatientLayout from './pages/patient/PatientLayout.jsx';
import Medications from './pages/patient/Medications.jsx';
import AddMedicine from './pages/patient/AddMedicine.jsx';
import Placeholder from './pages/patient/Placeholder.jsx';
import PharmacistDashboard from './pages/PharmacistDashboard.jsx';
import AdminDashboard from './pages/AdminDashboard.jsx';
import CaregiverDashboard from './pages/CaregiverDashboard.jsx';
import ProtectedRoute from './components/ProtectedRoute.jsx';
import './App.css';

export default function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <Routes>
          <Route path="/login" element={<Login />} />

          <Route
            path="/patient/onboarding"
            element={
              <ProtectedRoute role="patient">
                <AnchorOnboarding />
              </ProtectedRoute>
            }
          />
          <Route
            path="/patient"
            element={
              <ProtectedRoute role="patient">
                <PatientLayout />
              </ProtectedRoute>
            }
          >
            <Route index element={<Navigate to="/patient/medications" replace />} />
            <Route
              path="home"
              element={
                <Placeholder title="Welcome, Patient!" note="Manage your health with ease." />
              }
            />
            <Route path="medications" element={<Medications />} />
            <Route path="medications/add" element={<AddMedicine />} />
            <Route
              path="ask"
              element={<Placeholder title="Ask a Pharmacist" note="We're here to help." />}
            />
            <Route
              path="orders"
              element={<Placeholder title="Orders" note="Track your orders." />}
            />
            <Route
              path="profile"
              element={<Placeholder title="Profile" note="Edit your profile." />}
            />
          </Route>
          <Route
            path="/pharmacist/*"
            element={
              <ProtectedRoute role="pharmacist">
                <PharmacistDashboard />
              </ProtectedRoute>
            }
          />
          <Route
            path="/admin/*"
            element={
              <ProtectedRoute role="admin">
                <AdminDashboard />
              </ProtectedRoute>
            }
          />
          <Route
            path="/caregiver/*"
            element={
              <ProtectedRoute role="caregiver">
                <CaregiverDashboard />
              </ProtectedRoute>
            }
          />

          <Route path="/" element={<Navigate to="/login" replace />} />
          <Route path="*" element={<Navigate to="/login" replace />} />
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  );
}
