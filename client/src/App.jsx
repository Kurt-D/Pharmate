import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider } from './context/AuthContext.jsx';
import { LanguageProvider } from './context/LanguageContext.jsx';
import { AccessibilityProvider } from './context/AccessibilityContext.jsx';
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
import StreakDetails from './pages/patient/StreakDetails.jsx';
import Ask from './pages/patient/AskRedesign.jsx';
import Orders from './pages/patient/OrdersRedesign.jsx';
import Shop from './pages/patient/Shop.jsx';
import Profile from './pages/patient/ProfileRedesign.jsx';
import AccessibilitySettings from './pages/patient/AccessibilitySettings.jsx';
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
import CaregiverPortal from './pages/caregiver/CaregiverPortal.jsx';
import ProtectedRoute from './components/ProtectedRoute.jsx';
import './App.css';
import './styles/typography.css';

export default function App() {
  return (
    <LanguageProvider>
      <AccessibilityProvider>
        <AuthProvider>
          <BrowserRouter>
            <Routes>
              <Route path="/login" element={<Login />} />
              <Route path="/reset-password" element={<Login />} />
              <Route path="/signup" element={<Signup />} />
              <Route path="/identify" element={<IdentifyUser />} />

              <Route
                path="/patient/onboarding"
                element={
                  <ProtectedRoute allowedRoles={['patient']}>
                    <AnchorOnboarding />
                  </ProtectedRoute>
                }
              />
              <Route
                path="/patient"
                element={
                  <ProtectedRoute allowedRoles={['patient']}>
                    <PatientLayout />
                  </ProtectedRoute>
                }
              >
                <Route index element={<Navigate to="/patient/today" replace />} />
                <Route path="today" element={<Today />} />
                <Route path="home" element={<Today />} />
                <Route path="streak" element={<StreakDetails />} />
                <Route path="medications" element={<Medications />} />
                <Route path="medications/add" element={<AddMedicine />} />
                <Route path="medications/prescription" element={<PrescriptionUpload />} />
                <Route path="schedule" element={<Schedule />} />
                <Route path="medications/:id/prescription" element={<PrescriptionUpload />} />
                <Route path="ask" element={<Ask />} />
                <Route path="orders" element={<Orders />} />
                <Route path="shop" element={<Shop />} />
                <Route path="profile" element={<Profile />} />
                <Route path="accessibility" element={<AccessibilitySettings />} />
              </Route>
              <Route
                path="/pharmacist"
                element={
                  <ProtectedRoute allowedRoles={['pharmacist']}>
                    <PharmacistLayout />
                  </ProtectedRoute>
                }
              >
                <Route index element={<Navigate to="/pharmacist/verification-queue" replace />} />
                <Route path="dashboard" element={<PharmacistDashboard />} />
                <Route path="verification-queue" element={<Validation />} />
                <Route path="curation" element={<DrugCuration />} />
                <Route path="validation" element={<Validation />} />
                <Route path="inquiries" element={<Inquiries />} />
                <Route path="orders" element={<OrdersQueue />} />
                <Route path="queue" element={<OrdersQueue />} />
                <Route path="patients" element={<Patients />} />
                <Route path="alerts" element={<PharmacistAlerts />} />
              </Route>
              <Route
                path="/admin"
                element={
                  <ProtectedRoute allowedRoles={['admin']}>
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
                  <ProtectedRoute allowedRoles={['caregiver']}>
                    <CaregiverPortal />
                  </ProtectedRoute>
                }
              />

              <Route path="/" element={<Navigate to="/login" replace />} />
              <Route path="*" element={<Navigate to="/login" replace />} />
            </Routes>
          </BrowserRouter>
        </AuthProvider>
      </AccessibilityProvider>
    </LanguageProvider>
  );
}
