import React, { createContext, useContext, useState } from 'react';
import { getClientAccounts, saveClientAccounts, getCurrentClientId } from '../lib/accounts';

const ClientAccountContext = createContext(null);

export function ClientAccountProvider({ children }) {
    const [accounts, setAccounts] = useState(() => getClientAccounts());
    const clientId = getCurrentClientId();
    const account = accounts.find((a) => a.id === clientId) || null;

    const persist = (next) => { setAccounts(next); saveClientAccounts(next); };

    const updateProfile = (patch) => {
        if (!account) return;
        persist(accounts.map((a) => (a.id === account.id ? { ...a, ...patch } : a)));
    };

    const addVehicle = (vehicle) => {
        if (!account) return null;
        const vehicles = account.vehicles || [];
        const id = vehicles.length > 0 ? Math.max(...vehicles.map((v) => v.id)) + 1 : 1;
        const newVehicle = { id, ...vehicle };
        updateProfile({ vehicles: [...vehicles, newVehicle] });
        return newVehicle;
    };

    const removeVehicle = (vehicleId) => {
        if (!account) return;
        updateProfile({ vehicles: (account.vehicles || []).filter((v) => v.id !== vehicleId) });
    };

    const toggleFavorite = (stationId) => {
        if (!account) return;
        const favorites = account.favoriteStationIds || [];
        const next = favorites.includes(stationId)
            ? favorites.filter((id) => id !== stationId)
            : [...favorites, stationId];
        updateProfile({ favoriteStationIds: next });
    };

    // Retire une station de "Mes Stations" (l'automobiliste ne veut plus la voir dans
    // sa liste) — n'efface aucune donnée de réservation, juste une préférence d'affichage.
    // Une nouvelle réservation dans cette station la fait naturellement réapparaître.
    const hideStation = (stationId) => {
        if (!account) return;
        const hidden = account.hiddenStationIds || [];
        if (hidden.includes(stationId)) return;
        updateProfile({ hiddenStationIds: [...hidden, stationId] });
    };

    const unhideStation = (stationId) => {
        if (!account) return;
        const hidden = account.hiddenStationIds || [];
        if (!hidden.includes(stationId)) return;
        updateProfile({ hiddenStationIds: hidden.filter((id) => id !== stationId) });
    };

    return (
        <ClientAccountContext.Provider value={{ account, updateProfile, addVehicle, removeVehicle, toggleFavorite, hideStation, unhideStation }}>
            {children}
        </ClientAccountContext.Provider>
    );
}

export function useClientAccount() {
    const context = useContext(ClientAccountContext);
    if (!context) {
        throw new Error('useClientAccount must be used within a ClientAccountProvider');
    }
    return context;
}
