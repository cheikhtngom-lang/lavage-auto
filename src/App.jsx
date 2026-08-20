import React, { useEffect, useState } from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';

// Layouts
import MainLayout from './components/layout/MainLayout';
import AdminLayout from './components/layout/AdminLayout';
import SuperAdminLayout from './components/layout/SuperAdminLayout';
import ClientLayout from './components/layout/ClientLayout';

// State Providers
import { AppStateProvider } from './hooks/useAppState';
import { SuperAdminStateProvider } from './hooks/useSuperAdminState';
import { ClientAccountProvider } from './hooks/useClientAccount';
import { getCurrentStationId } from './lib/accounts';

// Pages Client
import ClientOverview from './pages/Client/Dashboard';
import ClientGarage from './pages/Client/Garage';
import ClientSettings from './pages/Client/Settings';
import Stations from './pages/Client/Stations';
import MyStations from './pages/Client/MyStations';

// Pages Admin (Station)
import StationDashboard from './pages/Admin/StationDashboard';
import AdminTransactions from './pages/Admin/Transactions';
import Accounting from './pages/Admin/Accounting';
import Analytics from './pages/Admin/Analytics';
import Team from './pages/Admin/Team';
import Washers from './pages/Admin/Washers';
import Settings from './pages/Admin/Settings';
import Subscriptions from './pages/Admin/Subscriptions';
// Pages Super Admin
import SuperAdminDashboard from './pages/SuperAdmin/Dashboard';
import SuperAdminAnalytics from './pages/SuperAdmin/Analytics';
import SuperAdminStations from './pages/SuperAdmin/Stations';
import SuperAdminMotorists from './pages/SuperAdmin/Motorists';
import SuperAdminSuperUsers from './pages/SuperAdmin/SuperUsers';
import SuperAdminAds from './pages/SuperAdmin/Ads';
import SuperAdminBilling from './pages/SuperAdmin/Billing';
import SuperAdminSupport from './pages/SuperAdmin/Support';
import SuperAdminSettings from './pages/SuperAdmin/Settings';

// Mock Home/Login Pages
const Home = () => (
  <Navigate to="/admin/queue" replace />
);

function App() {
  // La station "active" (celle dont useAppState isole les données) peut changer
  // sans rechargement de page complet lors d'une impersonation Super Admin.
  // On remonte AppStateProvider (via `key`) à chaque changement pour qu'il
  // relise les bonnes données depuis localStorage.
  const [stationId, setStationId] = useState(getCurrentStationId());

  useEffect(() => {
    const handler = () => setStationId(getCurrentStationId());
    window.addEventListener('station-session-changed', handler);
    return () => window.removeEventListener('station-session-changed', handler);
  }, []);

  return (
    <AppStateProvider key={stationId}>
      <SuperAdminStateProvider>
        <ClientAccountProvider>
          <Router>
            <Routes>
              {/* Routes Client / Public */}
              <Route path="/" element={<MainLayout />}>
                <Route index element={<Home />} />
                <Route path="stations" element={<Stations />} />
              </Route>

              {/* Espace Automobiliste */}
              <Route path="/dashboard" element={<ClientLayout />}>
                <Route index element={<ClientOverview />} />
                <Route path="garage" element={<ClientGarage />} />
                <Route path="stations" element={<Stations />} />
                <Route path="mes-stations" element={<MyStations />} />
                <Route path="parametres" element={<ClientSettings />} />
              </Route>

              {/* Routes Admin Station */}
              <Route path="/admin" element={<AdminLayout />}>
                <Route index element={<Navigate to="/admin/queue" replace />} />
                <Route path="queue" element={<StationDashboard />} />
                <Route path="transactions" element={<AdminTransactions />} />
                <Route path="accounting" element={<Accounting />} />
                <Route path="analytics" element={<Analytics />} />
                <Route path="team" element={<Team />} />
                <Route path="washers" element={<Washers />} />
                <Route path="subscriptions" element={<Subscriptions />} />
                <Route path="settings" element={<Settings />} />
              </Route>

              {/* Routes Super Admin */}
              <Route path="/superadmin" element={<SuperAdminLayout />}>
                <Route index element={<SuperAdminDashboard />} />
                <Route path="analytics" element={<SuperAdminAnalytics />} />
                <Route path="stations" element={<SuperAdminStations />} />
                <Route path="automobilistes" element={<SuperAdminMotorists />} />
                <Route path="super-users" element={<SuperAdminSuperUsers />} />
                <Route path="ads" element={<SuperAdminAds />} />
                <Route path="billing" element={<SuperAdminBilling />} />
                <Route path="support" element={<SuperAdminSupport />} />
                <Route path="settings" element={<SuperAdminSettings />} />
              </Route>
            </Routes>
          </Router>
        </ClientAccountProvider>
      </SuperAdminStateProvider>
    </AppStateProvider>
  );
}

export default App;
