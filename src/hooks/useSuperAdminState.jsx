import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { supabase } from '../lib/supabaseClient';

// Aucun litige/audit de démo — le Super Admin part d'un registre vide.
// Litiges/audit/plans restent sur localStorage pour l'instant (pas encore
// migrés vers Supabase — voir [[backend_migration]] : module par module).
const defaultDisputes = [];
const defaultAuditLog = [];

// Plans par défaut — modifiables depuis Super Admin > Paramètres (persistés dans localStorage).
export const DEFAULT_PLANS = {
    Starter: { label: 'Starter', price: 15000 },
    Pro: { label: 'Pro', price: 35000 },
    Business: { label: 'Business', price: 75000 },
};

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

const SuperAdminStateContext = createContext(null);

export function SuperAdminStateProvider({ children }) {
    const [stations, setStations] = useState([]);
    const [disputes, setDisputes] = useState(() => JSON.parse(localStorage.getItem('saasDisputes')) || defaultDisputes);
    const [auditLog, setAuditLog] = useState(() => JSON.parse(localStorage.getItem('saasAuditLog')) || defaultAuditLog);
    const [plans, setPlans] = useState(() => {
        const saved = JSON.parse(localStorage.getItem('saasPlans'));
        return saved && Object.keys(saved).length > 0 ? saved : DEFAULT_PLANS;
    });
    const [clientAccounts, setClientAccounts] = useState([]);

    const loadStations = useCallback(async () => {
        const { data } = await supabase.from('stations').select('*, station_billing(*)').order('created_at', { ascending: false });
        setStations((data || []).map(rowToStation));
    }, []);

    const loadClientAccounts = useCallback(async () => {
        const { data } = await supabase.from('profiles').select('*, vehicles(*)').eq('role', 'automobiliste').order('created_at', { ascending: false });
        setClientAccounts((data || []).map(rowToClientAccount));
    }, []);

    useEffect(() => {
        loadStations();
        loadClientAccounts();
        const refresh = () => { loadStations(); loadClientAccounts(); };
        window.addEventListener('focus', refresh);
        const interval = setInterval(refresh, 15000);
        return () => {
            window.removeEventListener('focus', refresh);
            clearInterval(interval);
        };
    }, [loadStations, loadClientAccounts]);

    const updateDisputes = (next) => { setDisputes(next); localStorage.setItem('saasDisputes', JSON.stringify(next)); };
    const updateAuditLog = (next) => { setAuditLog(next); localStorage.setItem('saasAuditLog', JSON.stringify(next)); };
    const updatePlans = (next) => { setPlans(next); localStorage.setItem('saasPlans', JSON.stringify(next)); };

    const logAction = (action, currentLog = auditLog) => {
        const entry = { id: Date.now(), timestamp: new Date().toISOString(), actor: 'Super Admin', action };
        const next = [entry, ...currentLog];
        updateAuditLog(next);
        return next;
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

    const sendBillingReminder = (id) => {
        const station = stations.find((s) => s.id === id);
        if (station) logAction(`Relance de facturation envoyée à : ${station.name}`);
    };

    const addDispute = (data) => {
        const id = disputes.length > 0 ? Math.max(...disputes.map(d => d.id)) + 1 : 1;
        const newDispute = { id, status: 'ouvert', createdAt: new Date().toISOString(), resolvedAt: null, ...data };
        updateDisputes([newDispute, ...disputes]);
        logAction(`Litige ouvert : ${newDispute.subject} (${newDispute.stationName})`);
        return newDispute;
    };

    const resolveDispute = (id) => {
        const dispute = disputes.find(d => d.id === id);
        updateDisputes(disputes.map(d => d.id === id ? { ...d, status: 'resolu', resolvedAt: new Date().toISOString() } : d));
        if (dispute) logAction(`Litige résolu : ${dispute.subject} (${dispute.stationName})`);
    };

    const refundDispute = (id) => {
        const dispute = disputes.find(d => d.id === id);
        updateDisputes(disputes.map(d => d.id === id ? { ...d, status: 'rembourse', resolvedAt: new Date().toISOString() } : d));
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

    const updatePlan = (key, patch) => {
        const next = { ...plans, [key]: { ...plans[key], ...patch } };
        updatePlans(next);
        logAction(`Plan "${plans[key]?.label || key}" mis à jour (${patch.price != null ? patch.price.toLocaleString('fr-FR') + ' FCFA' : 'modifié'})`);
    };

    const resetPlans = () => {
        updatePlans(DEFAULT_PLANS);
        logAction('Plans réinitialisés aux valeurs par défaut');
    };

    return (
        <SuperAdminStateContext.Provider value={{
            stations, disputes, auditLog, clientAccounts, PLANS: plans,
            addStation, updateStation, setStationStatus, deleteStation, setStationPlan,
            markSubscriptionPaid, markSubscriptionOverdue, sendBillingReminder,
            addDispute, resolveDispute, refundDispute, impersonateStation, logAction,
            updatePlan, resetPlans,
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
