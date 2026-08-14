import React, { createContext, useContext, useState, useEffect } from 'react';
import { getClientAccounts } from '../lib/accounts';

// Aucune station/litige de démo — le Super Admin part d'un registre vide
// et l'alimente réellement (onboarding manuel en attendant l'auto-inscription + backend).
const defaultStations = [];
const defaultDisputes = [];
const defaultAuditLog = [];

// Plans par défaut — modifiables depuis Super Admin > Paramètres (persistés dans localStorage).
export const DEFAULT_PLANS = {
    Starter: { label: 'Starter', price: 15000 },
    Pro: { label: 'Pro', price: 35000 },
    Business: { label: 'Business', price: 75000 },
};

const SuperAdminStateContext = createContext(null);

export function SuperAdminStateProvider({ children }) {
    const [stations, setStations] = useState(() => JSON.parse(localStorage.getItem('saasStations')) || defaultStations);
    const [disputes, setDisputes] = useState(() => JSON.parse(localStorage.getItem('saasDisputes')) || defaultDisputes);
    const [auditLog, setAuditLog] = useState(() => JSON.parse(localStorage.getItem('saasAuditLog')) || defaultAuditLog);
    const [plans, setPlans] = useState(() => {
        const saved = JSON.parse(localStorage.getItem('saasPlans'));
        return saved && Object.keys(saved).length > 0 ? saved : DEFAULT_PLANS;
    });
    // Comptes automobilistes — registre partagé (créé côté login/inscription client).
    // Lu ici en lecture seule pour alimenter les analytiques Super Admin.
    const [clientAccounts, setClientAccounts] = useState(() => getClientAccounts());

    useEffect(() => {
        const refresh = () => setClientAccounts(getClientAccounts());
        window.addEventListener('storage', refresh);
        window.addEventListener('focus', refresh);
        const interval = setInterval(refresh, 15000);
        return () => {
            window.removeEventListener('storage', refresh);
            window.removeEventListener('focus', refresh);
            clearInterval(interval);
        };
    }, []);

    const updateStations = (next) => { setStations(next); localStorage.setItem('saasStations', JSON.stringify(next)); };
    const updateDisputes = (next) => { setDisputes(next); localStorage.setItem('saasDisputes', JSON.stringify(next)); };
    const updateAuditLog = (next) => { setAuditLog(next); localStorage.setItem('saasAuditLog', JSON.stringify(next)); };
    const updatePlans = (next) => { setPlans(next); localStorage.setItem('saasPlans', JSON.stringify(next)); };

    const logAction = (action, currentLog = auditLog) => {
        const entry = { id: Date.now(), timestamp: new Date().toISOString(), actor: 'Super Admin', action };
        const next = [entry, ...currentLog];
        updateAuditLog(next);
        return next;
    };

    const addStation = (data) => {
        const id = stations.length > 0 ? Math.max(...stations.map(s => s.id)) + 1 : 1;
        const newStation = {
            id,
            status: 'en_attente',
            plan: 'Starter',
            subscriptionStatus: 'essai',
            nextBillingDate: null,
            clientsCount: 0,
            joinedAt: new Date().toISOString(),
            notes: '',
            ...data,
        };
        updateStations([newStation, ...stations]);
        logAction(`Nouvelle station ajoutée au registre : ${newStation.name}`);
        return newStation;
    };

    const updateStation = (id, patch) => {
        const station = stations.find(s => s.id === id);
        updateStations(stations.map(s => s.id === id ? { ...s, ...patch } : s));
        if (station) logAction(`Fiche modifiée : ${station.name}`);
    };

    const setStationStatus = (id, status) => {
        const station = stations.find(s => s.id === id);
        updateStations(stations.map(s => s.id === id ? { ...s, status } : s));
        const labels = { active: 'validée / activée', suspendue: 'suspendue', en_attente: 'remise en attente' };
        if (station) logAction(`Station ${labels[status] || status} : ${station.name}`);
    };

    const deleteStation = (id) => {
        const station = stations.find(s => s.id === id);
        updateStations(stations.filter(s => s.id !== id));
        if (station) logAction(`Station supprimée du registre : ${station.name}`);
    };

    const setStationPlan = (id, plan) => {
        const station = stations.find(s => s.id === id);
        updateStations(stations.map(s => s.id === id ? { ...s, plan } : s));
        if (station) logAction(`Plan changé pour ${station.name} → ${plan}`);
    };

    const markSubscriptionPaid = (id) => {
        const station = stations.find(s => s.id === id);
        const nextDate = new Date();
        nextDate.setDate(nextDate.getDate() + 30);
        updateStations(stations.map(s => s.id === id ? { ...s, subscriptionStatus: 'a_jour', nextBillingDate: nextDate.toISOString() } : s));
        if (station) logAction(`Paiement d'abonnement enregistré : ${station.name}`);
    };

    const markSubscriptionOverdue = (id) => {
        const station = stations.find(s => s.id === id);
        updateStations(stations.map(s => s.id === id ? { ...s, subscriptionStatus: 'en_retard' } : s));
        if (station) logAction(`Abonnement marqué impayé : ${station.name}`);
    };

    const sendBillingReminder = (id) => {
        const station = stations.find(s => s.id === id);
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
