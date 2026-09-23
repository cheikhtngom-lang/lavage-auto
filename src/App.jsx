import React, { useEffect, lazy } from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';

// Layouts
import MainLayout from './components/layout/MainLayout';
import AdminLayout from './components/layout/AdminLayout';
import SuperAdminLayout from './components/layout/SuperAdminLayout';
import ClientLayout from './components/layout/ClientLayout';
import GroupLayout from './components/layout/GroupLayout';

// State Providers
import { AppStateProvider, useAppState } from './hooks/useAppState';
import { SuperAdminStateProvider } from './hooks/useSuperAdminState';
import { ClientAccountProvider } from './hooks/useClientAccount';
import { startIdleWatch } from './lib/idleTimeout';
import { hasPerm } from './lib/permissions';
import { stationHasShop } from './lib/shop';
import { stationHasVidange } from './lib/vidange';
import { stationHasPompistes } from './lib/pompistes';
import PageSuspense from './components/ui/PageSuspense';

// Pages chargées à la demande (une par rubrique) — voir components/ui/PageSuspense.jsx.
// Après un déploiement, un onglet resté ouvert réclame d'anciens fichiers qui
// n'existent plus sur le serveur : on recharge la page une fois (garde en
// sessionStorage contre une boucle) pour récupérer la nouvelle version.
const lazyPage = (load) => lazy(() => load().then((mod) => {
  try { sessionStorage.removeItem('ccg_chunk_reload'); } catch { /* stockage indisponible */ }
  return mod;
}).catch((err) => {
  let reloaded = false;
  try { reloaded = sessionStorage.getItem('ccg_chunk_reload') === '1'; sessionStorage.setItem('ccg_chunk_reload', '1'); } catch { /* idem */ }
  if (!reloaded) { window.location.reload(); return new Promise(() => {}); }
  throw err;
}));
// Pages Client
const ClientOverview = lazyPage(() => import('./pages/Client/Dashboard'));
const ClientLoyalty = lazyPage(() => import('./pages/Client/Loyalty'));
const ClientGarage = lazyPage(() => import('./pages/Client/Garage'));
const ClientSettings = lazyPage(() => import('./pages/Client/Settings'));
const Stations = lazyPage(() => import('./pages/Client/Stations'));
const MyStations = lazyPage(() => import('./pages/Client/MyStations'));
const ClientShop = lazyPage(() => import('./pages/Client/Shop'));

// Pages Admin (Station)
const StationDashboard = lazyPage(() => import('./pages/Admin/StationDashboard'));
const AdminTransactions = lazyPage(() => import('./pages/Admin/Transactions'));
const Accounting = lazyPage(() => import('./pages/Admin/Accounting'));
const Analytics = lazyPage(() => import('./pages/Admin/Analytics'));
const Team = lazyPage(() => import('./pages/Admin/Team'));
const Washers = lazyPage(() => import('./pages/Admin/Washers'));
const Pompistes = lazyPage(() => import('./pages/Admin/Pompistes'));
const Vidange = lazyPage(() => import('./pages/Admin/Vidange'));
const Settings = lazyPage(() => import('./pages/Admin/Settings'));
const Subscriptions = lazyPage(() => import('./pages/Admin/Subscriptions'));
const Bilan = lazyPage(() => import('./pages/Admin/Bilan'));
const Shop = lazyPage(() => import('./pages/Admin/Shop'));
const AdminAnnouncements = lazyPage(() => import('./pages/Admin/Announcements'));
const SubscriptionEnded = lazyPage(() => import('./pages/Admin/SubscriptionEnded'));
// Pages Chef d'entreprise (offre Sur mesure)
const GroupDashboard = lazyPage(() => import('./pages/Group/Dashboard'));
const GroupStations = lazyPage(() => import('./pages/Group/Stations'));
const GroupOrder = lazyPage(() => import('./pages/Group/Order'));
const GroupBilling = lazyPage(() => import('./pages/Group/Billing'));
const GroupAnalysis = lazyPage(() => import('./pages/Group/Analysis'));
const GroupAccounting = lazyPage(() => import('./pages/Group/Accounting'));
// Pages Super Admin
const SuperAdminDashboard = lazyPage(() => import('./pages/SuperAdmin/Dashboard'));
const SuperAdminAnnouncements = lazyPage(() => import('./pages/SuperAdmin/Announcements'));
const SuperAdminAnalytics = lazyPage(() => import('./pages/SuperAdmin/Analytics'));
const SuperAdminStations = lazyPage(() => import('./pages/SuperAdmin/Stations'));
const SuperAdminGroups = lazyPage(() => import('./pages/SuperAdmin/Groups'));
const SuperAdminModules = lazyPage(() => import('./pages/SuperAdmin/Modules'));
const SuperAdminMotorists = lazyPage(() => import('./pages/SuperAdmin/Motorists'));
const SuperAdminSuperUsers = lazyPage(() => import('./pages/SuperAdmin/SuperUsers'));
const SuperAdminAds = lazyPage(() => import('./pages/SuperAdmin/Ads'));
const SuperAdminBilling = lazyPage(() => import('./pages/SuperAdmin/Billing'));
const SuperAdminBilan = lazyPage(() => import('./pages/SuperAdmin/Bilan'));
const SuperAdminFuel = lazyPage(() => import('./pages/SuperAdmin/Fuel'));
const SuperAdminSupport = lazyPage(() => import('./pages/SuperAdmin/Support'));
const SuperAdminSettings = lazyPage(() => import('./pages/SuperAdmin/Settings'));

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

// Comptabilité réservée aux forfaits Pro et Business (pas de module de
// déblocage : contrairement à Bilan/Boutique/Vidange, elle ne fait pas
// partie du catalogue d'add-ons payants, voir lib/stationModules.js).
function RequireAccountingAccess({ children }) {
  const { stationBilling, myPermissions } = useAppState();
  if (stationBilling == null || myPermissions == null) return null;
  const canSeeAccounting = stationBilling.plan === 'Pro' || stationBilling.plan === 'Business';
  if (canSeeAccounting && hasPerm(myPermissions, 'accounting.manage')) return children;
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

// Boutique : réservée aux forfaits Pro et Business, ou débloquée par le
// module "mod_boutique" (Super Admin > Modules) — même logique que le Bilan.
function RequireShopAccess({ children }) {
  const { stationBilling, myPermissions } = useAppState();
  if (stationBilling == null || myPermissions == null) return null;
  const hasShop = stationHasShop(stationBilling);
  if (hasShop && hasPerm(myPermissions, 'shop.manage')) return children;
  return <Navigate to="/admin/queue" replace />;
}

// Vidange : réservée au forfait Business, ou débloquée par le module
// "mod_vidange" (Super Admin > Modules) — même logique que le Bilan/la Boutique.
function RequireVidangeAccess({ children }) {
  const { stationBilling, myPermissions } = useAppState();
  if (stationBilling == null || myPermissions == null) return null;
  if (stationHasVidange(stationBilling) && hasPerm(myPermissions, 'vidange.manage')) return children;
  return <Navigate to="/admin/queue" replace />;
}

// Pompistes (stations d'essence qui font aussi du lavage) : forfaits Pro et Business. Le menu
// peut aussi la masquer (Paramètres > Menu), sans jamais changer ce droit.
function RequirePompistesAccess({ children }) {
  const { stationBilling, myPermissions } = useAppState();
  if (stationBilling == null || myPermissions == null) return null;
  if (stationHasPompistes(stationBilling) && hasPerm(myPermissions, 'pompistes.manage')) return children;
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
                <Route path="boutique" element={<ClientShop />} />
                <Route path="parametres" element={<ClientSettings />} />
              </Route>

              {/* Routes Admin Station */}
              {/* Hors AdminLayout : aucun menu, seule action possible = renouveler
                  (voir SubscriptionEnded.jsx et le redirect dans AdminLayout.jsx) */}
              <Route path="/admin/renouveler" element={<PageSuspense><SubscriptionEnded /></PageSuspense>} />

              <Route path="/admin" element={<AdminLayout />}>
                <Route index element={<Navigate to="/admin/queue" replace />} />
                <Route path="queue" element={<StationDashboard />} />
                <Route path="transactions" element={<RequirePerm perm="transactions.view"><AdminTransactions /></RequirePerm>} />
                <Route path="accounting" element={<RequireAccountingAccess><Accounting /></RequireAccountingAccess>} />
                <Route path="analytics" element={<RequirePerm perm="analytics.view"><Analytics /></RequirePerm>} />
                <Route path="bilan" element={<RequireBusinessPlan><Bilan /></RequireBusinessPlan>} />
                <Route path="shop" element={<RequireShopAccess><Shop /></RequireShopAccess>} />
                <Route path="team" element={<RequirePerm perm="team.manage"><Team /></RequirePerm>} />
                <Route path="washers" element={<RequirePerm perm="washers.manage"><Washers /></RequirePerm>} />
                <Route path="pompistes" element={<RequirePompistesAccess><Pompistes /></RequirePompistesAccess>} />
                <Route path="vidange" element={<RequireVidangeAccess><Vidange /></RequireVidangeAccess>} />
                <Route path="subscriptions" element={<RequirePerm perm="subscriptions.manage"><Subscriptions /></RequirePerm>} />
                <Route path="settings" element={<RequirePerm perm="settings.manage"><Settings /></RequirePerm>} />
                <Route path="annonces" element={<RequirePerm perm="announcements.manage"><AdminAnnouncements /></RequirePerm>} />
              </Route>

              {/* Espace chef d'entreprise (offre Sur mesure) */}
              <Route path="/groupe" element={<GroupLayout />}>
                <Route index element={<GroupDashboard />} />
                <Route path="stations" element={<GroupStations />} />
                <Route path="comptabilite" element={<GroupAccounting />} />
                <Route path="analyse" element={<GroupAnalysis />} />
                <Route path="commande" element={<GroupOrder />} />
                <Route path="facturation" element={<GroupBilling />} />
              </Route>

              {/* Routes Super Admin */}
              <Route path="/superadmin" element={<SuperAdminLayout />}>
                <Route index element={<SuperAdminDashboard />} />
                <Route path="annonces" element={<SuperAdminAnnouncements />} />
                <Route path="analytics" element={<SuperAdminAnalytics />} />
                <Route path="stations" element={<SuperAdminStations />} />
                <Route path="groupes" element={<SuperAdminGroups />} />
                <Route path="modules" element={<SuperAdminModules />} />
                <Route path="automobilistes" element={<SuperAdminMotorists />} />
                <Route path="super-users" element={<SuperAdminSuperUsers />} />
                <Route path="ads" element={<SuperAdminAds />} />
                <Route path="billing" element={<SuperAdminBilling />} />
                <Route path="carburant" element={<SuperAdminFuel />} />
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
