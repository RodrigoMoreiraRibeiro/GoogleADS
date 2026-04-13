import { createBrowserRouter, Navigate } from 'react-router';

import { AppShell } from '../layouts/app-shell';
import { AdminSettingsPage } from '../../modules/admin/routes/admin-settings-page';
import { LoginPage } from '../../modules/auth/routes/login-page';
import { ClientDetailPage } from '../../modules/clients/routes/client-detail-page';
import { DashboardPage } from '../../modules/dashboard/routes/dashboard-page';
import { GoogleAdsConnectionsPage } from '../../modules/google-ads/routes/google-ads-connections-page';
import { ReportsPage } from '../../modules/reports/routes/reports-page';

export const appRouter = createBrowserRouter([
  {
    path: '/',
    element: <Navigate to="/login" replace />,
  },
  {
    path: '/login',
    element: <LoginPage />,
  },
  {
    element: <AppShell />,
    children: [
      {
        path: '/dashboard',
        element: <DashboardPage />,
      },
      {
        path: '/admin/settings',
        element: <AdminSettingsPage />,
      },
      {
        path: '/clients/:clientId',
        element: <ClientDetailPage />,
      },
      {
        path: '/integrations/google-ads',
        element: <GoogleAdsConnectionsPage />,
      },
      {
        path: '/reports',
        element: <ReportsPage />,
      },
    ],
  },
]);
