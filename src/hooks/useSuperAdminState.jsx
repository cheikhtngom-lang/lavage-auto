import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { supabase } from '../lib/supabaseClient';
import { setStationsCache, setWashPricingCache, setQueueSnapshotCache, setPublicStatsCache, setReviewsCache } from '../lib/stationData';
import { setCustomBrandsCache } from '../lib/vehicleBrands';
import { AD_CAMPAIGN_DAYS } from '../lib/ads';

// Plans par défaut — modifiables depuis Super Admin > Paramètres (table `plans`,
// une ligne par clé ; sert de secours si la table est vide/pas encore lue).
export const DEFAULT_PLANS = {
    Starter: { label: 'Starter', price: 15000 },
    Pro: { label: 'Pro', price: 35000 },
    Business: { label: 'Business', price: 75000 },
};

const rowToDispute = (row) => ({
    id: row.id,
    stationId: row.station_id,
    stationName: row.station_name,
    subject: row.subject,
    description: row.description,
    amount: row.amount,
    status: row.status,
    createdAt: row.created_at,
    resolvedAt: row.resolved_at,
});

// stations + station_billing (Supabase) ↔ forme plate attendue par l'UI —
// voir supabase/schema.sql pour pourquoi les infos de facturation sont dans
// une table séparée (jamais exposées publiquement, contrairement au reste).
const rowToStation = (row) => ({
    id: row.id,
    name: row.name,
    ownerName: row.owner_name || '',
    ownerEmail: row.owner_email || '',
    ownerPhone: row.owner_phone || '',
    address: row.address || '',
    city: row.city || '',
    quartier: row.quartier || '',
    region: row.region || '',
    lat: row.lat,
    lng: row.lng,
    status: row.status,
    loyaltyThreshold: row.loyalty_threshold ?? 5,
    openTime: row.open_time,
    closeTime: row.close_time,
    logo: row.logo_url,
    cachet: row.cachet_url,
    promoConfig: row.promo_config || {},
    joinedAt: row.created_at,
    plan: row.station_billing?.plan || 'Starter',
    subscriptionStatus: row.station_billing?.subscription_status || 'essai',
    nextBillingDate: row.station_billing?.next_billing_date || null,
    clientsCount: row.station_billing?.clients_count || 0,
    notes: row.station_billing?.notes || '',
});

const STATION_FIELDS = { name: 'name', ownerName: 'owner_name', ownerEmail: 'owner_email', ownerPhone: 'owner_phone', address: 'address', city: 'city', quartier: 'quartier', region: 'region', lat: 'lat', lng: 'lng', status: 'status', loyaltyThreshold: 'loyalty_threshold' };
const BILLING_FIELDS = { plan: 'plan', subscriptionStatus: 'subscription_status', nextBillingDate: 'next_billing_date', clientsCount: 'clients_count', notes: 'notes' };

function splitStationPatch(patch) {
    const stationPatch = {};
    const billingPatch = {};
    Object.entries(patch).forEach(([k, v]) => {
        if (STATION_FIELDS[k]) stationPatch[STATION_FIELDS[k]] = v;
        else if (BILLING_FIELDS[k]) billingPatch[BILLING_FIELDS[k]] = v;
    });
    return { stationPatch, billingPatch };
}

const rowToClientAccount = (row) => ({
    id: row.id,
    name: row.full_name || '',
    email: row.email || '',
    phone: row.phone || '',
    vehicles: row.vehicles || [],
    favoriteStationIds: row.favorite_station_ids || [],
    createdAt: row.created_at,
});

// Abonnements Super User — jamais mélangés avec station_billing/PLANS (revenus
// stations, voir Billing.jsx) : un flux financier séparé qui revient au Super
// Admin, pas aux stations (voir supabase/schema.sql, super_user_subscriptions).
const rowToSuperUserSub = (row) => ({
    id: row.id,
    clientId: row.client_id,
    clientName: row.profiles?.full_name || '',
    clientEmail: row.profiles?.email || '',
    clientPhone: row.profiles?.phone || '',
    status: row.status,
    amount: row.amount,
    method: row.method,
    reference: row.reference,
    startedAt: row.started_at,
    expiresAt: row.expires_at,
    confirmedAt: row.confirmed_at,
    createdAt: row.created_at,
});

// Publicités payantes — jamais mélangées avec super_user_subscriptions/PLANS
// (flux financier distinct, voir supabase/schema.sql, station_ads). Exposée
// ici (pas seulement dans useAppState) car ce provider tourne sur toute
// l'app : les pages automobiliste en ont besoin pour lire les pubs ACTIVE de
// toutes les stations (RLS ne leur laisse voir que celles-là, voir schema.sql).
const rowToAd = (row) => ({
    id: row.id,
    stationId: row.station_id,
    stationName: row.stations?.name || '',
    message: row.message,
    imageUrl: row.image_url,
    status: row.status,
    amount: row.amount,
    method: row.method,
    reference: row.reference,
    startsAt: row.starts_at,
    expiresAt: row.expires_at,
    confirmedAt: row.confirmed_at,
    createdAt: row.created_at,
});

const SuperAdminStateContext = createContext(null);

export function SuperAdminStateProvider({ children }) {
    const [stations, setStations] = useState([]);
    const [disputes, setDisputes] = useState([]);
    const [auditLog, setAuditLog] = useState([]);
    const [plans, setPlans] = useState(DEFAULT_PLANS);
    const [clientAccounts, setClientAccounts] = useState([]);
    const [superUserSubscriptions, setSuperUserSubscriptions] = useState([]);
    const [stationAds, setStationAds] = useState([]);

    const loadDisputes = useCallback(async () => {
        const { data } = await supabase.from('disputes').select('*').order('created_at', { ascending: false });
        setDisputes((data || []).map(rowToDispute));
    }, []);

    const loadAuditLog = useCallback(async () => {
        const { data } = await supabase.from('audit_log').select('*').order('created_at', { ascending: false });
        setAuditLog((data || []).map((row) => ({ id: row.id, actor: row.actor, action: row.action, timestamp: row.created_at })));
    }, []);

    const loadPlans = useCallback(async () => {
        const { data } = await supabase.from('plans').select('*');
        const obj = {};
        (data || []).forEach((row) => { obj[row.key] = { label: row.label, price: row.price }; });
        setPlans(Object.keys(obj).length > 0 ? obj : DEFAULT_PLANS);
    }, []);

    const loadStations = useCallback(async () => {
        const { data } = await supabase.from('stations').select('*, station_billing(*)').order('created_at', { ascending: false });
        const mapped = (data || []).map(rowToStation);
        setStations(mapped);
        setStationsCache(mapped);
    }, []);

    const loadClientAccounts = useCallback(async () => {
        const { data } = await supabase.from('profiles').select('*, vehicles(*)').eq('role', 'automobiliste').order('created_at', { ascending: false });
        setClientAccounts((data || []).map(rowToClientAccount));
    }, []);

    const loadSuperUserSubscriptions = useCallback(async () => {
        const { data } = await supabase.from('super_user_subscriptions').select('*, profiles(full_name, email, phone)').order('created_at', { ascending: false });
        setSuperUserSubscriptions((data || []).map(rowToSuperUserSub));
    }, []);

    // Pour un rôle Super Admin : toutes les pubs, tous statuts (confirmation).
    // Pour un rôle automobiliste : seulement les ACTIVE non expirées, toutes
    // stations confondues — RLS filtre déjà côté serveur (voir schema.sql),
    // ce `select('*')` renvoie donc naturellement le bon sous-ensemble selon
    // qui est connecté, sans logique conditionnelle ici.
    const loadStationAds = useCallback(async () => {
        const { data } = await supabase.from('station_ads').select('*, stations(name)').order('created_at', { ascending: false });
        setStationAds((data || []).map(rowToAd));
    }, []);

    // Grille tarifaire de TOUTES les stations (lecture publique) — alimente le
    // cache lu par stationData.js (comparaison de prix/durée côté client, pour
    // n'importe quelle station, pas seulement "ma" station admin).
    const loadWashPricing = useCallback(async () => {
        const { data } = await supabase.from('wash_pricing').select('*');
        setWashPricingCache(data || []);
    }, []);

    // File d'attente anonymisée (aucun nom de client) + compteurs publics de
    // TOUTES les stations — fonctions SQL dédiées (SECURITY DEFINER) car RLS
    // interdit normalement à un client de lire les réservations des autres
    // (voir supabase/schema.sql). Sert à afficher "3 en attente" et estimer un
    // temps d'attente pour n'importe quelle station, sans exposer qui attend.
    const loadQueueSnapshot = useCallback(async () => {
        const [{ data: snapshot }, { data: stats }] = await Promise.all([
            supabase.rpc('all_stations_queue_snapshot'),
            supabase.rpc('station_public_stats'),
        ]);
        setQueueSnapshotCache(snapshot || []);
        setPublicStatsCache(stats || []);
    }, []);

    const loadReviews = useCallback(async () => {
        const { data } = await supabase.from('station_reviews').select('*');
        setReviewsCache(data || []);
    }, []);

    // Référentiel partagé de marques de véhicule custom (voir src/lib/vehicleBrands.js)
    // — alimenté ici car ce provider tourne sur TOUTE l'app, y compris les pages
    // automobiliste qui n'ont pas d'autre raison de monter SuperAdminStateProvider.
    const loadVehicleBrands = useCallback(async () => {
        const { data } = await supabase.from('custom_vehicle_brands').select('*');
        setCustomBrandsCache(data || []);
    }, []);

    useEffect(() => {
        loadStations();
        loadClientAccounts();
        loadWashPricing();
        loadQueueSnapshot();
        loadReviews();
        loadDisputes();
        loadAuditLog();
        loadPlans();
        loadVehicleBrands();
        loadSuperUserSubscriptions();
        loadStationAds();
        const refresh = () => { loadStations(); loadClientAccounts(); loadWashPricing(); loadQueueSnapshot(); loadReviews(); loadDisputes(); loadAuditLog(); loadPlans(); loadVehicleBrands(); loadSuperUserSubscriptions(); loadStationAds(); };
        window.addEventListener('focus', refresh);
        const interval = setInterval(refresh, 8000);
        return () => {
            window.removeEventListener('focus', refresh);
            clearInterval(interval);
        };
    }, [loadStations, loadClientAccounts, loadWashPricing, loadQueueSnapshot, loadReviews, loadDisputes, loadAuditLog, loadPlans, loadVehicleBrands, loadSuperUserSubscriptions, loadStationAds]);

    // Écrit tout de suite en local (retour instantané dans le Journal d'audit)
    // et persiste en tâche de fond — appelée en fire-and-forget après quasi
    // chaque action Super Admin, un aller-retour synchrone serait trop lent.
    const logAction = (action) => {
        const entry = { id: (typeof crypto !== 'undefined' && crypto.randomUUID) ? crypto.randomUUID() : `${Date.now()}`, actor: 'Super Admin', action, timestamp: new Date().toISOString() };
        setAuditLog((prev) => [entry, ...prev]);
        supabase.from('audit_log').insert({ actor: 'Super Admin', action }).then(() => {});
    };

    // Ajout manuel d'une station par le Super Admin (pas de compte de connexion —
    // la vraie inscription passe par login.html/createStationAccount). Sert à
    // pré-lister des stations onboardées hors-ligne.
    const addStation = async (data) => {
        const { data: row, error } = await supabase.from('stations').insert({
            name: data.name, owner_name: data.ownerName || '', owner_email: data.ownerEmail || '', owner_phone: data.ownerPhone || '',
            address: data.address || '', city: data.city || '',
        }).select('*, station_billing(*)').single();
        if (error) { console.error(error); return null; }
        if (data.clientsCount) {
            await supabase.from('station_billing').update({ clients_count: data.clientsCount }).eq('station_id', row.id);
        }
        const newStation = rowToStation(row);
        newStation.clientsCount = data.clientsCount || 0;
        setStations((prev) => [newStation, ...prev]);
        logAction(`Nouvelle station ajoutée au registre : ${newStation.name}`);
        return newStation;
    };

    const updateStation = async (id, patch) => {
        const station = stations.find((s) => s.id === id);
        const { stationPatch, billingPatch } = splitStationPatch(patch);
        if (Object.keys(stationPatch).length) await supabase.from('stations').update(stationPatch).eq('id', id);
        if (Object.keys(billingPatch).length) await supabase.from('station_billing').update(billingPatch).eq('station_id', id);
        setStations((prev) => prev.map((s) => (s.id === id ? { ...s, ...patch } : s)));
        if (station) logAction(`Fiche modifiée : ${station.name}`);
    };

    const setStationStatus = async (id, status) => {
        const station = stations.find((s) => s.id === id);
        await supabase.from('stations').update({ status }).eq('id', id);
        setStations((prev) => prev.map((s) => (s.id === id ? { ...s, status } : s)));
        const labels = { active: 'validée / activée', suspendue: 'suspendue', en_attente: 'remise en attente' };
        if (station) logAction(`Station ${labels[status] || status} : ${station.name}`);
    };

    const deleteStation = async (id) => {
        const station = stations.find((s) => s.id === id);
        await supabase.from('stations').delete().eq('id', id);
        setStations((prev) => prev.filter((s) => s.id !== id));
        if (station) logAction(`Station supprimée du registre : ${station.name}`);
    };

    const setStationPlan = async (id, plan) => {
        const station = stations.find((s) => s.id === id);
        await supabase.from('station_billing').update({ plan }).eq('station_id', id);
        setStations((prev) => prev.map((s) => (s.id === id ? { ...s, plan } : s)));
        if (station) logAction(`Plan changé pour ${station.name} → ${plan}`);
    };

    const markSubscriptionPaid = async (id) => {
        const station = stations.find((s) => s.id === id);
        const nextDate = new Date();
        nextDate.setDate(nextDate.getDate() + 30);
        await supabase.from('station_billing').update({ subscription_status: 'a_jour', next_billing_date: nextDate.toISOString() }).eq('station_id', id);
        setStations((prev) => prev.map((s) => (s.id === id ? { ...s, subscriptionStatus: 'a_jour', nextBillingDate: nextDate.toISOString() } : s)));
        if (station) logAction(`Paiement d'abonnement enregistré : ${station.name}`);
    };

    const markSubscriptionOverdue = async (id) => {
        const station = stations.find((s) => s.id === id);
        await supabase.from('station_billing').update({ subscription_status: 'en_retard' }).eq('station_id', id);
        setStations((prev) => prev.map((s) => (s.id === id ? { ...s, subscriptionStatus: 'en_retard' } : s)));
        if (station) logAction(`Abonnement marqué impayé : ${station.name}`);
    };

    // Confirme un paiement Super User (ligne PENDING -> ACTIVE) une fois
    // l'argent réellement reçu (Wave/OM) — jamais déclenché automatiquement au
    // clic "Payer" côté client, voir src/lib/superUser.js. Abonnement d'1 mois
    // calendaire à partir de maintenant (18/08 -> 18/09), même logique que
    // l'exemple du brief produit.
    const confirmSuperUserPayment = async (id) => {
        const sub = superUserSubscriptions.find((s) => s.id === id);
        const startedAt = new Date();
        const expiresAt = new Date(startedAt);
        expiresAt.setMonth(expiresAt.getMonth() + 1);
        const patch = { status: 'ACTIVE', started_at: startedAt.toISOString(), expires_at: expiresAt.toISOString(), confirmed_at: startedAt.toISOString() };
        await supabase.from('super_user_subscriptions').update(patch).eq('id', id);
        setSuperUserSubscriptions((prev) => prev.map((s) => (s.id === id ? { ...s, status: 'ACTIVE', startedAt: patch.started_at, expiresAt: patch.expires_at, confirmedAt: patch.confirmed_at } : s)));
        if (sub) logAction(`Abonnement Super User confirmé : ${sub.clientName || sub.clientEmail}`);
    };

    const rejectSuperUserPayment = async (id) => {
        const sub = superUserSubscriptions.find((s) => s.id === id);
        await supabase.from('super_user_subscriptions').update({ status: 'FAILED' }).eq('id', id);
        setSuperUserSubscriptions((prev) => prev.map((s) => (s.id === id ? { ...s, status: 'FAILED' } : s)));
        if (sub) logAction(`Paiement Super User rejeté : ${sub.clientName || sub.clientEmail}`);
    };

    // Confirme le paiement d'une pub (PENDING -> ACTIVE) une fois l'argent
    // reçu — jamais automatique (voir src/lib/ads.js). Diffusion de
    // AD_CAMPAIGN_DAYS jours à partir de maintenant.
    const confirmAdPayment = async (id) => {
        const ad = stationAds.find((a) => a.id === id);
        const startedAt = new Date();
        const expiresAt = new Date(startedAt);
        expiresAt.setDate(expiresAt.getDate() + AD_CAMPAIGN_DAYS);
        const patch = { status: 'ACTIVE', started_at: startedAt.toISOString(), expires_at: expiresAt.toISOString(), confirmed_at: startedAt.toISOString() };
        await supabase.from('station_ads').update({ status: 'ACTIVE', starts_at: patch.started_at, expires_at: patch.expires_at, confirmed_at: patch.confirmed_at }).eq('id', id);
        setStationAds((prev) => prev.map((a) => (a.id === id ? { ...a, status: 'ACTIVE', startsAt: patch.started_at, expiresAt: patch.expires_at, confirmedAt: patch.confirmed_at } : a)));
        if (ad) logAction(`Publicité confirmée : ${ad.stationName}`);
    };

    const rejectAdPayment = async (id) => {
        const ad = stationAds.find((a) => a.id === id);
        await supabase.from('station_ads').update({ status: 'REJECTED' }).eq('id', id);
        setStationAds((prev) => prev.map((a) => (a.id === id ? { ...a, status: 'REJECTED' } : a)));
        if (ad) logAction(`Publicité rejetée : ${ad.stationName}`);
    };

    const sendBillingReminder = (id) => {
        const station = stations.find((s) => s.id === id);
        if (station) logAction(`Relance de facturation envoyée à : ${station.name}`);
    };

    const addDispute = async (data) => {
        const { data: row, error } = await supabase.from('disputes').insert({
            station_id: data.stationId || null, station_name: data.stationName, subject: data.subject,
            description: data.description || null, amount: data.amount || 0, status: 'ouvert',
        }).select().single();
        if (error) { console.error(error); return null; }
        const newDispute = rowToDispute(row);
        setDisputes((prev) => [newDispute, ...prev]);
        logAction(`Litige ouvert : ${newDispute.subject} (${newDispute.stationName})`);
        return newDispute;
    };

    const resolveDispute = async (id) => {
        const dispute = disputes.find(d => d.id === id);
        const resolvedAt = new Date().toISOString();
        await supabase.from('disputes').update({ status: 'resolu', resolved_at: resolvedAt }).eq('id', id);
        setDisputes((prev) => prev.map(d => d.id === id ? { ...d, status: 'resolu', resolvedAt } : d));
        if (dispute) logAction(`Litige résolu : ${dispute.subject} (${dispute.stationName})`);
    };

    const refundDispute = async (id) => {
        const dispute = disputes.find(d => d.id === id);
        const resolvedAt = new Date().toISOString();
        await supabase.from('disputes').update({ status: 'rembourse', resolved_at: resolvedAt }).eq('id', id);
        setDisputes((prev) => prev.map(d => d.id === id ? { ...d, status: 'rembourse', resolvedAt } : d));
        if (dispute) logAction(`Remboursement effectué : ${dispute.subject} (${dispute.stationName})`);
    };

    const impersonateStation = (station) => {
        // Bascule réellement useAppState sur les données isolées de cette station
        // (sessionStorage prend le pas sur la session "propriétaire" en localStorage).
        sessionStorage.setItem('currentStationId', String(station.id));
        sessionStorage.setItem('impersonatingStation', station.name);
        window.dispatchEvent(new Event('station-session-changed'));
        logAction(`Connexion en tant que la station : ${station.name}`);
    };

    const updatePlan = async (key, patch) => {
        const current = plans[key] || { label: key, price: 0 };
        const next = { ...current, ...patch };
        await supabase.from('plans').upsert({ key, label: next.label, price: next.price }, { onConflict: 'key' });
        setPlans((prev) => ({ ...prev, [key]: next }));
        logAction(`Plan "${current.label || key}" mis à jour (${patch.price != null ? patch.price.toLocaleString('fr-FR') + ' FCFA' : 'modifié'})`);
    };

    const resetPlans = async () => {
        await supabase.from('plans').upsert(Object.entries(DEFAULT_PLANS).map(([key, v]) => ({ key, label: v.label, price: v.price })), { onConflict: 'key' });
        setPlans(DEFAULT_PLANS);
        logAction('Plans réinitialisés aux valeurs par défaut');
    };

    return (
        <SuperAdminStateContext.Provider value={{
            stations, disputes, auditLog, clientAccounts, PLANS: plans,
            addStation, updateStation, setStationStatus, deleteStation, setStationPlan,
            markSubscriptionPaid, markSubscriptionOverdue, sendBillingReminder,
            addDispute, resolveDispute, refundDispute, impersonateStation, logAction,
            updatePlan, resetPlans,
            superUserSubscriptions, confirmSuperUserPayment, rejectSuperUserPayment,
            stationAds, confirmAdPayment, rejectAdPayment,
        }}>
            {children}
        </SuperAdminStateContext.Provider>
    );
}

export function useSuperAdminState() {
    const context = useContext(SuperAdminStateContext);
    if (!context) {
        throw new Error("useSuperAdminState must be used within a SuperAdminStateProvider");
    }
    return context;
}
