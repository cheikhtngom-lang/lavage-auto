import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { supabase } from '../lib/supabaseClient';

const ClientAccountContext = createContext(null);

export function ClientAccountProvider({ children }) {
    const [account, setAccount] = useState(null);
    const [loading, setLoading] = useState(true);

    const load = useCallback(async () => {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) { setAccount(null); setLoading(false); return; }

        const [{ data: profile }, { data: vehicles }] = await Promise.all([
            supabase.from('profiles').select('*').eq('id', user.id).single(),
            supabase.from('vehicles').select('*').eq('owner_id', user.id).order('created_at'),
        ]);
        if (!profile || profile.role !== 'automobiliste') { setAccount(null); setLoading(false); return; }

        setAccount({
            id: profile.id,
            name: profile.full_name,
            email: user.email,
            phone: profile.phone || '',
            vehicles: (vehicles || []).map((v) => ({ id: v.id, category: v.category, brand: v.brand, plate: v.plate })),
            favoriteStationIds: profile.favorite_station_ids || [],
            hiddenStationIds: profile.hidden_station_ids || [],
        });
        setLoading(false);
    }, []);

    useEffect(() => { load(); }, [load]);

    const updateProfile = async (patch) => {
        if (!account) return;
        const dbPatch = {};
        if (patch.name !== undefined) dbPatch.full_name = patch.name;
        if (patch.phone !== undefined) dbPatch.phone = patch.phone;
        if (patch.favoriteStationIds !== undefined) dbPatch.favorite_station_ids = patch.favoriteStationIds;
        if (patch.hiddenStationIds !== undefined) dbPatch.hidden_station_ids = patch.hiddenStationIds;
        if (Object.keys(dbPatch).length > 0) {
            await supabase.from('profiles').update(dbPatch).eq('id', account.id);
        }
        setAccount((a) => ({ ...a, ...patch }));
    };

    const addVehicle = async (vehicle) => {
        if (!account) return null;
        const { data, error } = await supabase.from('vehicles').insert({
            owner_id: account.id, category: vehicle.category, brand: vehicle.brand, plate: vehicle.plate || null,
        }).select().single();
        if (error) return null;
        const newVehicle = { id: data.id, category: data.category, brand: data.brand, plate: data.plate };
        setAccount((a) => ({ ...a, vehicles: [...a.vehicles, newVehicle] }));
        return newVehicle;
    };

    const removeVehicle = async (vehicleId) => {
        if (!account) return;
        await supabase.from('vehicles').delete().eq('id', vehicleId);
        setAccount((a) => ({ ...a, vehicles: a.vehicles.filter((v) => v.id !== vehicleId) }));
    };

    const toggleFavorite = (stationId) => {
        if (!account) return;
        const favorites = account.favoriteStationIds || [];
        const next = favorites.includes(stationId)
            ? favorites.filter((id) => id !== stationId)
            : [...favorites, stationId];
        updateProfile({ favoriteStationIds: next });
    };

    // Retire une station de "Mes Stations" sans effacer l'historique de réservation —
    // une nouvelle réservation dans cette station la fait naturellement réapparaître.
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
        <ClientAccountContext.Provider value={{ account, loading, updateProfile, addVehicle, removeVehicle, toggleFavorite, hideStation, unhideStation }}>
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
