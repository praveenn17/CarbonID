import { BrowserRouter, Routes, Route, Navigate, Outlet } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import React from 'react';
import { useAuthStore } from './store/authStore';

// Lazy load pages for performance
const Login = React.lazy(() => import('./pages/Login'));
const Register = React.lazy(() => import('./pages/Register'));
const Dashboard = React.lazy(() => import('./pages/Dashboard'));
const Onboarding = React.lazy(() => import('./pages/Onboarding'));
const Marketplace = React.lazy(() => import('./pages/Marketplace'));
const Passport = React.lazy(() => import('./pages/Passport'));
const Imports = React.lazy(() => import('./pages/Imports'));

const queryClient = new QueryClient();

// Protected Route Wrapper - Ensures token exists and is valid
const ProtectedRoute = () => {
  const { token, isTokenExpired, clearAuth } = useAuthStore();
  
  if (!token) return <Navigate to="/login" replace />;
  if (isTokenExpired()) {
    // Clear invalid state immediately before redirect
    clearAuth();
    return <Navigate to="/login" replace />;
  }
  return <Outlet />;
};

// Public Route Wrapper - Prevents logged-in users from seeing login/register
const PublicRoute = () => {
  const { token, isTokenExpired } = useAuthStore();
  if (token && !isTokenExpired()) {
    return <Navigate to="/dashboard" replace />;
  }
  return <Outlet />;
};

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <div className="min-h-screen bg-slate-950 font-sans text-slate-50 transition-colors duration-300">
          <React.Suspense fallback={
            <div className="flex flex-col h-screen w-screen items-center justify-center bg-slate-950">
              <div className="h-10 w-10 animate-spin rounded-full border-4 border-emerald-500/20 border-t-emerald-500 mb-4"></div>
              <div className="text-slate-400 font-medium tracking-widest text-sm uppercase">Loading CarbonID</div>
            </div>
          }>
            <Routes>
              {/* Public Routes */}
              <Route element={<PublicRoute />}>
                <Route path="/login" element={<Login />} />
                <Route path="/register" element={<Register />} />
              </Route>
              
              {/* Protected Routes */}
              <Route element={<ProtectedRoute />}>
                <Route path="/" element={<Navigate to="/dashboard" replace />} />
                <Route path="/dashboard" element={<Dashboard />} />
                <Route path="/onboarding" element={<Onboarding />} />
                <Route path="/marketplace" element={<Marketplace />} />
                <Route path="/passport" element={<Passport />} />
                <Route path="/imports" element={<Imports />} />
              </Route>
            </Routes>
          </React.Suspense>
        </div>
      </BrowserRouter>
    </QueryClientProvider>
  );
}

export default App;
