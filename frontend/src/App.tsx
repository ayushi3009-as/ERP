import { useState } from 'react';
import { Routes, Route, Navigate, useNavigate } from 'react-router-dom';
import { useAuthStore } from '@/store/authStore';
import { Sidebar } from '@/components/layout/Sidebar';
import Logo from '@/components/ui/Logo';

// Page imports
import LoginPage from '@/pages/auth/LoginPage';
import DashboardPage from '@/pages/dashboard/DashboardPage';
import MastersListPage from '@/pages/masters/MastersListPage';
import EmployeesPage from '@/pages/masters/EmployeesPage';
import ProductsPage from '@/pages/masters/ProductsPage';
import LotsPage from '@/pages/production/LotsPage';
import ScannerPage from '@/pages/production/ScannerPage';
import AttendancePage from '@/pages/payroll/AttendancePage';
import ReportsPage from '@/pages/reports/ReportsPage';
import CompanySettingsPage from '@/pages/settings/CompanySettingsPage';
import UsersSettingsPage from '@/pages/settings/UsersSettingsPage';

function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  if (!isAuthenticated) return <Navigate to="/login" replace />;
  return <>{children}</>;
}

function AppLayout({ children }: { children: React.ReactNode }) {
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const user = useAuthStore((s) => s.user);
  const logout = useAuthStore((s) => s.logout);
  const navigate = useNavigate();

  return (
    <div className="flex h-screen overflow-hidden bg-background">
      <Sidebar collapsed={sidebarCollapsed} onToggle={() => setSidebarCollapsed(!sidebarCollapsed)} />
      <div className="flex flex-1 flex-col overflow-hidden">
        <header className="flex h-[56px] items-center justify-between border-b border-border bg-card px-6">
          <h1 className="text-[13px] font-semibold tracking-tight text-muted-foreground">
            <span className="text-purple-600 dark:text-purple-400">Microtechnique</span>{' '}
            <span className="font-normal">MANUFACTURING</span>
          </h1>
          <div className="flex items-center gap-4">
            <span className="text-sm text-muted-foreground">{user?.name || user?.email || 'Admin'}</span>
            <button
              onClick={() => { logout(); navigate('/login'); }}
              className="rounded-md bg-destructive/10 px-3 py-1.5 text-xs font-medium text-destructive hover:bg-destructive/20"
            >
              Logout
            </button>
          </div>
        </header>
        <main className="flex-1 overflow-y-auto p-6 scrollbar-thin">
          {children}
        </main>
      </div>
    </div>
  );
}

function Placeholder({ title }: { title: string }) {
  return (
    <div className="flex h-full items-center justify-center">
      <div className="text-center">
        <h2 className="text-2xl font-semibold text-foreground">{title}</h2>
        <p className="mt-2 text-sm text-muted-foreground">This module is currently under development.</p>
      </div>
    </div>
  );
}

export default function App() {
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);

  return (
    <Routes>
      <Route path="/login" element={isAuthenticated ? <Navigate to="/" replace /> : <LoginPage />} />
      <Route path="/" element={!isAuthenticated ? <Navigate to="/login" replace /> : <Navigate to="/dashboard" replace />} />
      <Route path="/dashboard" element={<ProtectedRoute><AppLayout><DashboardPage /></AppLayout></ProtectedRoute>} />
      
      {/* Masters */}
      <Route path="/masters/employees" element={<ProtectedRoute><AppLayout><EmployeesPage /></AppLayout></ProtectedRoute>} />
      <Route path="/masters/products" element={<ProtectedRoute><AppLayout><ProductsPage /></AppLayout></ProtectedRoute>} />
      <Route path="/masters/categories" element={<ProtectedRoute><AppLayout><MastersListPage /></AppLayout></ProtectedRoute>} />
      <Route path="/masters/designs" element={<ProtectedRoute><AppLayout><MastersListPage /></AppLayout></ProtectedRoute>} />
      <Route path="/masters/fabrics" element={<ProtectedRoute><AppLayout><MastersListPage /></AppLayout></ProtectedRoute>} />
      <Route path="/masters/sizes" element={<ProtectedRoute><AppLayout><MastersListPage /></AppLayout></ProtectedRoute>} />

      {/* Production */}
      <Route path="/production/lots" element={<ProtectedRoute><AppLayout><LotsPage /></AppLayout></ProtectedRoute>} />
      <Route path="/production/scanner" element={<ProtectedRoute><AppLayout><ScannerPage /></AppLayout></ProtectedRoute>} />
      <Route path="/production/tracking" element={<ProtectedRoute><AppLayout><Placeholder title="Process Tracking" /></AppLayout></ProtectedRoute>} />

      {/* Payroll */}
      <Route path="/payroll/attendance" element={<ProtectedRoute><AppLayout><AttendancePage /></AppLayout></ProtectedRoute>} />

      {/* Reports */}
      <Route path="/reports/production" element={<ProtectedRoute><AppLayout><ReportsPage /></AppLayout></ProtectedRoute>} />
      <Route path="/reports/scans" element={<ProtectedRoute><AppLayout><ReportsPage /></AppLayout></ProtectedRoute>} />

      {/* Settings */}
      <Route path="/settings/company" element={<ProtectedRoute><AppLayout><CompanySettingsPage /></AppLayout></ProtectedRoute>} />
      <Route path="/settings/users" element={<ProtectedRoute><AppLayout><UsersSettingsPage /></AppLayout></ProtectedRoute>} />
      <Route path="/settings/roles" element={<ProtectedRoute><AppLayout><Placeholder title="Role Management" /></AppLayout></ProtectedRoute>} />

      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
