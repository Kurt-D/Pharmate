import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider } from './context/AuthContext.jsx';
import { LanguageProvider } from './context/LanguageContext.jsx';
import Login from './pages/LoginRedesign.jsx';
import Signup from './pages/SignupRedesign.jsx';
import IdentifyUser from './pages/IdentifyUser.jsx';
import AnchorOnboarding from './pages/AnchorOnboarding.jsx';
import PatientLayout from './pages/patient/PatientLayout.jsx';
import Medications from './pages/patient/Medications.jsx';
import AddMedicine from './pages/patient/AddMedicine.jsx';
import Schedule from './pages/patient/Schedule.jsx';
import PrescriptionUpload from './pages/patient/PrescriptionUpload.jsx';
import Today from './pages/patient/Today.jsx';
import Ask from './pages/patient/AskRedesign.jsx';
import Orders from './pages/patient/OrdersRedesign.jsx';
import Profile from './pages/patient/ProfileRedesign.jsx';
import PharmacistLayout from './pages/pharmacist/PharmacistLayout.jsx';
import DrugCuration from './pages/pharmacist/DrugCuration.jsx';
import Validation from './pages/pharmacist/Validation.jsx';
import Inquiries from './pages/pharmacist/InquiriesRedesign.jsx';
import OrdersQueue from './pages/pharmacist/OrdersQueue.jsx';
import Patients from './pages/pharmacist/PatientsRedesign.jsx';
import PharmacistDashboard from './pages/pharmacist/DashboardRedesign.jsx';
import PharmacistAlerts from './pages/pharmacist/Alerts.jsx';
import AdminLayout from './pages/admin/AdminLayout.jsx';
import AdminDashboard from './pages/admin/DashboardRedesign.jsx';
import AdminUsers from './pages/admin/UsersRedesign.jsx';
import AdminMedicines from './pages/admin/Medicines.jsx';
import AdminOrders from './pages/admin/Orders.jsx';
import AdminPriority from './pages/admin/Priority.jsx';
import AdminAlerts from './pages/admin/Alerts.jsx';
import AdminReports from './pages/admin/Reports.jsx';
import CaregiverDashboard from './pages/CaregiverDashboardRedesign.jsx';
import ProtectedRoute from './components/ProtectedRoute.jsx';
import './App.css';

export default function App() {
  return (
    <LanguageProvider>
      <AuthProvider>
        <BrowserRouter>
          <Routes>
            <Route path="/login" element={<Login />} />
            <Route path="/signup" element={<Signup />} />
            <Route path="/identify" element={<IdentifyUser />} />

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
              <Route index element={<Navigate to="/patient/home" replace />} />
              <Route path="home" element={<Today />} />
              <Route path="medications" element={<Medications />} />
              <Route path="medications/add" element={<AddMedicine />} />
              <Route path="medications/prescription" element={<PrescriptionUpload />} />
              <Route path="schedule" element={<Schedule />} />
              <Route path="medications/:id/prescription" element={<PrescriptionUpload />} />
              <Route path="ask" element={<Ask />} />
              <Route path="orders" element={<Orders />} />
              <Route path="profile" element={<Profile />} />
            </Route>
            <Route
              path="/pharmacist"
              element={
                <ProtectedRoute role="pharmacist">
                  <PharmacistLayout />
                </ProtectedRoute>
              }
            >
              <Route index element={<Navigate to="/pharmacist/dashboard" replace />} />
              <Route path="dashboard" element={<PharmacistDashboard />} />
              <Route path="curation" element={<DrugCuration />} />
              <Route path="validation" element={<Validation />} />
              <Route path="inquiries" element={<Inquiries />} />
              <Route path="orders" element={<OrdersQueue />} />
              <Route path="patients" element={<Patients />} />
              <Route path="alerts" element={<PharmacistAlerts />} />
            </Route>
            <Route
              path="/admin"
              element={
                <ProtectedRoute role="admin">
                  <AdminLayout />
                </ProtectedRoute>
              }
            >
              <Route index element={<Navigate to="/admin/dashboard" replace />} />
              <Route path="dashboard" element={<AdminDashboard />} />
              <Route path="users" element={<AdminUsers />} />
              <Route path="medicines" element={<AdminMedicines />} />
              <Route path="orders" element={<AdminOrders />} />
              <Route path="priority" element={<AdminPriority />} />
              <Route path="alerts" element={<AdminAlerts />} />
              <Route path="reports" element={<AdminReports />} />
            </Route>
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
    </LanguageProvider>
  );
}
