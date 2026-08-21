import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { supabase } from '../lib/supabaseClient';
import { getLatestSubscription, deriveSuperUserStatus } from '../lib/superUser';

const ClientAccountContext = createContext(null);

export function ClientAccountProvider({ children }) {
    const [account, setAccount] = useState(null);
    const [loading, setLoading] = useState(true);
    // Réservations actives (file/en cours) et transactions du client connecté —
    // RLS les rend directement lisibles (client_id = auth.uid()), contrairement
    // aux données des AUTRES clients (voir lib/stationData.js pour ça).
    const [reservations, setReservations] = useState([]);
    const [myTransactions, setMyTransactions] = useState([]);
    const [myStationSubscriptions, setMyStationSubscriptions] = useState([]);
    const [superUserSub, setSuperUserSub] = useState(null);

    const load = useCallback(async () => {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) { setAccount(null); setReservations([]); setMyTransactions([]); setLoading(false); return; }

        const [{ data: profile }, { data: vehicles }] = await Promise.all([
            supabase.from('profiles').select('*').eq('id', user.id).single(),
            supabase.from('vehicles').select('*').eq('owner_id', user.id).order('created_at'),
        ]);
        if (!profile || profile.role !== 'automobiliste') { setAccount(null); setReservations([]); setMyTransactions([]); setLoading(false); return; }

        setAccount({
            id: profile.id,
            name: profile.full_name,
            email: user.email,
            phone: profile.phone || '',
            vehicles: (vehicles || []).map((v) => ({ id: v.id, category: v.category, brand: v.brand, plate: v.plate })),
            favoriteStationIds: profile.favorite_station_ids || [],
            hiddenStationIds: profile.hidden_station_ids || [],
            dismissedAdIds: profile.dismissed_ad_ids || [],
            photoUrl: profile.photo_url || null,
        });
        setLoading(false);
    }, []);

    const loadActivity = useCallback(async (clientId, clientPhone) => {
        if (!clientId) { setReservations([]); setMyTransactions([]); setMyStationSubscriptions([]); return; }
        const [{ data: resData }, { data: txData }, { data: subData }] = await Promise.all([
            supabase.from('reservations').select('*, stations(name, quartier, region)').eq('client_id', clientId).in('status', ['attente', 'en_cours']).order('created_at'),
            supabase.from('transactions').select('*, stations(name)').eq('client_id', clientId).order('created_at', { ascending: false }),
            supabase.from('station_client_subscriptions').select('*, stations(name)').or(`client_id.eq.${clientId}${clientPhone ? `,client_phone.eq.${clientPhone}` : ''}`).eq('status', 'actif'),
        ]);
        setReservations(resData || []);
        setMyTransactions(txData || []);
        setMyStationSubscriptions(subData || []);
    }, []);

    useEffect(() => { load(); }, [load]);

    const loadSuperUserSub = useCallback(async (clientId) => {
        if (!clientId) { setSuperUserSub(null); return; }
        setSuperUserSub(await getLatestSubscription(clientId));
    }, []);

    useEffect(() => {
        if (!account?.id) return;
        loadActivity(account.id, account.phone);
        loadSuperUserSub(account.id);
        const refresh = () => { loadActivity(account.id, account.phone); loadSuperUserSub(account.id); };
        window.addEventListener('focus', refresh);
        // `reservations`/`transactions` sont dans la publication supabase_realtime
        // (voir schema.sql) : la position en file/le passage en lavage arrivent en
        // direct dès qu'une station modifie SA réservation, sans sonder toutes les
        // 8s. `super_user_subscriptions` n'y est pas (pas indispensable, un
        // paiement confirmé par le Super Admin est un événement rare) — elle
        // profite quand même du même refresh sur focus/interval ci-dessus.
        // Le setInterval restant sert de filet de sécurité (reconnexion ratée).
        const channel = supabase
            .channel(`client-live-${account.id}`)
            .on('postgres_changes', { event: '*', schema: 'public', table: 'reservations', filter: `client_id=eq.${account.id}` }, refresh)
            .on('postgres_changes', { event: '*', schema: 'public', table: 'transactions', filter: `client_id=eq.${account.id}` }, refresh)
            .subscribe();
        const interval = setInterval(refresh, 45000);
        return () => { clearInterval(interval); window.removeEventListener('focus', refresh); supabase.removeChannel(channel); };
    }, [account?.id, account?.phone, loadActivity, loadSuperUserSub]);

    const refreshActivity = useCallback(() => { if (account?.id) loadActivity(account.id, account.phone); }, [account?.id, account?.phone, loadActivity]);
    const refreshSuperUser = useCallback(() => { if (account?.id) loadSuperUserSub(account.id); }, [account?.id, loadSuperUserSub]);
    const superUserStatus = deriveSuperUserStatus(superUserSub);

    const updateProfile = async (patch) => {
        if (!account) return;
        const dbPatch = {};
        if (patch.name !== undefined) dbPatch.full_name = patch.name;
        if (patch.phone !== undefined) dbPatch.phone = patch.phone;
        if (patch.favoriteStationIds !== undefined) dbPatch.favorite_station_ids = patch.favoriteStationIds;
        if (patch.hiddenStationIds !== undefined) dbPatch.hidden_station_ids = patch.hiddenStationIds;
        if (patch.dismissedAdIds !== undefined) dbPatch.dismissed_ad_ids = patch.dismissedAdIds;
        if (patch.photoUrl !== undefined) dbPatch.photo_url = patch.photoUrl;
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

    // Une pub ignorée ne réapparaît plus pour CE client (persistant, pas juste
    // localStorage — voir profiles.dismissed_ad_ids) mais reste visible pour
    // les autres automobilistes de la plateforme (voir Dashboard.jsx).
    const dismissAd = (adId) => {
        if (!account) return;
        const dismissed = account.dismissedAdIds || [];
        if (dismissed.includes(adId)) return;
        updateProfile({ dismissedAdIds: [...dismissed, adId] });
    };

    return (
        <ClientAccountContext.Provider value={{
            account, loading, updateProfile, addVehicle, removeVehicle, toggleFavorite, hideStation, unhideStation, dismissAd,
            reservations, myTransactions, myStationSubscriptions, refreshActivity,
            superUserSub, superUserStatus, refreshSuperUser,
        }}>
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
