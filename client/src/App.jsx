import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import Login from './pages/Login.jsx';
import PatientDashboard from './pages/PatientDashboard.jsx';
import PharmacistDashboard from './pages/PharmacistDashboard.jsx';
import AdminDashboard from './pages/AdminDashboard.jsx';
import CaregiverDashboard from './pages/CaregiverDashboard.jsx';
import ProtectedRoute from './components/ProtectedRoute.jsx';
import './App.css';

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/login" element={<Login />} />

        <Route
          path="/patient/*"
          element={
            <ProtectedRoute role="patient">
              <PatientDashboard />
            </ProtectedRoute>
          }
        />
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
  );
}
