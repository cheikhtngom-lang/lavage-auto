import React from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Card, CardContent } from '../../components/ui/Card';
import { Button } from '../../components/ui/Button';
import { Badge } from '../../components/ui/Badge';
import { Play, CheckCircle2, CreditCard, Clock, ListOrdered, Droplets, User, Plus, X, ChevronDown, ChevronsDown, Search, Timer, UserCheck, AlertCircle, Calendar, UserPlus, ArrowRight, LineChart } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useAppState } from '../../hooks/useAppState';
import { PRICING_CATEGORY_LABELS } from '../../lib/vehicleBrands';
import { getCurrentStationId, getLoginCount } from '../../lib/accounts';
import { hasSeenTip, markTipSeen } from '../../lib/adoptionTips';
import Pagination from '../../components/ui/Pagination';

// Couleur d'accent stable pour une réservation groupée (plusieurs véhicules
// réservés en même temps par un même automobiliste, jusqu'à 2 — voir
// MAX_ACTIVE_VEHICLES_PER_CLIENT dans lib/stationData.js). Dérivée du
// reservationGroupId : deux véhicules du même groupe affichent toujours la
// même couleur, même s'ils ne sont plus côte à côte dans la file (l'un en
// lavage, l'autre encore en attente).
function groupAccentHue(groupId) {
  let hash = 0;
  for (let i = 0; i < groupId.length; i++) hash = (hash * 31 + groupId.charCodeAt(i)) % 360;
  return hash;
}
function groupAccentColors(groupId) {
  const hue = groupAccentHue(groupId);
  return {
    solid: `hsl(${hue}, 75%, 60%)`,
    border: `hsla(${hue}, 75%, 60%, 0.4)`,
    bg: `hsla(${hue}, 75%, 60%, 0.12)`,
  };
}

function GroupBadge({ item }) {
  if (!item.reservationGroupId || !item.groupSize || item.groupSize < 2) return null;
  const colors = groupAccentColors(item.reservationGroupId);
  return (
    <span
      className="inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-md ml-2 border"
      style={{ color: colors.solid, borderColor: colors.border, backgroundColor: colors.bg }}
      title="Réservé en même temps qu'un autre véhicule de ce client"
    >
      🚗×{item.groupSize}
    </span>
  );
}

// Clé du jour au format YYYY-MM-DD (fuseau local) — même helper que Washers.jsx,
// utilisé ici pour filtrer l'historique des lavages terminés par date.
function dateKey(d) {
  const tzOffsetMs = d.getTimezoneOffset() * 60000;
  return new Date(d.getTime() - tzOffsetMs).toISOString().slice(0, 10);
}
function todayKey() { return dateKey(new Date()); }

// ---- Types de véhicules par défaut ----
const DEFAULT_VEHICLE_TYPES = [
  { label: '🏍️ Moto / Scooter', value: 'Moto / Scooter' },
  { label: '🚗 Berline / Citadine', value: 'Berline / Citadine' },
  { label: '🚗 Renault Logan', value: 'Renault Logan' },
  { label: '🚗 Toyota Corolla', value: 'Toyota Corolla' },
  { label: '🚗 Peugeot 205 / 206 / 207', value: 'Peugeot 205/206/207' },
  { label: '🚙 4x4 / SUV', value: '4x4 / SUV' },
  { label: '🚙 Hyundai Tucson / Santa Fe', value: 'Hyundai Tucson/Santa Fe' },
  { label: '🚐 Minibus (6 places) / Clando', value: 'Minibus / Clando' },
  { label: '🚌 Car rapide / Bus', value: 'Car rapide / Bus' },
  { label: '🚛 Camion léger', value: 'Camion léger' },
  { label: '🚛 Camion lourd / Remorque', value: 'Camion lourd' },
  { label: '🚍 Bus / Car (+50 places)', value: 'Bus / Car (+50 places)' },
  { label: '🚜 Engin / Tracteur', value: 'Engin / Tracteur' },
];

// ---- Composant Dropdown Searchable Véhicule ----
function VehicleDropdown({ value, onChange }) {
  const { customVehicleTypes, addCustomVehicleType } = useAppState();
  const [open, setOpen] = React.useState(false);
  const [search, setSearch] = React.useState('');
  const dropdownRef = React.useRef(null);

  const allTypes = [...DEFAULT_VEHICLE_TYPES, ...customVehicleTypes.map(v => ({ label: `✏️ ${v}`, value: v }))];
  const filtered = allTypes.filter(t =>
    t.label.toLowerCase().includes(search.toLowerCase()) ||
    t.value.toLowerCase().includes(search.toLowerCase())
  );

  // Fermer si clic en dehors
  React.useEffect(() => {
    const handleClick = (e) => { if (dropdownRef.current && !dropdownRef.current.contains(e.target)) setOpen(false); };
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, []);

  const selectItem = (val) => { onChange(val); setSearch(''); setOpen(false); };

  const addCustom = () => {
    const trimmed = search.trim();
    if (!trimmed) return;
    const exists = allTypes.some(t => t.value.toLowerCase() === trimmed.toLowerCase());
    if (!exists) addCustomVehicleType(trimmed);
    onChange(trimmed);
    setSearch('');
    setOpen(false);
  };

  const showAddOption = search.trim() && !allTypes.some(t => t.value.toLowerCase() === search.trim().toLowerCase());

  return (
    <div className="relative" ref={dropdownRef}>
      {/* Trigger */}
      <button
        type="button"
        onClick={() => { setOpen(o => !o); setSearch(''); }}
        className="w-full bg-neutral-950 border border-white/10 rounded-xl px-4 py-3 text-white focus:outline-none focus:border-blue-500 text-left flex items-center justify-between gap-2 transition-colors hover:border-white/20"
      >
        <span className={value ? 'text-white' : 'text-neutral-500'}>
          {value || 'Sélectionner ou taper un type...'}
        </span>
        <ChevronDown className={`w-4 h-4 text-neutral-400 transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>

      {/* Dropdown panel */}
      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, y: -6, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -6, scale: 0.97 }}
            transition={{ duration: 0.15 }}
            className="absolute z-50 left-0 right-0 mt-2 bg-neutral-900 border border-white/10 rounded-xl shadow-2xl overflow-hidden"
            style={{ maxHeight: '300px' }}
          >
            {/* Recherche */}
            <div className="p-2 border-b border-white/5 flex items-center gap-2">
              <Search className="w-4 h-4 text-neutral-500 flex-shrink-0 ml-1" />
              <input
                autoFocus
                type="text"
                placeholder="Rechercher ou taper un type..."
                value={search}
                onChange={e => setSearch(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); showAddOption ? addCustom() : (filtered[0] && selectItem(filtered[0].value)); } }}
                className="flex-1 bg-transparent text-white text-sm outline-none placeholder-neutral-600"
              />
            </div>

            {/* Liste */}
            <div className="overflow-y-auto" style={{ maxHeight: '220px' }}>
              {filtered.map(t => (
                <button
                  key={t.value}
                  type="button"
                  onClick={() => selectItem(t.value)}
                  className={`w-full text-left px-4 py-2.5 text-sm transition-colors flex items-center gap-2 ${
                    value === t.value
                      ? 'bg-blue-600/20 text-blue-300'
                      : 'text-neutral-300 hover:bg-white/5'
                  }`}
                >
                  {value === t.value && <span className="text-blue-400 text-xs">✓</span>}
                  {t.label}
                </button>
              ))}

              {/* Option d'ajout custom */}
              {showAddOption && (
                <button
                  type="button"
                  onClick={addCustom}
                  className="w-full text-left px-4 py-2.5 text-sm text-emerald-400 hover:bg-emerald-500/10 transition-colors flex items-center gap-2 border-t border-white/5"
                >
                  <Plus className="w-4 h-4" />
                  Ajouter "<span className="font-semibold">{search.trim()}</span>" à la liste
                </button>
              )}

              {filtered.length === 0 && !showAddOption && (
                <p className="text-center text-neutral-600 text-sm py-4">Aucun résultat</p>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

// ---- Décompte du temps de lavage restant (durée du service -> 00:00) ----
function WashTimer({ startedAt, durationMinutes }) {
  const [remaining, setRemaining] = React.useState(0);

  React.useEffect(() => {
    if (!startedAt) return;
    const start = new Date(startedAt).getTime();
    const totalSeconds = Math.max(0, Math.round((durationMinutes || 30) * 60));
    const tick = () => {
      const elapsed = Math.floor((Date.now() - start) / 1000);
      setRemaining(Math.max(0, totalSeconds - elapsed));
    };
    tick();
    const interval = setInterval(tick, 1000);
    return () => clearInterval(interval);
  }, [startedAt, durationMinutes]);

  const minutes = String(Math.floor(remaining / 60)).padStart(2, '0');
  const seconds = String(remaining % 60).padStart(2, '0');
  const isDone = remaining <= 0;

  return (
    <div className={`flex items-center gap-1.5 font-mono font-bold text-lg ${isDone ? 'text-orange-400' : 'text-emerald-400'}`}>
      <Timer className={`w-4 h-4 ${isDone ? '' : 'animate-pulse'}`} />
      {minutes}:{seconds}
      {isDone && <span className="text-xs font-sans font-semibold ml-1 uppercase tracking-wide">Terminé</span>}
    </div>
  );
}

export default function StationDashboard() {
  const navigate = useNavigate();
  const { queue, activeWashes, completedWashes, startWash, endWash, skipWash, pushBackOnePosition, validatePayment, addWash, employees, pricingConfig, durationConfig } = useAppState();

  const getDurationMinutes = (item) => {
    const cat = item?.category || 'Particulier';
    return durationConfig?.[cat]?.[item?.service] ?? 30;
  };

  const [showAddModal, setShowAddModal] = React.useState(false);
  const [newWash, setNewWash] = React.useState({ client: '', vehicle: '', category: 'Particulier', service: 'Lavage Simple', paid: false });

  // Modal sélection laveur
  const [showWorkerModal, setShowWorkerModal] = React.useState(false);
  const [pendingWashId, setPendingWashId] = React.useState(null);
  const [selectedEmployee, setSelectedEmployee] = React.useState(null);

  // Modal confirmation encaissement
  const [showPayModal, setShowPayModal] = React.useState(false);
  const [pendingPayItem, setPendingPayItem] = React.useState(null);

  // Filtre par date pour l'historique des lavages terminés (même principe que
  // le pointage journalier des laveurs)
  const [completedDate, setCompletedDate] = React.useState(todayKey());
  const isCompletedToday = completedDate === todayKey();
  const [completedPage, setCompletedPage] = React.useState(1);
  const [completedPageSize, setCompletedPageSize] = React.useState(20);

  // Astuce "adoption" (voir [[design_onboarding_backlog]]) : une fois le premier
  // lavage terminé, on suggère l'Analytique pour suivre le chiffre d'affaires —
  // jamais montrée avant, jamais reproposée une fois vue.
  const analyticsTipId = `analytics_${getCurrentStationId()}`;
  const [showAnalyticsTip, setShowAnalyticsTip] = React.useState(false);
  React.useEffect(() => {
    if (completedWashes.length > 0 && !hasSeenTip(analyticsTipId)) setShowAnalyticsTip(true);
  }, [completedWashes.length, analyticsTipId]);
  const dismissAnalyticsTip = () => { markTipSeen(analyticsTipId); setShowAnalyticsTip(false); };

  const presentEmployees = (employees || []).filter(e => e?.present || e?.dailyStatus === 'present');
  // Un laveur déjà en train de laver un véhicule (voir startWash — stocké par
  // nom sur activeWashes.assignedTo) ne doit pas pouvoir être réassigné à un
  // second véhicule tant qu'il n'a pas terminé le premier. Un laveur en "Fin
  // de service" (voir finishService dans useAppState.jsx) est définitivement
  // clos pour la journée — contrairement à "Terminé" (Descendre), qui reste
  // sélectionnable et reprend son service si on lui confie un véhicule.
  const busyEmployeeWash = new Map((activeWashes || []).map(w => [w.assignedTo, w]));
  const availableEmployees = presentEmployees.filter(e => !busyEmployeeWash.has(e.name) && e.status !== 'Fin de service');

  const getPrice = (item) => {
    const cat = item?.category || 'Particulier';
    return (pricingConfig?.[cat]?.[item?.service]) || 0;
  };

  const isStationClosed = () => {
    if (!stationProfile?.closeTime) return false;
    const [closeH, closeM] = stationProfile.closeTime.split(':').map(Number);
    if (Number.isNaN(closeH) || Number.isNaN(closeM)) return false;
    const now = new Date();
    const closeAt = new Date(now);
    closeAt.setHours(closeH, closeM, 0, 0);
    return now >= closeAt;
  };

  const handleGoClick = (item) => {
    // Bouton laissé cliquable (même visuellement grisé) plutôt que `disabled`,
    // pour que le message d'explication s'affiche aussi au tap sur tablette/mobile
    // — un `disabled` natif n'aurait déclenché aucun retour sur ces appareils.
    if (!item.paid) {
      alert('Validez le paiement avant de lancer le lavage.');
      return;
    }
    if (isStationClosed()) {
      alert("Impossible : la station est actuellement fermée. Les laveurs ne peuvent plus être assignés.");
      return;
    }
    if (availableEmployees.length === 0) {
      alert('Aucun laveur disponible — tous sont occupés ou absents.');
      return;
    }
    setPendingWashId(item.id);
    setSelectedEmployee(availableEmployees[0]?.id || null);
    setShowWorkerModal(true);
  };

  const handleConfirmStart = () => {
    if (!pendingWashId) return;
    startWash(pendingWashId, selectedEmployee);
    setShowWorkerModal(false);
    setPendingWashId(null);
  };

  const handleEncaisserClick = (item) => {
    setPendingPayItem(item);
    setShowPayModal(true);
  };

  const handleConfirmPayment = () => {
    if (!pendingPayItem) return;
    validatePayment(pendingPayItem.id);
    setShowPayModal(false);
    setPendingPayItem(null);
  };

  const handleAddWash = (e) => {
    e.preventDefault();
    addWash({
        client: newWash.client || "Client de passage",
        vehicle: newWash.vehicle || "Véhicule",
        category: newWash.category,
        service: newWash.service,
        paid: newWash.paid
    });
    setShowAddModal(false);
    setNewWash({ client: '', vehicle: '', category: 'Particulier', service: 'Lavage Simple', paid: false });
  };

  const waitingQueue = (queue || []).filter(q => q.status === 'attente');

  // Un lavage terminé sans `completedAtISO` (créé avant l'ajout de ce champ)
  // est traité comme "aujourd'hui", pour ne rien faire disparaître de la vue par défaut.
  const completedDateOf = (item) => item.completedAtISO ? dateKey(new Date(item.completedAtISO)) : todayKey();
  const filteredCompletedWashes = (completedWashes || []).filter(item => completedDateOf(item) === completedDate);
  const completedDateLabel = new Date(`${completedDate}T00:00:00`).toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
  const completedTotalPages = Math.max(1, Math.ceil(filteredCompletedWashes.length / completedPageSize));
  const completedCurrentPage = Math.min(completedPage, completedTotalPages);
  const paginatedCompletedWashes = filteredCompletedWashes.slice((completedCurrentPage - 1) * completedPageSize, completedCurrentPage * completedPageSize);

  React.useEffect(() => { setCompletedPage(1); }, [completedDate]);

  return (
    <div className="p-8 max-w-7xl mx-auto relative z-10">
      <div className="flex flex-col md:flex-row md:items-center justify-between mb-8 gap-4">
        <div>
          <h1 className="text-4xl font-bold text-white mb-2 tracking-tight">File d'attente <span className="text-emerald-400">Live</span></h1>
          <p className="text-neutral-400 text-lg">Gérez l'ordre de passage et encaissez en un clic.</p>
        </div>
        <div className="flex items-center gap-4">
          <button 
            onClick={() => setShowAddModal(true)}
            className="flex items-center px-4 py-3 bg-blue-600 hover:bg-blue-500 text-white rounded-xl font-medium transition-colors shadow-lg shadow-blue-500/20"
          >
            <Plus className="w-5 h-5 mr-2" />
            Nouveau Véhicule
          </button>
          <div className="hidden md:flex items-center gap-4 bg-emerald-950/30 border border-emerald-500/20 rounded-2xl px-5 py-3 shadow-[0_0_15px_rgba(16,185,129,0.15)]">
            <div className="w-3 h-3 rounded-full bg-emerald-500 animate-pulse shadow-[0_0_10px_rgba(16,185,129,1)]"></div>
            <span className="text-emerald-400 font-medium">Live</span>
          </div>
        </div>
      </div>

      {/* Bannière d'activation : tant qu'aucun employé n'existe, aucun lavage ne peut
          être démarré (voir handleGoClick plus bas) — c'est le seul vrai blocage pour
          une station qui vient de s'inscrire, donc on le signale explicitement plutôt
          que de laisser le nouvel admin découvrir le blocage seul via une alerte.
          Plafonnée à 3 connexions (voir [[design_onboarding_backlog]]) : au-delà,
          plus de relance même si le blocage persiste — pas de visite guidée perpétuelle. */}
      {employees.length === 0 && getLoginCount('admin', getCurrentStationId()) <= 3 && (
        <button
          onClick={() => navigate('/admin/team')}
          className="w-full mb-8 flex items-center gap-4 bg-blue-950/40 border border-blue-500/20 rounded-2xl px-5 py-4 hover:bg-blue-950/60 transition-colors text-left"
        >
          <div className="p-2 bg-blue-500/15 rounded-xl flex-shrink-0">
            <UserPlus className="w-5 h-5 text-blue-400" />
          </div>
          <span className="text-sm text-blue-200/80 flex-1">
            <strong className="text-blue-400">Bienvenue !</strong> Votre station est déjà active et peut recevoir des réservations. Ajoutez votre premier laveur pour pouvoir démarrer un lavage.
          </span>
          <ArrowRight className="w-4 h-4 text-blue-400 flex-shrink-0" />
        </button>
      )}

      {showAnalyticsTip && (
        <div className="w-full mb-8 flex items-center gap-3 bg-emerald-950/30 border border-emerald-500/20 rounded-2xl px-5 py-4">
          <LineChart className="w-5 h-5 text-emerald-400 flex-shrink-0" />
          <span className="text-sm text-emerald-200/80 flex-1">
            <strong className="text-emerald-400">Astuce :</strong> suivez votre chiffre d'affaires et l'activité de votre équipe dans <button onClick={() => navigate('/admin/analytics')} className="underline hover:text-emerald-300">Analytique</button>.
          </span>
          <button onClick={dismissAnalyticsTip} className="text-neutral-500 hover:text-white flex-shrink-0" aria-label="Fermer">
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-8">
        {/* Véhicules en cours (Active Washes) */}
        <div className="xl:col-span-1 space-y-6">
          <div className="flex items-center text-emerald-400 mb-2">
            <div className="p-2 bg-emerald-500/10 rounded-lg mr-3">
              <Droplets className="w-5 h-5" />
            </div>
            <h2 className="text-2xl font-semibold">En Lavage</h2>
          </div>
          
          <AnimatePresence>
            {activeWashes.length === 0 && (
              <motion.div 
                initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                className="animated-border-card"
              >
                <div className="animated-border-card-content flex flex-col items-center justify-center p-12 text-neutral-500">
                  <Droplets className="w-12 h-12 mb-4 opacity-20" />
                  <p>Aucun véhicule en cours</p>
                </div>
              </motion.div>
            )}
            
            {(activeWashes || []).map((item) => (
              <motion.div
                key={item.id}
                layout
                initial={{ opacity: 0, scale: 0.9 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.9, y: 20 }}
                transition={{ type: "spring", stiffness: 200, damping: 20 }}
                className="relative"
              >
                <div className="absolute inset-0 bg-gradient-to-r from-emerald-500/20 to-blue-500/20 blur-xl rounded-2xl -z-10"></div>
                <div className="glass-card rounded-2xl p-6 border-t border-t-emerald-400/50 relative overflow-hidden"
                  style={item.reservationGroupId ? { borderLeft: `4px solid ${groupAccentColors(item.reservationGroupId).solid}` } : undefined}>
                  <div className="absolute top-0 right-0 p-4 opacity-10">
                    <Droplets className="w-24 h-24 text-emerald-500" />
                  </div>

                  {/* Effet de lavage : sweep lumineux + gouttes qui tombent, tant que le véhicule est en cours */}
                  <div className="washing-effect" aria-hidden="true">
                    <span className="wash-sweep" />
                    <span className="wash-droplet" style={{ left: '12%', animationDelay: '0s' }} />
                    <span className="wash-droplet" style={{ left: '30%', animationDelay: '0.5s' }} />
                    <span className="wash-droplet" style={{ left: '50%', animationDelay: '1s' }} />
                    <span className="wash-droplet" style={{ left: '68%', animationDelay: '0.2s' }} />
                    <span className="wash-droplet" style={{ left: '86%', animationDelay: '0.8s' }} />
                    <span className="wash-foam" />
                  </div>

                  <div className="flex justify-between items-start mb-6 relative z-10">
                    <div>
                      <h3 className="font-bold text-xl text-white mb-1">{item.vehicle}</h3>
                      <div className="flex items-center text-neutral-400 text-sm">
                        <User className="w-4 h-4 mr-1" />
                        {item.client}
                        <GroupBadge item={item} />
                      </div>
                    </div>
                    <Badge className="bg-emerald-500/20 text-emerald-300 border-emerald-500/30 px-3 py-1 animate-pulse">
                      En cours
                    </Badge>
                  </div>
                  
                  <div className="bg-black/40 rounded-xl p-4 mb-4 border border-white/5 relative z-10">
                    <div className="flex justify-between items-center mb-3">
                      <div>
                        <p className="text-xs text-neutral-500 uppercase font-bold tracking-wider mb-1">Service</p>
                        <p className="text-white font-medium">{item.service}</p>
                      </div>
                      <div className="text-right">
                        <p className="text-xs text-neutral-500 uppercase font-bold tracking-wider mb-1">Laveur</p>
                        <p className="text-emerald-400 font-medium">{item.assignedTo || 'Assigné'}</p>
                      </div>
                    </div>
                    <div className="flex justify-between items-center pt-3 border-t border-white/5">
                      <div>
                        <p className="text-xs text-neutral-500 uppercase font-bold tracking-wider mb-1">Temps restant</p>
                        <WashTimer startedAt={item.startedAt} durationMinutes={getDurationMinutes(item)} />
                      </div>
                      <div className="text-right">
                        <p className="text-xs text-neutral-500 uppercase font-bold tracking-wider mb-1">Montant</p>
                        <p className="text-blue-400 font-bold">{getPrice(item).toLocaleString('fr-FR')} FCFA</p>
                      </div>
                    </div>
                  </div>
                  
                  <button 
                    onClick={() => endWash(item.id)}
                    className="w-full relative inline-flex overflow-hidden rounded-xl p-[1px] focus:outline-none focus:ring-2 focus:ring-emerald-400 active:scale-95 transition-transform"
                  >
                    <span className="absolute inset-[-1000%] animate-[spin_2s_linear_infinite] bg-[conic-gradient(from_90deg_at_50%_50%,#047857_0%,#34d399_50%,#047857_100%)]"></span>
                    <span className="inline-flex h-full w-full cursor-pointer items-center justify-center rounded-xl bg-neutral-950 px-6 py-3 text-sm font-bold text-white backdrop-blur-3xl hover:bg-neutral-900 transition-colors">
                      <CheckCircle2 className="w-5 h-5 mr-2 text-emerald-400" /> 
                      Terminer le lavage
                    </span>
                  </button>
                </div>
              </motion.div>
            ))}
          </AnimatePresence>
        </div>

        {/* File d'attente (Queue) */}
        <div className="xl:col-span-2 space-y-6">
          <div className="flex items-center text-blue-400 mb-2">
            <div className="p-2 bg-blue-500/10 rounded-lg mr-3">
              <ListOrdered className="w-5 h-5" />
            </div>
            <h2 className="text-2xl font-semibold">Prochains véhicules</h2>
          </div>

          <div className="glass-card rounded-2xl overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-left">
                <thead>
                  <tr className="border-b border-white/5 bg-white/[0.02]">
                    <th className="p-3 font-semibold text-neutral-400 w-12">Pos</th>
                    <th className="p-3 font-semibold text-neutral-400">Véhicule & Client</th>
                    <th className="p-3 font-semibold text-neutral-400">Service</th>
                    <th className="p-3 font-semibold text-neutral-400">Paiement</th>
                    <th className="p-3 font-semibold text-neutral-400 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  <AnimatePresence>
                    {waitingQueue.length === 0 && (
                      <tr>
                        <td colSpan="5" className="p-12 text-center text-neutral-500">
                          La file d'attente est vide.
                        </td>
                      </tr>
                    )}
                    {waitingQueue.map((item, index) => (
                      <motion.tr 
                        layout
                        initial={{ opacity: 0, x: -20 }}
                        animate={{ opacity: 1, x: 0 }}
                        exit={{ opacity: 0, scale: 0.95 }}
                        transition={{ duration: 0.3 }}
                        key={item.id}
                        className="border-b border-white/5 hover:bg-white/5 group transition-colors"
                        style={item.reservationGroupId ? { borderLeft: `4px solid ${groupAccentColors(item.reservationGroupId).solid}` } : undefined}
                      >
                        <td className="p-3">
                          <div className="w-8 h-8 rounded-xl bg-neutral-900 border border-white/10 flex items-center justify-center font-bold text-neutral-300 text-sm group-hover:border-blue-500/50 transition-colors shadow-inner">
                            {index + 1}
                          </div>
                        </td>
                        <td className="p-3">
                          <p className="font-bold text-white text-base">{item.vehicle}</p>
                          <p className="text-sm text-neutral-400 flex items-center mt-1">
                            {item.category && <span className="bg-white/10 px-2 py-0.5 rounded text-xs mr-2">{PRICING_CATEGORY_LABELS[item.category] || item.category}</span>}
                            {item.client}
                            <GroupBadge item={item} />
                          </p>
                        </td>
                        <td className="p-3">
                          <p className="text-neutral-300 font-medium">{item.service}</p>
                          <p className="text-blue-400 font-bold text-sm mt-0.5">{getPrice(item).toLocaleString('fr-FR')} FCFA</p>
                        </td>
                        <td className="p-3">
                          {item.paid ? (
                            <Badge className="bg-emerald-500/10 text-emerald-400 border-emerald-500/20 shadow-[0_0_10px_rgba(16,185,129,0.2)]">
                              <CreditCard className="w-3 h-3 mr-1.5" /> Payé
                            </Badge>
                          ) : (
                            <Badge className="bg-orange-500/10 text-orange-400 border-orange-500/20">
                              <Clock className="w-3 h-3 mr-1.5" /> En attente
                            </Badge>
                          )}
                        </td>
                        <td className="p-3 text-right">
                          <div className="flex flex-wrap items-center justify-end gap-2">
                            {!item.paid && (
                              <button
                                onClick={() => handleEncaisserClick(item)}
                                className="text-sm px-3 py-1.5 rounded-lg bg-orange-500/10 text-orange-400 hover:bg-orange-500 hover:text-white transition-all font-medium border border-orange-500/20 hover:border-orange-500"
                              >
                                Encaisser
                              </button>
                            )}

                            {index === 0 && item.paymentMethod && waitingQueue.length > 1 && (
                              <button
                                onClick={() => pushBackOnePosition(item.id)}
                                title={`Payé en ligne (${item.paymentMethod}) — client en retard : céder la 1ère place et passer au 2nd rang`}
                                className="text-sm px-3 py-1.5 rounded-lg bg-white/5 text-neutral-300 hover:bg-white/10 hover:text-white transition-all font-medium border border-white/10 flex items-center"
                              >
                                <ChevronsDown className="w-4 h-4 mr-1" /> 2nd rang
                              </button>
                            )}

                            {index === 0 && (() => {
                              const goBlocked = !item.paid || availableEmployees.length === 0;
                              const goTitle = !item.paid
                                ? 'Validez le paiement avant de lancer le lavage'
                                : availableEmployees.length === 0
                                  ? 'Aucun laveur disponible — tous sont occupés ou absents'
                                  : undefined;
                              return (
                                <button
                                  onClick={() => handleGoClick(item)}
                                  title={goTitle}
                                  className={`text-sm px-3 py-1.5 rounded-lg text-white transition-all font-bold flex items-center ${
                                    goBlocked
                                      ? 'bg-blue-600/40 cursor-pointer'
                                      : 'bg-blue-600 hover:bg-blue-500 shadow-[0_0_15px_rgba(37,99,235,0.4)]'
                                  }`}
                                >
                                  <Play className="w-4 h-4 mr-1.5 fill-current" /> GO
                                </button>
                              );
                            })()}

                            <button
                              onClick={() => skipWash(item.id)}
                              className="text-neutral-500 hover:text-red-400 p-1.5 rounded-lg hover:bg-red-500/10 transition-colors"
                              title="Annuler / Retirer"
                            >
                              ✕
                            </button>
                          </div>
                        </td>
                      </motion.tr>
                    ))}
                  </AnimatePresence>
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </div>

      {/* Historique des lavages */}
      <div className="mt-8">
        <div className="flex flex-wrap items-center justify-between gap-4 mb-4">
          <div className="flex items-center text-neutral-400">
            <div className="p-2 bg-neutral-800/50 rounded-lg mr-3">
              <CheckCircle2 className="w-5 h-5" />
            </div>
            <h2 className="text-xl font-semibold text-white">Historique des lavages {isCompletedToday ? 'terminés (Aujourd\'hui)' : '— Historique'}</h2>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <div className="flex items-center gap-2 bg-neutral-900 border border-white/10 rounded-lg px-3 py-2">
              <Calendar className="w-4 h-4 text-neutral-500 flex-shrink-0" />
              <input
                type="date"
                value={completedDate}
                max={todayKey()}
                onChange={(e) => setCompletedDate(e.target.value || todayKey())}
                className="bg-transparent text-white text-sm outline-none [color-scheme:dark]"
              />
            </div>
            {!isCompletedToday && (
              <button
                type="button"
                onClick={() => setCompletedDate(todayKey())}
                className="text-xs font-bold text-blue-400 hover:text-blue-300 px-3 py-1.5 rounded-lg bg-blue-500/10 border border-blue-500/20 transition-colors"
              >
                Revenir à aujourd'hui
              </button>
            )}
            <span className="text-sm text-neutral-500 capitalize">{completedDateLabel}</span>
          </div>
        </div>

        <div className="glass-card rounded-2xl overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left">
              <thead>
                <tr className="border-b border-white/5 bg-white/[0.02]">
                  <th className="p-4 font-semibold text-neutral-400">Heure de fin</th>
                  <th className="p-4 font-semibold text-neutral-400">Véhicule & Client</th>
                  <th className="p-4 font-semibold text-neutral-400">Service</th>
                  <th className="p-4 font-semibold text-neutral-400">Laveur</th>
                </tr>
              </thead>
              <tbody>
                <AnimatePresence>
                  {filteredCompletedWashes.length === 0 && (
                    <tr>
                      <td colSpan="4" className="p-8 text-center text-neutral-500">
                        {isCompletedToday ? 'Aucun lavage terminé pour le moment.' : 'Aucun lavage terminé ce jour-là.'}
                      </td>
                    </tr>
                  )}
                  {paginatedCompletedWashes.map((item) => (
                    <motion.tr 
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      key={item.id}
                      className="border-b border-white/5 bg-neutral-900/20"
                      style={item.reservationGroupId ? { borderLeft: `4px solid ${groupAccentColors(item.reservationGroupId).solid}` } : undefined}
                    >
                      <td className="p-4 text-emerald-400 font-medium">
                        {item.completedAt}
                      </td>
                      <td className="p-4">
                        <p className="font-bold text-neutral-300 flex items-center">{item.vehicle}<GroupBadge item={item} /></p>
                        <p className="text-xs text-neutral-500">{item.client}</p>
                      </td>
                      <td className="p-4 text-neutral-400">{item.service}</td>
                      <td className="p-4 text-neutral-400">{item.assignedTo}</td>
                    </motion.tr>
                  ))}
                </AnimatePresence>
              </tbody>
            </table>
          </div>
          {filteredCompletedWashes.length > 0 && (
            <Pagination
              page={completedCurrentPage}
              pageSize={completedPageSize}
              totalItems={filteredCompletedWashes.length}
              onPageChange={setCompletedPage}
              onPageSizeChange={(n) => { setCompletedPageSize(n); setCompletedPage(1); }}
            />
          )}
        </div>
      </div>

      {/* ===== Modal Sélection Laveur ===== */}
      <AnimatePresence>
        {showWorkerModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="bg-neutral-900 border border-white/10 rounded-2xl p-6 w-full max-w-sm shadow-2xl"
            >
              <div className="flex items-center gap-3 mb-6">
                <div className="p-2 bg-blue-500/20 rounded-xl">
                  <UserCheck className="w-5 h-5 text-blue-400" />
                </div>
                <div>
                  <h2 className="text-xl font-bold text-white">Assigner un laveur</h2>
                  <p className="text-neutral-400 text-sm">Qui prend ce véhicule ?</p>
                </div>
              </div>

              <div className="space-y-2 mb-6">
                {presentEmployees.length === 0 ? (
                  <p className="text-center text-neutral-500 py-4 text-sm">Aucun employé présent aujourd'hui.</p>
                ) : (
                  presentEmployees.map(emp => {
                    const busyWash = busyEmployeeWash.get(emp.name);
                    const isBusy = !!busyWash;
                    return (
                      <button
                        key={emp.id}
                        type="button"
                        onClick={() => !isBusy && setSelectedEmployee(emp.id)}
                        disabled={isBusy}
                        className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl border transition-all ${
                          isBusy
                            ? 'bg-white/[0.02] border-white/5 text-neutral-600 cursor-not-allowed opacity-60'
                            : selectedEmployee === emp.id
                              ? 'bg-blue-600/20 border-blue-500/50 text-white'
                              : 'bg-white/5 border-white/10 text-neutral-300 hover:bg-white/10'
                        }`}
                      >
                        <div className="w-9 h-9 rounded-full bg-gradient-to-tr from-neutral-700 to-neutral-600 flex items-center justify-center font-bold text-sm flex-shrink-0">
                          {(emp.avatar || emp.name?.substring(0,2).toUpperCase())}
                        </div>
                        <div className="text-left">
                          <p className="font-semibold">{emp.name}</p>
                          <p className="text-xs text-neutral-500">{isBusy ? `Occupé — lave ${busyWash.vehicle}` : emp.role}</p>
                        </div>
                        {isBusy ? (
                          <span className="ml-auto text-[10px] font-bold uppercase tracking-wider bg-orange-500/10 text-orange-400 border border-orange-500/20 px-2 py-1 rounded-md">Occupé</span>
                        ) : selectedEmployee === emp.id && (
                          <CheckCircle2 className="w-5 h-5 text-blue-400 ml-auto" />
                        )}
                      </button>
                    );
                  })
                )}
                {presentEmployees.length > 0 && availableEmployees.length === 0 && (
                  <p className="text-center text-orange-400 text-xs pt-2">Tous les laveurs présents sont déjà occupés.</p>
                )}
              </div>

              <div className="flex gap-3">
                <button
                  onClick={() => setShowWorkerModal(false)}
                  className="flex-1 py-3 rounded-xl border border-white/10 text-neutral-400 hover:text-white hover:bg-white/5 transition-colors font-medium"
                >
                  Annuler
                </button>
                <button
                  onClick={handleConfirmStart}
                  disabled={!selectedEmployee || availableEmployees.length === 0}
                  className="flex-1 py-3 rounded-xl bg-blue-600 hover:bg-blue-500 text-white font-bold transition-colors flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed shadow-lg shadow-blue-500/20"
                >
                  <Play className="w-4 h-4 fill-current" /> Démarrer
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* ===== Modal Confirmation Encaissement ===== */}
      <AnimatePresence>
        {showPayModal && pendingPayItem && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="bg-neutral-900 border border-white/10 rounded-2xl p-6 w-full max-w-sm shadow-2xl"
            >
              <div className="flex items-center gap-3 mb-6">
                <div className="p-2 bg-orange-500/20 rounded-xl">
                  <AlertCircle className="w-5 h-5 text-orange-400" />
                </div>
                <div>
                  <h2 className="text-xl font-bold text-white">Confirmer le paiement</h2>
                  <p className="text-neutral-400 text-sm">{pendingPayItem.client} — {pendingPayItem.vehicle}</p>
                </div>
              </div>

              <div className="bg-orange-950/30 border border-orange-500/20 rounded-xl p-5 mb-6 text-center">
                <p className="text-neutral-400 text-sm mb-1">{pendingPayItem.service} · {PRICING_CATEGORY_LABELS[pendingPayItem.category] || pendingPayItem.category}</p>
                <p className="text-4xl font-bold text-white mt-2">
                  {getPrice(pendingPayItem).toLocaleString('fr-FR')}
                  <span className="text-lg font-medium text-neutral-400 ml-2">FCFA</span>
                </p>
              </div>

              <div className="flex gap-3">
                <button
                  onClick={() => setShowPayModal(false)}
                  className="flex-1 py-3 rounded-xl border border-white/10 text-neutral-400 hover:text-white hover:bg-white/5 transition-colors font-medium"
                >
                  Annuler
                </button>
                <button
                  onClick={handleConfirmPayment}
                  className="flex-1 py-3 rounded-xl bg-orange-500 hover:bg-orange-400 text-white font-bold transition-colors flex items-center justify-center gap-2 shadow-lg shadow-orange-500/20"
                >
                  <CreditCard className="w-4 h-4" /> Confirmer
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* ===== Modal Ajout Manuel ===== */}
      <AnimatePresence>
        {showAddModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
            <motion.div 
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="bg-neutral-900 border border-white/10 rounded-2xl p-6 w-full max-w-md shadow-2xl relative"
            >
              <button 
                onClick={() => setShowAddModal(false)}
                className="absolute top-4 right-4 text-neutral-400 hover:text-white"
              >
                <X className="w-6 h-6" />
              </button>
              
              <h2 className="text-2xl font-bold text-white mb-6">Ajouter un véhicule</h2>
              
              <form onSubmit={handleAddWash} className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-neutral-400 mb-1">Nom du client (Optionnel)</label>
                  <input 
                    type="text" 
                    placeholder="Ex: Client de passage"
                    className="w-full bg-neutral-950 border border-white/10 rounded-xl px-4 py-3 text-white focus:outline-none focus:border-blue-500"
                    value={newWash.client}
                    onChange={(e) => setNewWash({...newWash, client: e.target.value})}
                  />
                </div>
                <div>
                   <label className="block text-sm font-medium text-neutral-400 mb-1">Type de véhicule</label>
                   <VehicleDropdown
                     value={newWash.vehicle}
                     onChange={(val) => setNewWash({ ...newWash, vehicle: val })}
                   />
                 </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-neutral-400 mb-1">Catégorie</label>
                    <select
                      className="w-full bg-neutral-950 border border-white/10 rounded-xl px-4 py-3 text-white focus:outline-none focus:border-blue-500"
                      value={newWash.category}
                      onChange={(e) => {
                        const category = e.target.value;
                        // Les motos n'ont qu'un seul type de lavage disponible.
                        setNewWash({ ...newWash, category, service: category === 'Moto' ? 'Lavage Simple' : newWash.service });
                      }}
                    >
                      <option value="Moto">{PRICING_CATEGORY_LABELS.Moto}</option>
                      <option value="Particulier">{PRICING_CATEGORY_LABELS.Particulier}</option>
                      <option value="Transport">{PRICING_CATEGORY_LABELS.Transport}</option>
                      <option value="Camion">{PRICING_CATEGORY_LABELS.Camion}</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-neutral-400 mb-1">Service</label>
                    <select
                      className="w-full bg-neutral-950 border border-white/10 rounded-xl px-4 py-3 text-white focus:outline-none focus:border-blue-500 disabled:opacity-60"
                      value={newWash.service}
                      disabled={newWash.category === 'Moto'}
                      onChange={(e) => setNewWash({...newWash, service: e.target.value})}
                    >
                      <option value="Lavage Simple">Lavage Simple</option>
                      {newWash.category !== 'Moto' && <option value="Lavage Complet">Lavage Complet</option>}
                      {newWash.category !== 'Moto' && <option value="Lavage Moteur">Lavage Moteur</option>}
                    </select>
                  </div>
                </div>
                
                <div className="flex items-center mt-4">
                  <input 
                    type="checkbox" 
                    id="paid"
                    className="w-4 h-4 rounded border-white/20 bg-neutral-950 text-blue-600 focus:ring-blue-500 focus:ring-offset-neutral-900"
                    checked={newWash.paid}
                    onChange={(e) => setNewWash({...newWash, paid: e.target.checked})}
                  />
                  <label htmlFor="paid" className="ml-2 text-sm text-neutral-300">
                    Payé d'avance
                  </label>
                </div>

                <div className="pt-4 mt-2 border-t border-white/10">
                  <button 
                    type="submit"
                    className="w-full bg-blue-600 hover:bg-blue-500 text-white font-bold py-3 px-4 rounded-xl transition-colors flex items-center justify-center"
                  >
                    <Plus className="w-5 h-5 mr-2" />
                    Ajouter à la file d'attente
                  </button>
                </div>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
