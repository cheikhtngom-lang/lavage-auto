import React, { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { MapPin, Clock, ArrowRight, X, Droplets, CheckCircle2, Plus, Search, Ticket, Navigation, Building2, Heart, Car, Check, Smartphone, Wallet, Loader2, AlertTriangle, Megaphone, Download } from 'lucide-react';
import { useNavigate, useSearchParams, useLocation, Link } from 'react-router-dom';
import { useSuperAdminState } from '../../hooks/useSuperAdminState';
import { useClientAccount } from '../../hooks/useClientAccount';
import { getPricingCategory } from '../../lib/vehicleBrands';
import { CategoryPicker, BrandDropdown, categoryIcon } from '../../components/client/VehicleFormFields';
import {
  getStationWaitingCount, getStationActiveCount, createReservation, recordClientTransaction, getStationPricing, getStationOperationalProfile,
  getStationPromo, isStationOpenNow, getStationRatingSummary, MAX_ACTIVE_VEHICLES_PER_CLIENT,
} from '../../lib/stationData';
import { isBannerActive, applyDiscount, matchPromoCode, applyPromoCode } from '../../lib/promoDefaults';
import { SENEGAL_REGIONS, regionLabel } from '../../lib/regions';
import { StarRatingDisplay } from '../../components/ui/StarRating';
import { downloadReceiptPdf } from '../../lib/receipt';
import SuperUserUpsellModal from '../../components/client/SuperUserUpsellModal';
import { MAX_FREE_VEHICLES } from '../../lib/superUser';

function haversineDistanceKm(lat1, lng1, lat2, lng2) {
  const R = 6371;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLng = (lng2 - lng1) * Math.PI / 180;
  const a = Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

// `null` couvre les trois cas où la distance ne peut pas être calculée
// (géoloc refusée/indisponible, station sans lat/lng) — l'appelant doit alors
// simplement ne rien afficher, jamais planter ni montrer "NaN km".
function formatDistance(distanceKm) {
  if (distanceKm == null) return null;
  return distanceKm < 1 ? `${Math.round(distanceKm * 1000)} m` : `${distanceKm.toFixed(1)} km`;
}

const emptyNewVehicle = { category: '', brand: '', plate: '' };

// Choix du/des véhicule(s) à réserver, à partir du garage de l'automobiliste.
// Sélection multiple (jusqu'à `maxSelectable`, plafonné par le nombre de
// véhicules déjà actifs du client dans cette station — voir MAX_ACTIVE_VEHICLES_PER_CLIENT).
// S'il n'a encore aucun véhicule enregistré, on le bascule automatiquement
// vers le mini-formulaire d'ajout (au lieu de lui montrer une liste vide).
function VehiclePicker({ vehicles, selectedIds, onToggle, onVehicleCreated, maxSelectable, onFreeLimitReached }) {
  const { addVehicle, superUserStatus } = useClientAccount();
  const [mode, setMode] = useState(vehicles.length > 0 ? 'select' : 'add');
  const [newVehicle, setNewVehicle] = useState(emptyNewVehicle);

  const setCategory = (category) => setNewVehicle({ category, brand: '', plate: newVehicle.plate });

  const handleAddVehicle = async (e) => {
    e.preventDefault();
    if (!newVehicle.category || !newVehicle.brand || !newVehicle.plate.trim()) return;
    // Le garage est plafonné à 2 véhicules hors Super User (voir schema.sql,
    // policy vehicles_insert) — vérifié ici pour un message clair au lieu d'un
    // échec silencieux de l'insert Postgres.
    if (superUserStatus !== 'ACTIVE' && vehicles.length >= MAX_FREE_VEHICLES) {
      onFreeLimitReached();
      return;
    }
    // addVehicle() est async (écriture Supabase) — sans ce await, onVehicleCreated
    // recevait la Promise elle-même au lieu du véhicule créé, donc v.id valait
    // undefined et le véhicule n'était jamais réellement ajouté à la sélection
    // (silencieusement : il apparaissait bien dans le garage, mais pas dans la
    // réservation soumise juste après).
    const created = await addVehicle({ category: newVehicle.category, brand: newVehicle.brand, plate: newVehicle.plate.trim() });
    setNewVehicle(emptyNewVehicle);
    setMode('select');
    if (created) onVehicleCreated(created);
  };

  if (mode === 'add') {
    return (
      <div className="bg-white/[0.03] border border-white/10 rounded-xl p-4 space-y-4">
        {vehicles.length > 0 && (
          <button type="button" onClick={() => setMode('select')} className="text-xs text-neutral-400 hover:text-white transition-colors">
            ← Choisir un véhicule existant
          </button>
        )}
        <p className="text-sm text-neutral-300 flex items-center gap-2"><Car className="w-4 h-4 text-blue-400" /> Ajoutez votre véhicule pour réserver.</p>
        <div>
          <label className="block text-xs font-medium text-neutral-500 mb-1.5">Type de véhicule <span className="text-red-400">*</span></label>
          <CategoryPicker value={newVehicle.category} onChange={setCategory} />
        </div>
        {newVehicle.category && (
          <div>
            <label className="block text-xs font-medium text-neutral-500 mb-1.5">Marque <span className="text-red-400">*</span></label>
            <BrandDropdown category={newVehicle.category} value={newVehicle.brand} onChange={(brand) => setNewVehicle({ ...newVehicle, brand })} />
          </div>
        )}
        <div>
          <label className="block text-xs font-medium text-neutral-500 mb-1.5">Immatriculation <span className="text-red-400">*</span></label>
          <input type="text" placeholder="Ex: DK-1234-AB" value={newVehicle.plate}
            onChange={(e) => setNewVehicle({ ...newVehicle, plate: e.target.value })}
            className="w-full bg-neutral-950 border border-white/10 rounded-xl px-4 py-2.5 text-white placeholder-neutral-600 focus:outline-none focus:border-blue-500 transition-colors" />
        </div>
        <button type="button" onClick={handleAddVehicle} disabled={!newVehicle.category || !newVehicle.brand || !newVehicle.plate.trim()}
          className="w-full bg-blue-600 hover:bg-blue-500 disabled:bg-neutral-800 disabled:text-neutral-500 disabled:cursor-not-allowed text-white font-bold py-2.5 px-4 rounded-xl transition-colors flex items-center justify-center gap-2 text-sm">
          <Plus className="w-4 h-4" /> Ajouter et continuer
        </button>
      </div>
    );
  }

  const atCap = selectedIds.length >= maxSelectable;

  return (
    <div className="space-y-2">
      {maxSelectable > 1 && (
        <p className="text-xs text-neutral-500 mb-1">
          Sélectionnez jusqu'à {maxSelectable} véhicules — <span className={atCap ? 'text-amber-400 font-medium' : 'text-neutral-400'}>{selectedIds.length}/{maxSelectable} sélectionné{selectedIds.length > 1 ? 's' : ''}</span>
        </p>
      )}
      {vehicles.map((v) => {
        const isSelected = selectedIds.includes(v.id);
        const isDisabled = !isSelected && atCap;
        return (
          <button key={v.id} type="button" disabled={isDisabled} onClick={() => onToggle(v.id)}
            className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl border text-left transition-colors ${
              isSelected ? 'bg-blue-600/20 border-blue-500' :
              isDisabled ? 'bg-neutral-950/50 border-white/5 opacity-40 cursor-not-allowed' :
              'bg-neutral-950 border-white/10 hover:border-white/20'
            }`}>
            <span className="text-xl flex-shrink-0">{categoryIcon(v.category)}</span>
            <span className="flex-1 min-w-0">
              <span className="block text-white font-medium truncate">{v.brand || 'Véhicule'}</span>
              <span className="block text-neutral-500 text-xs truncate">{v.category}{v.plate ? ` · ${v.plate}` : ''}</span>
            </span>
            {isSelected && <Check className="w-4 h-4 text-blue-400 flex-shrink-0" />}
          </button>
        );
      })}
      {!atCap && (
        <button type="button" onClick={() => setMode('add')}
          className="w-full text-left px-4 py-2.5 rounded-xl border border-dashed border-white/10 text-neutral-400 hover:text-white hover:border-white/30 transition-colors text-sm flex items-center gap-2">
          <Plus className="w-4 h-4" /> Ajouter un autre véhicule
        </button>
      )}
    </div>
  );
}

export default function Stations() {
  const { stations: registry } = useSuperAdminState();
  const { account, toggleFavorite, unhideStation, reservations, refreshActivity, superUserStatus } = useClientAccount();
  const isSuperUser = superUserStatus === 'ACTIVE';
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const location = useLocation();
  // Côté espace client connecté (/dashboard/stations), on ne dévoile la liste
  // qu'après une action de recherche explicite (texte/région ou géolocalisation) —
  // pas d'annuaire complet affiché d'office. La page publique (/stations, visiteurs
  // non connectés) garde elle la liste complète pour donner envie de s'inscrire.
  const isDashboardContext = location.pathname.startsWith('/dashboard');

  const [userPos, setUserPos] = useState(null);
  const [geoStatus, setGeoStatus] = useState(null); // null | 'loading' | 'error'
  const [geoMessage, setGeoMessage] = useState('');

  const [searchInput, setSearchInput] = useState('');
  const [regionInput, setRegionInput] = useState('');
  const [appliedSearch, setAppliedSearch] = useState(null); // null = pas de recherche active | { query, region }
  const [favoritesOnly, setFavoritesOnly] = useState(false);
  const favoriteIds = account?.favoriteStationIds || [];

  const [selectedStation, setSelectedStation] = useState(null);
  const [modalStep, setModalStep] = useState('detail'); // 'detail' | 'limit' | 'form' | 'payment'
  const [showTicket, setShowTicket] = useState(false);
  const [ticketInfo, setTicketInfo] = useState(null);
  const [selectedVehicleIds, setSelectedVehicleIds] = useState([]);
  const [service, setService] = useState('Lavage Simple');
  const [paymentMethod, setPaymentMethod] = useState(null); // null | 'wave' | 'orange_money'
  const [paymentPhone, setPaymentPhone] = useState('');
  const [paymentProcessing, setPaymentProcessing] = useState(false);
  const [promoCodeInput, setPromoCodeInput] = useState('');
  const [showUpsellModal, setShowUpsellModal] = useState(false);

  const vehicles = account?.vehicles || [];
  const selectedVehicles = vehicles.filter(v => selectedVehicleIds.includes(v.id));
  // Les motos n'ont qu'un seul type de lavage disponible — dès que la sélection
  // ne contient que des deux-roues, on restreint le choix à "Lavage Simple".
  const onlyMotoSelected = selectedVehicles.length > 0 && selectedVehicles.every(v => v.category === 'Moto');
  const availableServices = onlyMotoSelected ? ['Lavage Simple'] : ['Lavage Simple', 'Lavage Complet', 'Lavage Moteur'];

  useEffect(() => {
    if (onlyMotoSelected && service !== 'Lavage Simple') setService('Lavage Simple');
  }, [onlyMotoSelected, service]);
  // Places encore disponibles pour ce client dans cette station, compte tenu de
  // ses véhicules déjà actifs (file + en lavage) — voir MAX_ACTIVE_VEHICLES_PER_CLIENT.
  // Un Super User n'est plus plafonné à 2 : son plafond devient la taille de
  // son garage (pas littéralement "illimité", pour éviter tout abus absurde —
  // il ne peut de toute façon pas sélectionner plus de véhicules qu'il n'en possède).
  const effectiveVehicleCap = isSuperUser ? Math.max(vehicles.length, 1) : MAX_ACTIVE_VEHICLES_PER_CLIENT;
  const activeVehiclesCount = selectedStation ? reservations.filter(r => r.station_id === selectedStation.id).length : 0;
  const remainingSlots = Math.max(0, effectiveVehicleCap - activeVehiclesCount);
  const maxSelectable = Math.min(effectiveVehicleCap, remainingSlots || effectiveVehicleCap);

  const toggleVehicleSelection = (id) => {
    setSelectedVehicleIds(prev => {
      if (prev.includes(id)) return prev.filter(v => v !== id);
      if (prev.length >= maxSelectable) return prev;
      return [...prev, id];
    });
  };

  const allStations = (registry || [])
    .filter(s => s.status !== 'suspendue')
    .map(s => {
      const profile = getStationOperationalProfile(s.id);
      const distanceKm = (userPos && typeof s.lat === 'number' && typeof s.lng === 'number')
        ? haversineDistanceKm(userPos.lat, userPos.lng, s.lat, s.lng)
        : null;
      const location = s.quartier ? `${s.quartier}, ${regionLabel(s.region)}` : (s.city || s.address || 'Sénégal');
      const promo = getStationPromo(s.id);
      return {
        id: s.id,
        name: s.name,
        address: location,
        quartier: s.quartier || '',
        region: s.region || '',
        lat: typeof s.lat === 'number' ? s.lat : null,
        lng: typeof s.lng === 'number' ? s.lng : null,
        open: isStationOpenNow(profile),
        waitingCount: getStationWaitingCount(s.id),
        // Distinct de waitingCount : véhicules déjà en cours de lavage — sans ça,
        // un client voyait "0 en attente" alors que la station était occupée.
        activeCount: getStationActiveCount(s.id),
        distanceKm,
        rating: getStationRatingSummary(s.id),
        promoMessage: isBannerActive(promo) ? promo.banner.message : null,
      };
    })
    .sort((a, b) => {
      if (a.distanceKm == null && b.distanceKm == null) return 0;
      if (a.distanceKm == null) return 1;
      if (b.distanceKm == null) return -1;
      return a.distanceKm - b.distanceKm;
    });

  const stations = allStations
    .filter(s => !appliedSearch || (
      (!appliedSearch.region || s.region === appliedSearch.region) &&
      (!appliedSearch.query ||
        s.quartier.toLowerCase().includes(appliedSearch.query) ||
        s.name.toLowerCase().includes(appliedSearch.query) ||
        s.address.toLowerCase().includes(appliedSearch.query))
    ))
    .filter(s => !favoritesOnly || favoriteIds.includes(s.id));

  // Recherche texte/région, géolocalisation ou filtre favoris : n'importe
  // laquelle de ces actions explicites suffit à révéler la liste.
  // ?onboarding=1 : lien direct depuis le dashboard client vide ("Réserver mon
  // premier lavage") — on saute le filtre de recherche pour ne pas ajouter une
  // étape à un tout nouveau compte qui n'a encore jamais réservé.
  const cameFromOnboarding = searchParams.get('onboarding') === '1';
  const hasSearched = !!appliedSearch || userPos !== null || favoritesOnly || cameFromOnboarding;
  const showStationsList = !isDashboardContext || hasSearched;

  // Titre de page dédié pour la version publique (/stations, servie via
  // dashboard.html — voir vite.config.js) : sinon les moteurs de recherche ne
  // voient que le titre générique "Clean Car Galsen - Dashboards" partagé par
  // tout le SPA. Inutile en contexte connecté (/dashboard/stations, non indexé).
  useEffect(() => {
    if (!isDashboardContext) document.title = 'Trouver une station de lavage - Clean Car Galsen';
  }, [isDashboardContext]);

  const handleSearch = () => setAppliedSearch({ query: searchInput.trim().toLowerCase(), region: regionInput });
  const handleResetSearch = () => { setSearchInput(''); setRegionInput(''); setAppliedSearch(null); };

  // Pré-rempli avec le numéro enregistré à l'inscription (profiles.phone) —
  // évite de le retaper à chaque réservation. Reste un champ texte librement
  // modifiable : un client avec un second compte Wave/Orange Money, ou qui a
  // changé de numéro, peut le remplacer manuellement pour ce paiement précis
  // sans que ça touche son numéro de compte.
  const resetPaymentState = () => {
    setPaymentMethod(null);
    setPaymentPhone(account?.phone || '');
    setPaymentProcessing(false);
  };

  const openStationDetail = (station) => {
    setSelectedStation(station);
    setModalStep('detail');
    setSelectedVehicleIds([]);
    setService('Lavage Simple');
    setPromoCodeInput('');
    resetPaymentState();
  };

  const handleReserveClick = () => {
    if (!selectedStation) return;
    if (account) {
      const activeCount = reservations.filter(r => r.station_id === selectedStation.id).length;
      if (activeCount >= effectiveVehicleCap) {
        // Compte gratuit qui a déjà 2 véhicules actifs ici : c'est la limite
        // monétisée (offre gratuite), pas une simple saturation opérationnelle
        // — on montre l'upsell Super User plutôt que "attendez qu'un lavage
        // se termine". Un Super User qui sature son PROPRE plafond (rare,
        // = taille de son garage) reste sur le message opérationnel classique.
        if (!isSuperUser) { setSelectedStation(null); setShowUpsellModal(true); return; }
        setModalStep('limit');
        return;
      }
      setModalStep('form');
      // Aucune présélection : contrairement à l'ancien choix unique, laisser le
      // client cocher lui-même son/ses véhicule(s) évite qu'un clic sur le
      // premier véhicule affiché ne le désélectionne par surprise.
      setSelectedVehicleIds([]);
      resetPaymentState();
      return;
    }
    // Pas connecté : on mémorise l'intention et on file vers l'inscription.
    // Elle sera reprise et finalisée automatiquement au retour.
    sessionStorage.setItem('pendingReservationStationId', String(selectedStation.id));
    window.location.href = '/login.html?mode=register&role=automobiliste&returnTo=reserve';
  };

  // Étape 1 du formulaire (véhicule(s) + service) validée -> on passe au choix
  // du mode de paiement (Wave / Orange Money / sur place) avant de créer la réservation.
  const goToPayment = (e) => {
    e.preventDefault();
    if (selectedVehicles.length === 0 || !account || !selectedStation) return;
    setModalStep('payment');
  };

  const stationPromo = selectedStation ? getStationPromo(selectedStation.id) : null;
  const appliedPromoCode = stationPromo ? matchPromoCode(stationPromo, promoCodeInput) : null;

  const priceForVehicle = (vehicle) => {
    const category = getPricingCategory(vehicle.category);
    if (!category || !selectedStation) return 0;
    const base = getStationPricing(selectedStation.id)?.[category]?.[service] || 0;
    const discounted = applyDiscount(stationPromo, category, service, base);
    return appliedPromoCode ? applyPromoCode(appliedPromoCode, discounted) : discounted;
  };
  const servicePrice = selectedVehicles.reduce((sum, v) => sum + priceForVehicle(v), 0);

  // Crée effectivement la/les réservation(s) dans la file de la station, une
  // fois le mode de paiement choisi (payé en ligne, ou à régler sur place).
  // Un `reservationGroupId` partagé relie les véhicules réservés ensemble,
  // pour que le tableau de bord station puisse les afficher groupés.
  const finalizeReservation = async ({ paid, method }) => {
    if (selectedVehicles.length === 0 || !account || !selectedStation) return;
    const reservationGroupId = selectedVehicles.length > 1 ? `RG-${Date.now()}` : null;
    const waitingBefore = getStationWaitingCount(selectedStation.id);

    const createdEntries = [];
    for (let idx = 0; idx < selectedVehicles.length; idx++) {
      const vehicle = selectedVehicles[idx];
      const vehicleLabel = `${vehicle.brand}${vehicle.plate ? ` (${vehicle.plate})` : ''}`;
      const category = getPricingCategory(vehicle.category);
      // Prix figé à la réservation (réduction + code promo déjà appliqués),
      // pour que l'encaissement sur place facture le même montant que celui
      // affiché ici, même si la promo change ou expire entre-temps.
      const amount = priceForVehicle(vehicle);
      const reservation = await createReservation(selectedStation.id, {
        clientId: account.id, clientName: account.name, vehicleLabel, category, service, paid, amount,
        paymentMethod: paid ? method : null,
        reservationGroupId, groupSize: selectedVehicles.length,
      });
      if (paid) {
        await recordClientTransaction(selectedStation.id, {
          reservationId: reservation.id, clientId: account.id, clientName: account.name, vehicleLabel, service, method, amount,
        });
      }
      createdEntries.push({ vehicle: vehicleLabel, position: waitingBefore + idx + 1, amount });
    }
    unhideStation(selectedStation.id);
    refreshActivity();

    const now = new Date();
    const dateLabel = now.toLocaleDateString('fr-FR', { day: '2-digit', month: 'long', year: 'numeric' });

    const stationProfile = getStationOperationalProfile(selectedStation.id);
    setTicketInfo({
      client: account.name, vehicles: createdEntries, service,
      station: selectedStation.name, stationAddress: selectedStation.address, stationPhone: stationProfile?.phone || '',
      stationLogo: stationProfile?.logo || null, stationCachet: stationProfile?.cachet || null,
      estimatedWait: (waitingBefore + selectedVehicles.length) * 20,
      ticketNumber: `TK-${Date.now().toString().slice(-5)}`,
      dateLabel, total: paid ? servicePrice : null,
      paid, method,
    });
    setSelectedStation(null);
    setShowTicket(true);
    resetPaymentState();
  };

  const handleDownloadReceipt = () => {
    if (!ticketInfo?.paid) return;
    downloadReceiptPdf({
      stationName: ticketInfo.station,
      stationAddress: ticketInfo.stationAddress,
      stationPhone: ticketInfo.stationPhone,
      stationLogo: ticketInfo.stationLogo,
      stationCachet: ticketInfo.stationCachet,
      receiptId: ticketInfo.ticketNumber,
      date: ticketInfo.dateLabel,
      client: ticketInfo.client,
      method: ticketInfo.method,
      total: ticketInfo.total,
      items: ticketInfo.vehicles.map(v => ({ label: v.vehicle, service: ticketInfo.service, amount: v.amount })),
    });
  };

  const handlePayOnSite = () => finalizeReservation({ paid: false, method: null });

  const handlePayOnline = () => {
    if (!paymentMethod || paymentPhone.trim().length < 6) return;
    setPaymentProcessing(true);
    setTimeout(() => {
      finalizeReservation({ paid: true, method: paymentMethod === 'wave' ? 'Wave' : 'Orange Money' });
    }, 1400);
  };

  const useMyPosition = () => {
    if (!navigator.geolocation) {
      setGeoStatus('error');
      setGeoMessage("La géolocalisation n'est pas disponible sur cet appareil.");
      return;
    }
    setGeoStatus('loading');
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setUserPos({ lat: pos.coords.latitude, lng: pos.coords.longitude });
        setGeoStatus(null);
        setGeoMessage('Stations triées par proximité.');
      },
      (err) => {
        const messages = { 1: 'Permission refusée.', 2: 'Position indisponible.', 3: 'Délai dépassé, réessayez.' };
        setGeoStatus('error');
        setGeoMessage(messages[err.code] || 'Impossible de récupérer votre position.');
      },
      { enableHighAccuracy: true, timeout: 10000 }
    );
  };

  // Ouverture directe d'une station via ?stationId= (venu de la landing page).
  // `registry` est dans les dépendances pour retenter tant que la liste n'est
  // pas encore chargée au premier rendu — mais il se rafraîchit ensuite par
  // sondage toutes les 8s (voir useSuperAdminState), donc sans ce garde-fou
  // openStationDetail() (qui remet modalStep à 'detail' et vide la sélection)
  // se redéclenchait à chaque poll, éjectant le client de son formulaire en
  // cours de remplissage — voire en pleine saisie du numéro Wave/Orange Money.
  const autoOpenedStationIdRef = useRef(null);
  useEffect(() => {
    const stationId = searchParams.get('stationId');
    if (!stationId || allStations.length === 0) return;
    if (autoOpenedStationIdRef.current === stationId) return;
    const match = allStations.find(s => String(s.id) === stationId);
    if (match) {
      openStationDetail(match);
      autoOpenedStationIdRef.current = stationId;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams, registry]);

  // Reprise automatique d'une réservation laissée en attente avant inscription/connexion
  useEffect(() => {
    if (!account) return;
    const pendingId = sessionStorage.getItem('pendingReservationStationId');
    if (!pendingId || allStations.length === 0) return;
    const match = allStations.find(s => String(s.id) === pendingId);
    if (match) {
      const activeCount = reservations.filter(r => r.station_id === match.id).length;
      if (activeCount >= effectiveVehicleCap && !isSuperUser) {
        setShowUpsellModal(true);
      } else {
        setSelectedStation(match);
        setModalStep(activeCount >= effectiveVehicleCap ? 'limit' : 'form');
        setSelectedVehicleIds([]);
        setService('Lavage Simple');
      }
    }
    sessionStorage.removeItem('pendingReservationStationId');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [account, registry]);

  return (
    <div className="container mx-auto px-4 py-12 max-w-6xl relative z-10">
      {!isDashboardContext && (
        <nav aria-label="Fil d'Ariane" className="mb-6 text-sm text-neutral-500 flex items-center gap-2">
          <Link to="/" className="hover:text-white transition-colors">Accueil</Link>
          <span>/</span>
          <span className="text-neutral-300">Trouver une station</span>
        </nav>
      )}
      <div className="text-center mb-10">
        <h1 className="text-4xl md:text-5xl font-bold mb-4 tracking-tight text-white">L&apos;Espace <span className="text-blue-400">Stations Partenaires</span></h1>
        <p className="text-neutral-400 text-lg max-w-2xl mx-auto">Trouvez la station la plus proche et réservez votre place en quelques secondes.</p>
      </div>

      {/* Recherche par quartier / région */}
      <div className="glass-card p-4 rounded-2xl mb-4 flex flex-col md:flex-row gap-4 items-center">
        <div className="flex-1 w-full relative">
          <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-neutral-500" />
          <input type="text" value={searchInput} onChange={e => setSearchInput(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && handleSearch()}
            placeholder="Rechercher un quartier, une station..."
            className="w-full bg-black/50 border border-white/10 rounded-xl py-3 pl-10 pr-4 text-white focus:outline-none focus:border-blue-500 transition-colors" />
        </div>
        <select value={regionInput} onChange={e => setRegionInput(e.target.value)}
          className="w-full md:w-48 bg-black/50 border border-white/10 rounded-xl py-3 px-4 text-white focus:outline-none focus:border-blue-500 transition-colors appearance-none cursor-pointer">
          <option value="">Toutes les régions</option>
          {SENEGAL_REGIONS.map(r => <option key={r.value} value={r.value}>{r.label}</option>)}
        </select>
        <button onClick={handleSearch} className="w-full md:w-auto bg-blue-600 hover:bg-blue-500 text-white font-medium py-3 px-6 rounded-xl transition-colors shadow-lg shadow-blue-500/20 flex items-center justify-center gap-2">
          <Search className="w-4 h-4" /> Rechercher
        </button>
      </div>

      <div className="flex flex-col items-center gap-2 mb-10">
        {appliedSearch && (
          <div className="flex items-center gap-3 mb-2">
            <span className="text-neutral-400 text-sm">{stations.length} station{stations.length > 1 ? 's' : ''} trouvée{stations.length > 1 ? 's' : ''}</span>
            <button onClick={handleResetSearch} className="text-blue-400 hover:text-white text-sm font-medium transition-colors">Réinitialiser ✕</button>
          </div>
        )}
        <div className="flex items-center gap-4 flex-wrap justify-center">
          <button onClick={useMyPosition} disabled={geoStatus === 'loading'}
            className="text-blue-400 hover:text-white font-medium text-sm transition-colors flex items-center gap-2">
            <Navigation className="w-4 h-4" /> {geoStatus === 'loading' ? 'Localisation...' : 'Ou trouver la station la plus proche de moi'}
          </button>
          {account && favoriteIds.length > 0 && (
            <button onClick={() => setFavoritesOnly(v => !v)}
              className={`text-sm font-medium transition-colors flex items-center gap-2 ${favoritesOnly ? 'text-red-400' : 'text-neutral-400 hover:text-white'}`}>
              <Heart className={`w-4 h-4 ${favoritesOnly ? 'fill-red-400' : ''}`} /> {favoritesOnly ? 'Toutes les stations' : 'Mes favoris'}
            </button>
          )}
        </div>
        {geoMessage && <p className={`text-sm ${geoStatus === 'error' ? 'text-red-400' : 'text-emerald-400'}`}>{geoMessage}</p>}
      </div>

      {!showStationsList ? (
        <div className="glass-card rounded-2xl p-16 text-center border-dashed border-2 border-white/10">
          <Search className="w-14 h-14 text-neutral-600 mx-auto mb-4" />
          <h3 className="text-xl font-bold text-white mb-2">Recherchez une station pour commencer</h3>
          <p className="text-neutral-400 mb-4">Tapez un quartier, une station, choisissez une région, ou utilisez votre position pour découvrir les stations disponibles près de vous.</p>
        </div>
      ) : stations.length === 0 ? (
        <div className="glass-card rounded-2xl p-16 text-center border-dashed border-2 border-white/10">
          <Building2 className="w-14 h-14 text-neutral-600 mx-auto mb-4" />
          <h3 className="text-xl font-bold text-white mb-2">{appliedSearch ? 'Aucune station ne correspond à votre recherche' : 'Aucune station disponible pour le moment'}</h3>
          <p className="text-neutral-400 mb-4">{appliedSearch ? 'Essayez un autre quartier ou une autre région.' : 'Revenez bientôt, de nouvelles stations rejoignent le réseau régulièrement.'}</p>
          {appliedSearch && (
            <button onClick={handleResetSearch} className="bg-blue-600 hover:bg-blue-500 text-white px-6 py-2.5 rounded-xl font-medium transition-colors">Voir toutes les stations</button>
          )}
        </div>
      ) : (
        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
          {stations.map((station, index) => (
            <motion.div key={station.id} initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: index * 0.05 }}
              onClick={() => openStationDetail(station)}
              className="glass-card rounded-2xl p-6 hover:border-blue-500/30 transition-colors flex flex-col h-full border border-white/5 bg-white/[0.02] cursor-pointer">
              <div className="flex justify-between items-start mb-3">
                <h3 className="text-xl font-bold text-white pr-2">{station.name}</h3>
                <div className="flex items-center gap-2 flex-shrink-0">
                  {account && (
                    <button onClick={(e) => { e.stopPropagation(); toggleFavorite(station.id); }}
                      className="p-1.5 rounded-lg hover:bg-white/10 transition-colors">
                      <Heart className={`w-4 h-4 ${favoriteIds.includes(station.id) ? 'fill-red-400 text-red-400' : 'text-neutral-500'}`} />
                    </button>
                  )}
                  {station.open
                    ? <span className="text-emerald-400 bg-emerald-500/10 px-3 py-1 rounded-md text-xs font-medium flex items-center border border-emerald-500/20"><Clock className="w-3.5 h-3.5 mr-1" /> Ouvert</span>
                    : <span className="text-red-400 bg-red-500/10 px-3 py-1 rounded-md text-xs font-medium flex items-center border border-red-500/20"><Clock className="w-3.5 h-3.5 mr-1" /> Fermé</span>}
                </div>
              </div>
              {station.promoMessage && (
                <div className="mb-3 flex items-center gap-2 bg-amber-500/10 border border-amber-500/20 rounded-lg px-3 py-1.5">
                  <Megaphone className="w-3.5 h-3.5 text-amber-400 flex-shrink-0" />
                  <span className="text-amber-300 text-xs font-medium truncate">{station.promoMessage}</span>
                </div>
              )}
              <div className="mb-3"><StarRatingDisplay average={station.rating.average} count={station.rating.count} /></div>
              <div className="space-y-3 mb-6 flex-1">
                <div className="flex items-center text-neutral-400"><MapPin className="w-5 h-5 mr-3 text-blue-400 flex-shrink-0" /><span>{station.address}</span></div>
                <div className="flex justify-between items-center border-t border-white/5 pt-3">
                  {formatDistance(station.distanceKm)
                    ? <span className="bg-white/5 text-neutral-300 font-medium px-3 py-1 rounded-md text-sm border border-white/10">{formatDistance(station.distanceKm)}</span>
                    : <span />}
                  <span className="text-blue-400 bg-blue-500/10 px-2 py-1 rounded-md text-sm font-medium border border-blue-500/20">
                    {station.activeCount > 0 && <>{station.activeCount} en lavage · </>}{station.waitingCount} en attente
                  </span>
                </div>
              </div>
              <button onClick={(e) => { e.stopPropagation(); openStationDetail(station); }}
                className="w-full bg-blue-600 hover:bg-blue-500 text-white font-bold py-3.5 rounded-xl transition-all shadow-[0_0_15px_rgba(37,99,235,0.3)] flex items-center justify-center active:scale-95">
                Voir la station <ArrowRight className="w-5 h-5 ml-2" />
              </button>
            </motion.div>
          ))}
        </div>
      )}

      {/* Fiche Station + Réservation */}
      <AnimatePresence>
        {selectedStation && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm">
            <motion.div initial={{ opacity: 0, scale: 0.95, y: 20 }} animate={{ opacity: 1, scale: 1, y: 0 }} exit={{ opacity: 0, scale: 0.95, y: 20 }}
              className="bg-neutral-900 border border-white/10 rounded-2xl p-6 w-full max-w-md shadow-2xl relative">
              <button onClick={() => setSelectedStation(null)} className="absolute top-4 right-4 text-neutral-400 hover:text-white"><X className="w-6 h-6" /></button>

              {modalStep === 'detail' ? (
                <>
                  <div className="flex items-center gap-3 mb-2">
                    <div className="p-2.5 bg-blue-500/20 rounded-xl"><Building2 className="w-5 h-5 text-blue-400" /></div>
                    <div className="flex-1">
                      <h2 className="text-xl font-bold text-white">{selectedStation.name}</h2>
                      <p className="text-neutral-400 text-sm flex items-center gap-1 flex-wrap">
                        <MapPin className="w-3.5 h-3.5" /> {selectedStation.address}
                        {formatDistance(selectedStation.distanceKm) && (
                          <span className="text-blue-400 font-medium">· {formatDistance(selectedStation.distanceKm)}</span>
                        )}
                      </p>
                    </div>
                    {account && (
                      <button onClick={() => toggleFavorite(selectedStation.id)} className="p-2 rounded-lg hover:bg-white/10 transition-colors flex-shrink-0">
                        <Heart className={`w-5 h-5 ${favoriteIds.includes(selectedStation.id) ? 'fill-red-400 text-red-400' : 'text-neutral-500'}`} />
                      </button>
                    )}
                  </div>
                  {selectedStation.lat != null && selectedStation.lng != null && (
                    <div className="mb-4 rounded-xl overflow-hidden border border-white/10">
                      <iframe
                        title={`Carte - ${selectedStation.name}`}
                        src={`https://www.google.com/maps?q=${selectedStation.lat},${selectedStation.lng}&z=15&output=embed`}
                        className="w-full h-40 border-0"
                        loading="lazy"
                        referrerPolicy="no-referrer-when-downgrade"
                      />
                      <a href={`https://www.google.com/maps/dir/?api=1&destination=${selectedStation.lat},${selectedStation.lng}`}
                        target="_blank" rel="noopener noreferrer"
                        className="flex items-center justify-center gap-2 bg-white/5 hover:bg-white/10 text-blue-400 hover:text-white text-sm font-medium py-2.5 transition-colors">
                        <Navigation className="w-4 h-4" /> Voir l'itinéraire
                      </a>
                    </div>
                  )}
                  {selectedStation.promoMessage && (
                    <div className="mb-4 flex items-center gap-2 bg-amber-500/10 border border-amber-500/20 rounded-lg px-3 py-2">
                      <Megaphone className="w-4 h-4 text-amber-400 flex-shrink-0" />
                      <span className="text-amber-300 text-sm font-medium">{selectedStation.promoMessage}</span>
                    </div>
                  )}
                  <div className="mb-6"><StarRatingDisplay average={selectedStation.rating.average} count={selectedStation.rating.count} /></div>
                  <div className="grid grid-cols-3 gap-3 mb-6">
                    <div className="bg-white/5 border border-white/10 rounded-xl p-4 text-center">
                      <p className="text-2xl font-bold text-purple-400">{selectedStation.activeCount}</p>
                      <p className="text-xs text-neutral-500 mt-1">En lavage</p>
                    </div>
                    <div className="bg-white/5 border border-white/10 rounded-xl p-4 text-center">
                      <p className="text-2xl font-bold text-blue-400">{selectedStation.waitingCount}</p>
                      <p className="text-xs text-neutral-500 mt-1">En attente</p>
                    </div>
                    <div className={`rounded-xl p-4 text-center border ${selectedStation.open ? 'bg-emerald-500/10 border-emerald-500/20' : 'bg-red-500/10 border-red-500/20'}`}>
                      <p className={`text-sm font-bold ${selectedStation.open ? 'text-emerald-400' : 'text-red-400'}`}>{selectedStation.open ? 'Ouvert' : 'Fermé'}</p>
                      <p className="text-xs text-neutral-500 mt-1">Statut actuel</p>
                    </div>
                  </div>
                  <button onClick={handleReserveClick} disabled={!selectedStation.open}
                    className="w-full bg-blue-600 hover:bg-blue-500 disabled:bg-neutral-800 disabled:text-neutral-500 disabled:cursor-not-allowed text-white font-bold py-3.5 px-4 rounded-xl transition-all flex items-center justify-center gap-2">
                    <Ticket className="w-5 h-5" /> {selectedStation.open ? 'Réserver ma place' : 'Station fermée'}
                  </button>
                  {!account && selectedStation.open && (
                    <p className="text-xs text-neutral-500 text-center mt-3">Compte automobiliste requis — inscription rapide si besoin.</p>
                  )}
                </>
              ) : modalStep === 'limit' ? (
                <>
                  <div className="flex items-center gap-3 mb-4">
                    <div className="p-2.5 bg-amber-500/20 rounded-xl"><AlertTriangle className="w-5 h-5 text-amber-400" /></div>
                    <div>
                      <h2 className="text-xl font-bold text-white">Limite atteinte</h2>
                      <p className="text-neutral-400 text-sm">{selectedStation.name}</p>
                    </div>
                  </div>
                  <p className="text-sm text-neutral-300 bg-amber-500/10 border border-amber-500/20 rounded-xl px-4 py-3 mb-6">
                    Vous avez déjà <strong className="text-amber-400">{effectiveVehicleCap} véhicules</strong> en file ou en lavage dans cette station. Attendez qu'un lavage se termine pour réserver à nouveau.
                  </p>
                  <button onClick={() => { setSelectedStation(null); navigate('/dashboard'); }}
                    className="w-full bg-blue-600 hover:bg-blue-500 text-white font-bold py-3.5 px-4 rounded-xl transition-all flex items-center justify-center gap-2">
                    <Droplets className="w-5 h-5" /> Suivre mes véhicules en direct
                  </button>
                </>
              ) : modalStep === 'form' ? (
                <>
                  <div className="flex items-center gap-3 mb-6">
                    <div className="p-2.5 bg-blue-500/20 rounded-xl"><Ticket className="w-5 h-5 text-blue-400" /></div>
                    <div>
                      <h2 className="text-xl font-bold text-white">Réserver ma place</h2>
                      <p className="text-neutral-400 text-sm">{selectedStation.name} · {account?.name}</p>
                    </div>
                  </div>
                  {selectedStation.waitingCount > 0 && (
                    <div className="bg-blue-950/40 border border-blue-500/20 rounded-xl px-4 py-3 mb-5 flex items-center gap-3">
                      <div className="w-2 h-2 rounded-full bg-blue-400 animate-pulse flex-shrink-0" />
                      <p className="text-sm text-blue-200/80"><strong className="text-blue-400">{selectedStation.waitingCount} véhicule(s)</strong> en file. Vous serez le <strong className="text-white">n{String.fromCharCode(176)}{selectedStation.waitingCount + 1}</strong>.</p>
                    </div>
                  )}
                  <form onSubmit={goToPayment} className="space-y-4">
                    <div>
                      <label className="block text-sm font-medium text-neutral-400 mb-1.5">Véhicule{maxSelectable > 1 ? '(s)' : ''} <span className="text-red-400">*</span></label>
                      <VehiclePicker
                        vehicles={vehicles}
                        selectedIds={selectedVehicleIds}
                        onToggle={toggleVehicleSelection}
                        onVehicleCreated={(v) => setSelectedVehicleIds(prev => prev.length >= maxSelectable ? prev : [...prev, v.id])}
                        maxSelectable={maxSelectable}
                        onFreeLimitReached={() => { setSelectedStation(null); setShowUpsellModal(true); }}
                      />
                    </div>
                    {selectedVehicles.length > 0 && (
                      <div>
                        <label className="block text-sm font-medium text-neutral-400 mb-1.5">Type de lavage {selectedVehicles.length > 1 ? '(appliqué aux véhicules sélectionnés)' : ''}</label>
                        <div className={`grid gap-2 ${availableServices.length === 1 ? 'grid-cols-1' : 'grid-cols-3'}`}>
                          {availableServices.map(s => (
                            <button key={s} type="button" onClick={() => setService(s)}
                              className={`px-3 py-2.5 rounded-xl text-sm font-medium border transition-all ${service === s ? 'bg-blue-600 border-blue-500 text-white' : 'bg-neutral-950 border-white/10 text-neutral-400 hover:border-white/20 hover:text-white'}`}>{s}</button>
                          ))}
                        </div>
                        {onlyMotoSelected && (
                          <p className="text-neutral-500 text-xs mt-1.5">Un seul type de lavage est proposé pour les motos.</p>
                        )}
                      </div>
                    )}
                    {selectedVehicles.length > 0 && stationPromo?.code?.active && (
                      <div>
                        <label className="block text-sm font-medium text-neutral-400 mb-1.5">Code promo <span className="text-neutral-600">(optionnel)</span></label>
                        <input type="text" value={promoCodeInput} onChange={e => setPromoCodeInput(e.target.value)}
                          placeholder="Ex: BIENVENUE10"
                          className="w-full bg-neutral-950 border border-white/10 rounded-xl px-4 py-3 text-white uppercase placeholder:normal-case focus:outline-none focus:border-blue-500 transition-colors" />
                        {promoCodeInput && (
                          appliedPromoCode
                            ? <p className="text-emerald-400 text-xs mt-1.5 flex items-center gap-1"><CheckCircle2 className="w-3.5 h-3.5" /> Code appliqué !</p>
                            : <p className="text-red-400 text-xs mt-1.5">Code invalide ou expiré.</p>
                        )}
                      </div>
                    )}
                    {selectedVehicles.length > 0 && (
                      <div className="bg-white/5 border border-white/10 rounded-xl px-4 py-3 flex items-center justify-between">
                        <span className="text-neutral-400 text-sm">Total estimé</span>
                        <span className="text-lg font-bold text-white">{servicePrice.toLocaleString('fr-FR')} <span className="text-xs font-medium text-neutral-400">FCFA</span></span>
                      </div>
                    )}
                    {selectedVehicles.length > 0 && (
                      <div className="pt-2">
                        <button type="submit"
                          className="w-full bg-blue-600 hover:bg-blue-500 disabled:bg-neutral-800 disabled:text-neutral-500 disabled:cursor-not-allowed text-white font-bold py-3.5 px-4 rounded-xl transition-all flex items-center justify-center gap-2">
                          Continuer vers le paiement <ArrowRight className="w-4 h-4" />
                        </button>
                      </div>
                    )}
                  </form>
                </>
              ) : (
                <>
                  <div className="flex items-center gap-3 mb-2">
                    <button onClick={() => setModalStep('form')} className="p-2 rounded-lg hover:bg-white/10 transition-colors flex-shrink-0" title="Retour">
                      <ArrowRight className="w-4 h-4 text-neutral-400 rotate-180" />
                    </button>
                    <div className="p-2.5 bg-blue-500/20 rounded-xl"><Wallet className="w-5 h-5 text-blue-400" /></div>
                    <div>
                      <h2 className="text-xl font-bold text-white">Mode de paiement</h2>
                      <p className="text-neutral-400 text-sm">{selectedStation.name} · {service}</p>
                    </div>
                  </div>

                  <div className="bg-white/5 border border-white/10 rounded-xl p-4 mb-5 flex items-center justify-between">
                    <span className="text-neutral-400 text-sm">Montant à régler</span>
                    <span className="text-2xl font-bold text-white">{servicePrice.toLocaleString('fr-FR')} <span className="text-sm font-medium text-neutral-400">FCFA</span></span>
                  </div>

                  {paymentProcessing ? (
                    <div className="flex flex-col items-center justify-center py-10 gap-3">
                      <Loader2 className="w-8 h-8 text-blue-400 animate-spin" />
                      <p className="text-neutral-300 text-sm">Traitement du paiement {paymentMethod === 'wave' ? 'Wave' : 'Orange Money'}...</p>
                    </div>
                  ) : paymentMethod ? (
                    <div className="space-y-4">
                      <button type="button" onClick={() => setPaymentMethod(null)} className="text-xs text-neutral-400 hover:text-white transition-colors">
                        ← Changer de mode de paiement
                      </button>
                      <div>
                        <label className="block text-sm font-medium text-neutral-400 mb-1.5">Numéro {paymentMethod === 'wave' ? 'Wave' : 'Orange Money'} <span className="text-red-400">*</span></label>
                        <input type="tel" placeholder="+221 77 000 00 00" value={paymentPhone}
                          onChange={(e) => setPaymentPhone(e.target.value)}
                          className="w-full bg-neutral-950 border border-white/10 rounded-xl px-4 py-3 text-white placeholder-neutral-600 focus:outline-none focus:border-blue-500 transition-colors" />
                        {account?.phone && paymentPhone === account.phone && (
                          <p className="text-neutral-500 text-xs mt-1.5">Numéro de votre compte — modifiez-le si vous payez depuis un autre numéro.</p>
                        )}
                      </div>
                      <button type="button" onClick={handlePayOnline} disabled={paymentPhone.trim().length < 6}
                        className={`w-full font-bold py-3.5 px-4 rounded-xl transition-all flex items-center justify-center gap-2 text-white disabled:bg-neutral-800 disabled:text-neutral-500 disabled:cursor-not-allowed ${paymentMethod === 'wave' ? 'bg-[#1DC8E0] hover:bg-[#17aec3]' : 'bg-[#FF7900] hover:bg-[#e56b00]'}`}>
                        <Smartphone className="w-5 h-5" /> Payer {servicePrice.toLocaleString('fr-FR')} FCFA via {paymentMethod === 'wave' ? 'Wave' : 'Orange Money'}
                      </button>
                    </div>
                  ) : (
                    <div className="space-y-3">
                      <button type="button" onClick={() => setPaymentMethod('wave')}
                        className="w-full flex items-center gap-4 px-5 py-4 rounded-xl border border-white/10 bg-white/5 hover:border-[#1DC8E0]/50 hover:bg-[#1DC8E0]/10 transition-colors text-left">
                        <div className="w-11 h-11 rounded-xl bg-[#1DC8E0]/20 flex items-center justify-center flex-shrink-0">
                          <Smartphone className="w-5 h-5 text-[#1DC8E0]" />
                        </div>
                        <div className="flex-1">
                          <p className="text-white font-bold">Wave</p>
                          <p className="text-neutral-500 text-xs">Payer en ligne, immédiatement</p>
                        </div>
                      </button>
                      <button type="button" onClick={() => setPaymentMethod('orange_money')}
                        className="w-full flex items-center gap-4 px-5 py-4 rounded-xl border border-white/10 bg-white/5 hover:border-[#FF7900]/50 hover:bg-[#FF7900]/10 transition-colors text-left">
                        <div className="w-11 h-11 rounded-xl bg-[#FF7900]/20 flex items-center justify-center flex-shrink-0">
                          <Smartphone className="w-5 h-5 text-[#FF7900]" />
                        </div>
                        <div className="flex-1">
                          <p className="text-white font-bold">Orange Money</p>
                          <p className="text-neutral-500 text-xs">Payer en ligne, immédiatement</p>
                        </div>
                      </button>
                      <div className="flex items-center gap-3 py-1">
                        <div className="flex-1 h-px bg-white/10" />
                        <span className="text-xs text-neutral-600 uppercase tracking-wider">Ou</span>
                        <div className="flex-1 h-px bg-white/10" />
                      </div>
                      <button type="button" onClick={handlePayOnSite}
                        className="w-full flex items-center gap-4 px-5 py-4 rounded-xl border border-dashed border-white/10 text-neutral-300 hover:text-white hover:border-white/30 transition-colors text-left">
                        <div className="w-11 h-11 rounded-xl bg-white/5 flex items-center justify-center flex-shrink-0">
                          <Wallet className="w-5 h-5 text-neutral-400" />
                        </div>
                        <div className="flex-1">
                          <p className="font-bold">Payer à la station</p>
                          <p className="text-neutral-500 text-xs">Espèces ou mobile money sur place</p>
                        </div>
                      </button>
                    </div>
                  )}
                </>
              )}
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Ecran Ticket de Confirmation */}
      <AnimatePresence>
        {showTicket && ticketInfo && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
            <motion.div initial={{ opacity: 0, scale: 0.9, y: 30 }} animate={{ opacity: 1, scale: 1, y: 0 }} exit={{ opacity: 0, scale: 0.9 }}
              transition={{ type: 'spring', stiffness: 200, damping: 20 }}
              className="bg-neutral-900 border border-white/10 rounded-2xl w-full max-w-sm shadow-2xl max-h-[90vh] overflow-y-auto">
              <div className="bg-gradient-to-r from-blue-600/30 to-emerald-500/30 p-4 text-center border-b border-white/10">
                <motion.div initial={{ scale: 0 }} animate={{ scale: 1 }} transition={{ delay: 0.2, type: 'spring', stiffness: 300 }}
                  className="w-12 h-12 rounded-full bg-emerald-500/20 border-2 border-emerald-400 flex items-center justify-center mx-auto mb-2">
                  <CheckCircle2 className="w-6 h-6 text-emerald-400" />
                </motion.div>
                <h2 className="text-lg font-bold text-white mb-1">{ticketInfo.vehicles.length > 1 ? 'Réservations confirmées !' : 'Réservation confirmée !'}</h2>
                <p className="text-neutral-400 text-xs">{ticketInfo.vehicles.length > 1 ? `${ticketInfo.vehicles.length} places sont réservées` : 'Votre place est réservée'}</p>
              </div>
              <div className="p-4">
                <div className="text-center mb-3">
                  <p className="text-xs text-neutral-500 uppercase tracking-widest font-bold mb-1">Numéro de ticket</p>
                  <p className="text-2xl font-bold font-mono text-blue-400 tracking-wider">{ticketInfo.ticketNumber}</p>
                </div>
                <div className="space-y-2 border-t border-white/10 py-3 mb-3">
                  {[
                    { label: 'Station', value: ticketInfo.station },
                    { label: 'Client', value: ticketInfo.client },
                    { label: 'Service', value: ticketInfo.service },
                    { label: 'Paiement', value: ticketInfo.paid ? `Payé via ${ticketInfo.method}` : 'À régler sur place', accent: ticketInfo.paid ? 'text-emerald-400' : 'text-orange-400' },
                  ].map(row => (
                    <div key={row.label} className="flex justify-between text-sm"><span className="text-neutral-400">{row.label}</span><span className={`font-medium ${row.accent || 'text-white'}`}>{row.value}</span></div>
                  ))}
                </div>
                <div className="space-y-2 border-b border-white/10 pb-3 mb-3">
                  {ticketInfo.vehicles.map((v) => (
                    <div key={v.vehicle} className="flex items-center justify-between bg-white/5 border border-white/10 rounded-xl px-4 py-2">
                      <span className="text-white text-sm font-medium truncate pr-2">{v.vehicle}</span>
                      <span className="text-blue-400 text-xs font-bold bg-blue-500/10 border border-blue-500/20 px-2.5 py-1 rounded-md whitespace-nowrap">n{String.fromCharCode(176)}{v.position}</span>
                    </div>
                  ))}
                </div>
                <div className="grid grid-cols-1 gap-3 mb-4">
                  <div className="bg-emerald-500/10 border border-emerald-500/20 rounded-xl p-3 text-center">
                    <p className="text-2xl font-bold text-emerald-400">~{ticketInfo.estimatedWait}</p>
                    <p className="text-xs text-neutral-500 mt-1">Minutes d&apos;attente estimée</p>
                  </div>
                </div>
                {ticketInfo.paid && (
                  <button onClick={handleDownloadReceipt}
                    className="w-full mb-2.5 py-2.5 rounded-xl border border-emerald-500/30 bg-emerald-500/10 text-emerald-400 hover:bg-emerald-500/20 transition-colors font-bold text-sm flex items-center justify-center gap-2">
                    <Download className="w-4 h-4" /> Télécharger le reçu (PDF)
                  </button>
                )}
                <div className="flex gap-3">
                  <button onClick={() => setShowTicket(false)}
                    className="flex-1 py-2.5 rounded-xl border border-white/10 text-neutral-400 hover:text-white hover:bg-white/5 transition-colors font-medium text-sm">Fermer</button>
                  <button onClick={() => { setShowTicket(false); navigate('/dashboard'); }}
                    className="flex-1 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-500 text-white font-bold transition-all flex items-center justify-center gap-2 text-sm">
                    <Droplets className="w-4 h-4" /> Suivre en direct
                  </button>
                </div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      <SuperUserUpsellModal open={showUpsellModal} onClose={() => setShowUpsellModal(false)} />
    </div>
  );
}
