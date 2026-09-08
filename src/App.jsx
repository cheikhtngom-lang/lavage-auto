import React, { useEffect } from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';

// Layouts
import MainLayout from './components/layout/MainLayout';
import AdminLayout from './components/layout/AdminLayout';
import SuperAdminLayout from './components/layout/SuperAdminLayout';
import ClientLayout from './components/layout/ClientLayout';

// State Providers
import { AppStateProvider, useAppState } from './hooks/useAppState';
import { SuperAdminStateProvider } from './hooks/useSuperAdminState';
import { ClientAccountProvider } from './hooks/useClientAccount';
import { startIdleWatch } from './lib/idleTimeout';
import { hasPerm } from './lib/permissions';

// Pages Client
import ClientOverview from './pages/Client/Dashboard';
import ClientLoyalty from './pages/Client/Loyalty';
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
import Bilan from './pages/Admin/Bilan';
import SubscriptionEnded from './pages/Admin/SubscriptionEnded';
// Pages Super Admin
import SuperAdminDashboard from './pages/SuperAdmin/Dashboard';
import SuperAdminAnalytics from './pages/SuperAdmin/Analytics';
import SuperAdminStations from './pages/SuperAdmin/Stations';
import SuperAdminModules from './pages/SuperAdmin/Modules';
import SuperAdminMotorists from './pages/SuperAdmin/Motorists';
import SuperAdminSuperUsers from './pages/SuperAdmin/SuperUsers';
import SuperAdminAds from './pages/SuperAdmin/Ads';
import SuperAdminBilling from './pages/SuperAdmin/Billing';
import SuperAdminBilan from './pages/SuperAdmin/Bilan';
import SuperAdminSupport from './pages/SuperAdmin/Support';
import SuperAdminSettings from './pages/SuperAdmin/Settings';

// Mock Home/Login Pages
const Home = () => (
  <Navigate to="/admin/queue" replace />
);

// Contrôle d'accès "interface" pour un collaborateur 'staff' (voir
// lib/permissions.js). Le propriétaire a ['*'] : jamais bloqué. Un staff sans
// la permission est renvoyé sur la file d'attente (toujours accessible).
function RequirePerm({ perm, children }) {
  const { myPermissions } = useAppState();
  if (myPermissions == null) return null; // permissions encore en chargement
  if (hasPerm(myPermissions, perm)) return children;
  return <Navigate to="/admin/queue" replace />;
}

// Le Bilan est réservé au forfait Business (35 000) — ou débloqué
// indépendamment du plan via le module "mod_bilan" (Super Admin > Modules,
// voir lib/stationModules.js). On attend le chargement de la facturation
// avant de conclure (null = pas encore chargé).
function RequireBusinessPlan({ children }) {
  const { stationBilling, myPermissions } = useAppState();
  if (stationBilling == null || myPermissions == null) return null;
  const canSeeBilan = stationBilling.plan === 'Business' || (stationBilling.activeModules || []).includes('mod_bilan');
  const canSeeFinance = hasPerm(myPermissions, 'accounting.manage');
  if (canSeeBilan && canSeeFinance) return children;
  return <Navigate to="/admin/queue" replace />;
}

function App() {
  // Expiration de session : déconnexion après 1 h sans interaction
  // (voir lib/idleTimeout.js). Ne touche pas aux visiteurs anonymes de /stations.
  useEffect(() => startIdleWatch(), []);

  return (
    <AppStateProvider>
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
                <Route path="fidelite" element={<ClientLoyalty />} />
                <Route path="garage" element={<ClientGarage />} />
                <Route path="stations" element={<Stations />} />
                <Route path="mes-stations" element={<MyStations />} />
                <Route path="parametres" element={<ClientSettings />} />
              </Route>

              {/* Routes Admin Station */}
              {/* Hors AdminLayout : aucun menu, seule action possible = renouveler
                  (voir SubscriptionEnded.jsx et le redirect dans AdminLayout.jsx) */}
              <Route path="/admin/renouveler" element={<SubscriptionEnded />} />

              <Route path="/admin" element={<AdminLayout />}>
                <Route index element={<Navigate to="/admin/queue" replace />} />
                <Route path="queue" element={<StationDashboard />} />
                <Route path="transactions" element={<RequirePerm perm="transactions.view"><AdminTransactions /></RequirePerm>} />
                <Route path="accounting" element={<RequirePerm perm="accounting.manage"><Accounting /></RequirePerm>} />
                <Route path="analytics" element={<RequirePerm perm="analytics.view"><Analytics /></RequirePerm>} />
                <Route path="bilan" element={<RequireBusinessPlan><Bilan /></RequireBusinessPlan>} />
                <Route path="team" element={<RequirePerm perm="team.manage"><Team /></RequirePerm>} />
                <Route path="washers" element={<RequirePerm perm="washers.manage"><Washers /></RequirePerm>} />
                <Route path="subscriptions" element={<RequirePerm perm="subscriptions.manage"><Subscriptions /></RequirePerm>} />
                <Route path="settings" element={<RequirePerm perm="settings.manage"><Settings /></RequirePerm>} />
              </Route>

              {/* Routes Super Admin */}
              <Route path="/superadmin" element={<SuperAdminLayout />}>
                <Route index element={<SuperAdminDashboard />} />
                <Route path="analytics" element={<SuperAdminAnalytics />} />
                <Route path="stations" element={<SuperAdminStations />} />
                <Route path="modules" element={<SuperAdminModules />} />
                <Route path="automobilistes" element={<SuperAdminMotorists />} />
                <Route path="super-users" element={<SuperAdminSuperUsers />} />
                <Route path="ads" element={<SuperAdminAds />} />
                <Route path="billing" element={<SuperAdminBilling />} />
                <Route path="bilan" element={<SuperAdminBilan />} />
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
