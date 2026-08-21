import React, { createContext, useContext, useState, useEffect, useCallback, useRef } from 'react';
import { getCurrentStationId } from '../lib/accounts';
import { supabase } from '../lib/supabaseClient';
import { DEFAULT_PRICING, DEFAULT_DURATION } from '../lib/washDefaults';
import { DEFAULT_PROMO, applyDiscount } from '../lib/promoDefaults';

// Chaque station a ses propres données, séparées des autres (file d'attente,
// employés, transactions...). En pratique, ce provider est remonté (via `key`
// dans App.jsx) à chaque changement de station active, donc ces helpers ne
// tournent qu'une fois par session/station — pas besoin de réagir en direct.
//
// Important : chaque NOUVELLE station doit démarrer avec des données vides.
// Il n'y a volontairement aucun fallback vers d'anciennes clés partagées —
// un tel fallback ferait hériter chaque nouvelle station des données du
// dernier testeur, ce qui n'est pas acceptable pour une vraie plateforme
// multi-stations.
// Une ligne Supabase (table `employees`) -> forme utilisée par
// Washers.jsx/Team.jsx/StationDashboard.jsx (mêmes noms de champs qu'avant
// la migration localStorage, pour ne rien changer côté UI).
function rowToEmployee(row) {
    return {
        id: row.id,
        name: row.name,
        role: row.role,
        access: row.access,
        status: row.status,
        dailyStatus: row.daily_status,
        avatar: row.avatar,
        clockIn: row.clock_in,
        clockOut: row.clock_out,
        clockInAt: row.clock_in_at,
        clockOutAt: row.clock_out_at,
        totalTime: row.total_time,
        lastLogin: 'Jamais', // jamais persisté nulle part, valeur statique comme avant la migration
    };
}

// Champs de pointage partagés entre `employees` (état courant) et
// `attendance_records` (instantané par jour) — mêmes noms de colonnes dans
// les deux tables, donc un seul mapping camelCase -> snake_case pour les deux.
const ATTENDANCE_FIELD_MAP = { dailyStatus: 'daily_status', clockIn: 'clock_in', clockOut: 'clock_out', clockInAt: 'clock_in_at', clockOutAt: 'clock_out_at', totalTime: 'total_time' };
function patchToRow(patch) {
    const row = {};
    Object.entries(patch).forEach(([k, v]) => { row[ATTENDANCE_FIELD_MAP[k] || k] = v; });
    return row;
}

const defaultPricing = DEFAULT_PRICING;
const defaultDuration = DEFAULT_DURATION;

const defaultStationProfile = {
    name: "",   // Vide — l'admin doit configurer son vrai nom
    phone: "",
    address: "",
    quartier: "",
    region: "",
    openTime: "08:00",
    closeTime: "20:00",
    logo: null, // Data URL (image encodée) — voir updateStationProfile
    cachet: null, // Data URL du cachet/tampon officiel — apposé sur les reçus
    dailyRevenueTarget: 50000, // Objectif de revenus journalier affiché dans Accounting.jsx
};

// ─── Identifiants des données fictives à supprimer ───────────────────────────
// Ce sont les noms exacts utilisés dans le code de démo d'origine.
// Toute autre donnée (créée manuellement par l'admin) sera préservée.
const DEMO_EMPLOYEE_NAMES = ['Moussa Diop', 'Alioune Fall'];
const DEMO_STATION_NAME  = 'Auto Clean VIP';
const DEMO_STATION_PHONE = '+221 77 000 00 00';

// Formate l'horodatage d'une transaction comme avant ("Aujourd'hui, HH:MM"
// pour le jour courant, sinon une date complète — les anciennes transactions
// n'étaient jamais consultées passé le jour même, donc ce cas n'existait pas
// encore, mais les données Supabase persistent maintenant réellement).
function formatTxDate(iso) {
    const d = new Date(iso);
    const time = `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
    if (d.toDateString() === new Date().toDateString()) return `Aujourd'hui, ${time}`;
    return `${d.toLocaleDateString('fr-FR')}, ${time}`;
}

// reservations (Supabase) -> même forme que l'ancien item localStorage, pour
// ne rien changer côté StationDashboard.jsx/Washers.jsx/etc.
function rowToItem(row) {
    return {
        id: row.id,
        status: row.status,
        clientId: row.client_id,
        client: row.client_name,
        vehicle: row.vehicle_label,
        category: row.category,
        service: row.service,
        paid: row.paid,
        paymentMethod: row.payment_method,
        amount: row.amount,
        assignedTo: row.assigned_to_name,
        startedAt: row.started_at,
        completedAt: row.completed_at ? new Date(row.completed_at).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' }) : null,
        completedAtISO: row.completed_at,
        reservationGroupId: row.reservation_group_id,
        groupSize: row.group_size,
        createdAt: row.created_at,
    };
}

const AppStateContext = createContext(null);

export function AppStateProvider({ children }) {
    const stationId = getCurrentStationId();

    const [employees, setEmployees] = useState([]);
    const loadEmployees = useCallback(async () => {
        if (!stationId || stationId === 'default') { setEmployees([]); return; }
        const { data } = await supabase.from('employees').select('*').eq('station_id', stationId).order('created_at', { ascending: true });
        setEmployees((data || []).map(rowToEmployee));
    }, [stationId]);

    // Types de véhicule ajoutés à la volée par l'admin (dropdown "Ajouter un
    // lavage manuel" — voir VehicleDropdown dans StationDashboard.jsx), propres
    // à SA station.
    const [customVehicleTypes, setCustomVehicleTypes] = useState([]);
    const loadCustomVehicleTypes = useCallback(async () => {
        if (!stationId || stationId === 'default') { setCustomVehicleTypes([]); return; }
        const { data } = await supabase.from('custom_vehicle_types').select('value').eq('station_id', stationId).order('created_at', { ascending: true });
        setCustomVehicleTypes((data || []).map((r) => r.value));
    }, [stationId]);
    const addCustomVehicleType = (value) => {
        const clean = (value || '').trim();
        if (!clean || !stationId || stationId === 'default') return;
        if (customVehicleTypes.some((v) => v.toLowerCase() === clean.toLowerCase())) return;
        setCustomVehicleTypes((prev) => [...prev, clean]); // optimiste, pour que le dropdown l'affiche tout de suite
        supabase.from('custom_vehicle_types').upsert({ station_id: stationId, value: clean }, { onConflict: 'station_id,value' }).then(() => {});
    };

    // ─── Planning de poste (prévisionnel) — créneaux nommés + assignation par
    // (laveur, jour). Totalement indépendant du pointage réel (employees.daily_status/
    // status/clock_in, attendanceHistory plus bas) : ni lu ni écrit par ces
    // fonctions, ni l'inverse — voir Washers.jsx pour la grille semaine/mois + export Excel.
    const [shiftTemplates, setShiftTemplates] = useState([]);
    const loadShiftTemplates = useCallback(async () => {
        if (!stationId || stationId === 'default') { setShiftTemplates([]); return; }
        const { data } = await supabase.from('shift_templates').select('*').eq('station_id', stationId).order('start_time', { ascending: true });
        setShiftTemplates((data || []).map((row) => ({ id: row.id, label: row.label, startTime: row.start_time, endTime: row.end_time, color: row.color })));
    }, [stationId]);

    const addShiftTemplate = async (data) => {
        if (!stationId || stationId === 'default') return;
        await supabase.from('shift_templates').insert({ station_id: stationId, label: data.label, start_time: data.startTime, end_time: data.endTime, color: data.color || '#3b82f6' });
        await loadShiftTemplates();
    };
    const updateShiftTemplate = async (id, data) => {
        await supabase.from('shift_templates').update({ label: data.label, start_time: data.startTime, end_time: data.endTime, color: data.color }).eq('id', id);
        await loadShiftTemplates();
    };
    const deleteShiftTemplate = async (id) => {
        await supabase.from('shift_templates').delete().eq('id', id);
        await loadShiftTemplates();
    };

    // Planning par jour, chargé à la demande pour la période affichée (semaine
    // ou mois) — { "2026-08-18": { [employeeId]: shiftTemplateId } }, même
    // principe que loadAttendanceForDate mais pour shift_schedule.
    const [scheduleByDate, setScheduleByDate] = useState({});
    const loadScheduleRange = useCallback(async (startKey, endKey) => {
        if (!stationId || stationId === 'default') return;
        const { data } = await supabase.from('shift_schedule').select('*').eq('station_id', stationId).gte('work_date', startKey).lte('work_date', endKey);
        const byDate = {};
        let cursor = new Date(`${startKey}T12:00:00`);
        const end = new Date(`${endKey}T12:00:00`);
        while (cursor <= end) {
            byDate[cursor.toISOString().slice(0, 10)] = {};
            cursor = new Date(cursor.getTime() + 86400000);
        }
        (data || []).forEach((row) => { (byDate[row.work_date] ||= {})[row.employee_id] = row.shift_template_id; });
        setScheduleByDate((prev) => ({ ...prev, ...byDate }));
    }, [stationId]);

    const setShiftForDay = async (employeeId, dateKey, shiftTemplateId) => {
        if (!stationId || stationId === 'default') return;
        // Optimiste : la case reflète le choix tout de suite, avant la confirmation réseau.
        setScheduleByDate((prev) => ({ ...prev, [dateKey]: { ...(prev[dateKey] || {}), [employeeId]: shiftTemplateId || null } }));
        if (!shiftTemplateId) {
            await supabase.from('shift_schedule').delete().eq('employee_id', employeeId).eq('work_date', dateKey);
            return;
        }
        await supabase.from('shift_schedule').upsert(
            { station_id: stationId, employee_id: employeeId, work_date: dateKey, shift_template_id: shiftTemplateId },
            { onConflict: 'employee_id,work_date' }
        );
    };

    // File d'attente + lavages en cours/terminés = une seule table Supabase
    // (`reservations`, distinguée par `status`) — remplace les 3 listes
    // localStorage séparées. Rafraîchi par sondage (8s + focus) : un client
    // peut réserver depuis son propre appareil, il faut voir sa réservation
    // apparaître ici sans recharger la page (voir [[backend_migration]]).
    const [queue, setQueue] = useState([]);
    const [activeWashes, setActiveWashes] = useState([]);
    const [completedWashes, setCompletedWashes] = useState([]);
    const [transactions, setTransactions] = useState([]);

    const loadReservations = useCallback(async () => {
        if (!stationId || stationId === 'default') { setQueue([]); setActiveWashes([]); setCompletedWashes([]); return; }
        const { data } = await supabase.from('reservations').select('*').eq('station_id', stationId).order('created_at', { ascending: true });
        const items = (data || []).map(rowToItem);
        setQueue(items.filter((i) => i.status === 'attente'));
        setActiveWashes(items.filter((i) => i.status === 'en_cours'));
        setCompletedWashes(items.filter((i) => i.status === 'termine').sort((a, b) => new Date(b.completedAtISO || 0) - new Date(a.completedAtISO || 0)));
    }, [stationId]);

    const loadTransactions = useCallback(async () => {
        if (!stationId || stationId === 'default') { setTransactions([]); return; }
        const { data } = await supabase.from('transactions').select('*, profiles(phone)').eq('station_id', stationId).order('created_at', { ascending: false });
        setTransactions((data || []).map((row) => ({
            id: row.id, date: formatTxDate(row.created_at), createdAt: row.created_at, client: row.client_name, vehicle: row.vehicle_label,
            service: row.service, method: row.method, amount: row.amount,
            // Null pour un client de passage (jamais lié à un compte) — voir
            // handleWhatsApp dans Transactions.jsx, qui gère cette absence.
            clientPhone: row.profiles?.phone || null,
        })));
    }, [stationId]);

    // Historique des pubs de CETTE station, tous statuts (PENDING/ACTIVE/...) —
    // pour l'onglet "Publicité" de Paramètres. Le paiement lui-même (insert
    // PENDING) se fait directement via createAdPayment (src/lib/ads.js), pas
    // ici — voir loadStationAds côté useSuperAdminState.jsx pour la lecture
    // cross-station (Super Admin + fil des pubs ACTIVE côté client).
    const [stationAds, setStationAds] = useState([]);
    const loadStationAds = useCallback(async () => {
        if (!stationId || stationId === 'default') { setStationAds([]); return; }
        const { data } = await supabase.from('station_ads').select('*').eq('station_id', stationId).order('created_at', { ascending: false });
        setStationAds((data || []).map((row) => ({
            id: row.id, message: row.message, imageUrl: row.image_url, status: row.status, amount: row.amount,
            method: row.method, reference: row.reference, startsAt: row.starts_at, expiresAt: row.expires_at,
            confirmedAt: row.confirmed_at, createdAt: row.created_at,
        })));
    }, [stationId]);

    // Abonnements de la station
    const [clientSubscriptions, setClientSubscriptions] = useState([]);
    const [clientSubscriptionInvoices, setClientSubscriptionInvoices] = useState([]);

    const loadSubscriptions = useCallback(async () => {
        if (!stationId || stationId === 'default') { setClientSubscriptions([]); setClientSubscriptionInvoices([]); return; }
        
        // Charger les abonnements (CRM)
        const { data: subsData } = await supabase.from('station_client_subscriptions')
            .select('*')
            .eq('station_id', stationId)
            .order('created_at', { ascending: false });
        
        setClientSubscriptions((subsData || []).map(row => ({
            id: row.id,
            clientId: row.client_id, // Peut être null
            clientName: row.client_name,
            clientPhone: row.client_phone,
            clientEmail: row.client_email,
            clientAddress: row.client_address,
            status: row.status,
            price: row.price,
            balance: row.balance,
            startedAt: row.started_at,
            createdAt: row.created_at
        })));

        // Charger les factures d'abonnement
        const { data: invData } = await supabase.from('station_subscription_invoices')
            .select('*')
            .eq('station_id', stationId)
            .order('created_at', { ascending: false });
            
        setClientSubscriptionInvoices((invData || []).map(row => ({
            id: row.id,
            subscriptionId: row.subscription_id,
            clientName: row.client_name,
            clientPhone: row.client_phone,
            amount: row.amount,
            status: row.status,
            billingMonth: row.billing_month,
            paidAt: row.paid_at,
            createdAt: row.created_at
        })));
    }, [stationId]);

    const addClientSubscription = async (clientData, price) => {
        if (!stationId || stationId === 'default') return;
        let clientId = null;
        try {
            const { data: profile } = await supabase.from('profiles').select('id').eq('phone', clientData.phone).single();
            if (profile) clientId = profile.id;
        } catch(e) {}

        const { error } = await supabase.from('station_client_subscriptions').insert({
            station_id: stationId, 
            client_id: clientId,
            client_name: clientData.name,
            client_phone: clientData.phone,
            client_email: clientData.email,
            client_address: clientData.address,
            price, 
            balance: price,
            status: 'actif'
        });
        if (!error) await loadSubscriptions();
        return error;
    };

    const deleteClientSubscription = async (subId) => {
        const { error } = await supabase.from('station_client_subscriptions').delete().eq('id', subId);
        if (!error) await loadSubscriptions();
        return error;
    };

    const updateSubscriptionStatus = async (subId, status) => {
        await supabase.from('station_client_subscriptions').update({ status }).eq('id', subId);
        await loadSubscriptions();
    };

    const rechargeSubscription = async (subId, amountToAdd) => {
        // RPC atomique (balance = balance + montant en une seule requête SQL)
        // plutôt qu'un select-puis-update côté client, qui pouvait écraser une
        // déduction du trigger deduct_subscription_balance survenue entre les deux.
        const { error } = await supabase.rpc('recharge_subscription', { p_sub_id: subId, p_amount: amountToAdd });
        await loadSubscriptions();
        return error;
    };

    const generateSubscriptionInvoice = async (sub, billingMonth) => {
        if (!stationId || stationId === 'default') return;
        const { error } = await supabase.from('station_subscription_invoices').insert({
            station_id: stationId, subscription_id: sub.id, client_id: sub.clientId,
            client_name: sub.clientName, client_phone: sub.clientPhone,
            amount: sub.price, billing_month: billingMonth, status: 'a_payer'
        });
        if (!error) await loadSubscriptions();
        return error;
    };

    const markSubscriptionInvoicePaid = async (invoiceId) => {
        await supabase.from('station_subscription_invoices').update({ status: 'paye', paid_at: new Date().toISOString() }).eq('id', invoiceId);
        await loadSubscriptions();
    };

    useEffect(() => {
        loadReservations();
        loadTransactions();
        loadEmployees();
        loadCustomVehicleTypes();
        loadShiftTemplates();
        loadStationAds();
        loadSubscriptions();
        const refresh = () => { loadReservations(); loadTransactions(); loadEmployees(); loadCustomVehicleTypes(); loadShiftTemplates(); loadStationAds(); loadSubscriptions(); };
        window.addEventListener('focus', refresh);
        // `reservations`/`transactions`/`employees` sont dans la publication
        // supabase_realtime (voir schema.sql) : un client qui réserve depuis son
        // propre appareil, ou un pointage/assignation de laveur, apparaît ici en
        // direct, sans sonder toutes les 8s. `custom_vehicle_types` n'y est pas
        // encore (change trop rarement pour en avoir besoin). Le setInterval
        // restant sert de filet de sécurité (une reconnexion Realtime manquée
        // ne doit pas figer la file indéfiniment).
        const channel = (stationId && stationId !== 'default')
            ? supabase
                .channel(`station-live-${stationId}`)
                .on('postgres_changes', { event: '*', schema: 'public', table: 'reservations', filter: `station_id=eq.${stationId}` }, loadReservations)
                .on('postgres_changes', { event: '*', schema: 'public', table: 'transactions', filter: `station_id=eq.${stationId}` }, loadTransactions)
                .on('postgres_changes', { event: '*', schema: 'public', table: 'employees', filter: `station_id=eq.${stationId}` }, loadEmployees)
                .subscribe()
            : null;
        const interval = setInterval(refresh, 45000);
        return () => { clearInterval(interval); window.removeEventListener('focus', refresh); if (channel) supabase.removeChannel(channel); };
    }, [loadReservations, loadTransactions, loadEmployees, loadCustomVehicleTypes, loadShiftTemplates, loadStationAds, stationId]);

    // Le profil de la station (nom, adresse, horaires...) est la même donnée
    // que le registre Super Admin (table `stations`) — plus de copie locale
    // séparée, pour ne jamais désynchroniser ce que voit l'admin de ce que
    // voit le registre/l'annuaire public (voir supabase/schema.sql).
    const [stationProfile, setStationProfile] = useState(defaultStationProfile);
    // Bandeau promo / réduction / code promo — même principe : colonne
    // `promo_config` de la même ligne `stations`, plus de copie locale séparée.
    const [promoConfig, setPromoConfig] = useState(DEFAULT_PROMO);
    const rowToProfile = (row) => ({
        name: row?.name || '',
        phone: row?.owner_phone || '',
        address: row?.address || '',
        quartier: row?.quartier || '',
        region: row?.region || '',
        openTime: row?.open_time || '08:00',
        closeTime: row?.close_time || '20:00',
        logo: row?.logo_url || null,
        cachet: row?.cachet_url || null,
        dailyRevenueTarget: row?.daily_revenue_target ?? 50000,
    });
    useEffect(() => {
        if (!stationId || stationId === 'default') { setStationProfile(defaultStationProfile); setPromoConfig(DEFAULT_PROMO); return; }
        let cancelled = false;
        supabase.from('stations').select('*').eq('id', stationId).single().then(({ data }) => {
            if (cancelled) return;
            setStationProfile(rowToProfile(data));
            setPromoConfig(data?.promo_config && Object.keys(data.promo_config).length > 0 ? data.promo_config : DEFAULT_PROMO);
        });
        return () => { cancelled = true; };
    }, [stationId]);

    // Grille tarifaire + durées — une ligne par (catégorie, service) dans
    // `wash_pricing` au lieu de deux blobs JSON séparés (voir supabase/schema.sql).
    const [pricingConfig, setPricingConfig] = useState(defaultPricing);
    const [durationConfig, setDurationConfig] = useState(defaultDuration);
    useEffect(() => {
        if (!stationId || stationId === 'default') { setPricingConfig(defaultPricing); setDurationConfig(defaultDuration); return; }
        let cancelled = false;
        supabase.from('wash_pricing').select('*').eq('station_id', stationId).then(({ data }) => {
            if (cancelled) return;
            if (!data || data.length === 0) { setPricingConfig(defaultPricing); setDurationConfig(defaultDuration); return; }
            const pricing = {};
            const duration = {};
            Object.keys(defaultPricing).forEach((cat) => { pricing[cat] = { ...defaultPricing[cat] }; duration[cat] = { ...defaultDuration[cat] }; });
            data.forEach((row) => {
                (pricing[row.category] ||= {})[row.service] = row.price;
                (duration[row.category] ||= {})[row.service] = row.duration_minutes;
            });
            setPricingConfig(pricing);
            setDurationConfig(duration);
        });
        return () => { cancelled = true; };
    }, [stationId]);

    // Alerte sonore : bipe en boucle tant qu'un lavage en cours dépasse sa
    // durée estimée, pour prévenir le gérant même s'il n'a pas l'onglet "File
    // d'attente" ouvert (ce provider tourne sur toutes les pages admin, pas
    // seulement StationDashboard). Volontairement PAS "une seule fois" — le
    // gérant a demandé que ça ne s'arrête pas tant qu'il n'a pas cliqué
    // "Terminer le lavage" (qui fait sortir l'id de activeWashes, seule façon
    // dont la boucle s'arrête).
    //
    // Un AudioContext créé (et jamais débloqué par un clic) démarre "suspended"
    // dans la plupart des navigateurs — un son déclenché depuis un simple
    // setInterval, sans qu'aucun clic n'ait eu lieu sur la page depuis son
    // chargement, restait donc silencieux. On garde UN SEUL contexte partagé
    // (pas un nouveau à chaque bip) et on le débloque dès le tout premier
    // clic/touch/touche du gérant sur la page, plutôt que d'attendre le bip.
    const audioCtxRef = useRef(null);
    const getAudioCtx = () => {
        if (!audioCtxRef.current) {
            const AC = window.AudioContext || window.webkitAudioContext;
            if (!AC) return null;
            audioCtxRef.current = new AC();
        }
        return audioCtxRef.current;
    };
    useEffect(() => {
        const unlock = () => { getAudioCtx()?.resume().catch(() => {}); };
        ['click', 'touchstart', 'keydown'].forEach((evt) => document.addEventListener(evt, unlock));
        return () => ['click', 'touchstart', 'keydown'].forEach((evt) => document.removeEventListener(evt, unlock));
    }, []);

    useEffect(() => {
        // Bips courts, aigus (onde carrée, plus perçante qu'un sinus) et répétés
        // par salves — pensé pour porter à travers la vitre d'un véhicule,
        // pas pour être agréable (un "ding" doux ne s'entend pas de dehors).
        const playCompletionChime = () => {
            try {
                const ctx = getAudioCtx();
                if (!ctx) return;
                ctx.resume().catch(() => {});
                const now = ctx.currentTime;
                const freq = 2800;
                const beepDuration = 0.1;
                const beepGap = 0.08;
                const beepsPerRound = 3;
                const roundGap = 0.3;
                const rounds = 2;
                for (let round = 0; round < rounds; round++) {
                    for (let beep = 0; beep < beepsPerRound; beep++) {
                        const t = now + round * (beepsPerRound * (beepDuration + beepGap) + roundGap) + beep * (beepDuration + beepGap);
                        const osc = ctx.createOscillator();
                        const gain = ctx.createGain();
                        osc.type = 'square';
                        osc.frequency.value = freq;
                        gain.gain.setValueAtTime(0, t);
                        gain.gain.linearRampToValueAtTime(0.5, t + 0.008);
                        gain.gain.setValueAtTime(0.5, t + beepDuration - 0.015);
                        gain.gain.linearRampToValueAtTime(0, t + beepDuration);
                        osc.connect(gain).connect(ctx.destination);
                        osc.start(t);
                        osc.stop(t + beepDuration + 0.01);
                    }
                }
            } catch { /* AudioContext indisponible — pas bloquant */ }
        };

        const checkCompletions = () => {
            activeWashes.forEach((item) => {
                if (!item.startedAt) return;
                const cat = item.category || 'Particulier';
                const minutes = (durationConfig[cat] && durationConfig[cat][item.service]) ? durationConfig[cat][item.service] : 30;
                const totalSeconds = Math.max(0, Math.round(minutes * 60));
                const elapsed = Math.floor((Date.now() - new Date(item.startedAt).getTime()) / 1000);
                if (elapsed >= totalSeconds) playCompletionChime();
            });
        };
        checkCompletions();
        const interval = setInterval(checkCompletions, 5000);
        return () => clearInterval(interval);
    }, [activeWashes, durationConfig]);

    // Historique de pointage par jour : { "2026-08-12": { [employeeId]: { name, role, dailyStatus, status, clockIn, clockOut, totalTime... } } }
    // Alimenté au fil de l'eau à chaque action de pointage du jour (voir recordDailyAttendance),
    // pour permettre de consulter qui a travaillé et combien d'heures à une date passée (page Laveurs).
    const [attendanceHistory, setAttendanceHistory] = useState({});

    // Charge le pointage d'une date passée à la demande (voir Washers.jsx) et
    // le met en cache — pour aujourd'hui, le cache est alimenté au fil de l'eau
    // par recordDailyAttendance, pas besoin de le recharger depuis Supabase.
    const loadAttendanceForDate = useCallback(async (dateKey) => {
        if (!stationId || stationId === 'default') return;
        const { data } = await supabase.from('attendance_records').select('*').eq('station_id', stationId).eq('work_date', dateKey);
        const dayEntries = {};
        (data || []).forEach((row) => {
            dayEntries[row.employee_id] = {
                id: row.employee_id, name: row.name, role: row.role,
                dailyStatus: row.daily_status, status: row.status,
                clockIn: row.clock_in, clockOut: row.clock_out,
                clockInAt: row.clock_in_at, clockOutAt: row.clock_out_at,
                totalTime: row.total_time,
            };
        });
        setAttendanceHistory((prev) => ({ ...prev, [dateKey]: dayEntries }));
    }, [stationId]);

    // Charge tout un mois de pointage en un seul appel — utilisé par l'export
    // Excel/CSV mensuel (Washers.jsx), qui a besoin du détail jour par jour de
    // chaque employé plutôt que d'une seule date. Ne touche pas `attendanceHistory`
    // (instantané ponctuel demandé au moment de l'export, pas mis en cache).
    const loadAttendanceForMonth = useCallback(async (year, month) => {
        if (!stationId || stationId === 'default') return {};
        const pad = (n) => String(n).padStart(2, '0');
        const daysInMonth = new Date(year, month + 1, 0).getDate();
        const startKey = `${year}-${pad(month + 1)}-01`;
        const endKey = `${year}-${pad(month + 1)}-${pad(daysInMonth)}`;
        const { data } = await supabase.from('attendance_records').select('*')
            .eq('station_id', stationId).gte('work_date', startKey).lte('work_date', endKey);
        const byEmployeeDay = {};
        (data || []).forEach((row) => {
            byEmployeeDay[row.employee_id] ||= {};
            byEmployeeDay[row.employee_id][row.work_date] = {
                dailyStatus: row.daily_status, clockInAt: row.clock_in_at, clockOutAt: row.clock_out_at, totalTime: row.total_time,
            };
        });
        return byEmployeeDay;
    }, [stationId]);

    // Réinitialisation quotidienne du pointage des laveurs : sans ça, un laveur
    // marqué "Présent" un jour donné restait "présent" indéfiniment (avec les
    // heures de sa dernière journée) tant que personne n'y retouchait — il
    // apparaissait donc encore dans le Pointage Journalier le lendemain, alors
    // qu'il n'a pas encore repris son poste. On détecte le décalage directement
    // depuis `clockInAt` (déjà horodaté), sans champ supplémentaire à maintenir.
    // Ne concerne que le rôle "Laveur" — `status` a un tout autre sens pour les
    // autres rôles (statut du compte dans la page Équipe, pas pointage du jour).
    useEffect(() => {
        const now = new Date();
        const localDateKey = (d) => new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
        const todayKey = localDateKey(now);
        const staleIds = employees
            .filter((e) => e?.role === 'Laveur' && e?.dailyStatus === 'present' && e?.clockInAt && localDateKey(new Date(e.clockInAt)) !== todayKey)
            .map((e) => e.id);
        if (staleIds.length === 0 || !stationId || stationId === 'default') return;
        supabase.from('employees').update({
            daily_status: 'absent', status: 'Absent', clock_in: null, clock_out: null, clock_in_at: null, clock_out_at: null, total_time: null,
        }).in('id', staleIds).then(() => loadEmployees());
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [employees.map((e) => `${e.id}:${e.dailyStatus}:${e.clockInAt || ''}`).join(',')]);

    // Enregistre/complète l'entrée du jour courant pour un employé (statut du jour et/ou
    // pointage). Chaque appel fusionne avec l'entrée existante du jour, pour que la
    // consultation d'une date passée reflète bien l'état final de cette journée-là.
    // Le cache local est mis à jour tout de suite (pour Washers.jsx), la ligne
    // `attendance_records` est upsertée en tâche de fond pour la persistance.
    const recordDailyAttendance = (employeeId, patch) => {
        // Clé du jour en heure locale (pas UTC) pour matcher le sélecteur de date de Washers.jsx.
        const now = new Date();
        const todayKey = new Date(now.getTime() - now.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
        const emp = employees.find(e => e.id === employeeId);
        setAttendanceHistory((prev) => {
            const dayEntries = prev[todayKey] || {};
            const existing = dayEntries[employeeId] || { id: employeeId, name: emp?.name, role: emp?.role };
            return { ...prev, [todayKey]: { ...dayEntries, [employeeId]: { ...existing, ...patch } } };
        });
        if (!stationId || stationId === 'default') return;
        supabase.from('attendance_records').upsert({
            station_id: stationId, employee_id: employeeId, work_date: todayKey,
            name: emp?.name, role: emp?.role, ...patchToRow(patch),
        }, { onConflict: 'employee_id,work_date' }).then(() => {});
    };
    // Une ligne par (catégorie, service) touché — fusionne toujours prix ET
    // durée dans le même upsert (les deux colonnes sont NOT NULL), en prenant
    // la valeur de l'autre config depuis l'état courant quand un seul des deux
    // formulaires (Grille Tarifaire / Temps Estimés) vient d'être sauvegardé.
    const syncWashPricing = (pricing, duration) => {
        if (!stationId || stationId === 'default') return;
        const categories = new Set([...Object.keys(pricing || {}), ...Object.keys(duration || {})]);
        const rows = [];
        categories.forEach((category) => {
            const services = new Set([...Object.keys(pricing?.[category] || {}), ...Object.keys(duration?.[category] || {})]);
            services.forEach((service) => {
                rows.push({
                    station_id: stationId, category, service,
                    price: pricing?.[category]?.[service] ?? 0,
                    duration_minutes: duration?.[category]?.[service] ?? 30,
                });
            });
        });
        if (rows.length === 0) return;
        supabase.from('wash_pricing').upsert(rows, { onConflict: 'station_id,category,service' }).then(() => {});
    };
    const updatePricing = (newP) => { setPricingConfig(newP); syncWashPricing(newP, durationConfig); };
    const updateDuration = (newD) => { setDurationConfig(newD); syncWashPricing(pricingConfig, newD); };
    const updatePromo = (newPr) => {
        setPromoConfig(newPr);
        if (!stationId || stationId === 'default') return;
        supabase.from('stations').update({ promo_config: newPr }).eq('id', stationId).then(() => {});
    };
    const updateStationProfile = (newP) => {
        setStationProfile(newP);
        if (!stationId || stationId === 'default') return;
        supabase.from('stations').update({
            name: newP.name, owner_phone: newP.phone, address: newP.address, quartier: newP.quartier,
            region: newP.region, open_time: newP.openTime, close_time: newP.closeTime,
            logo_url: newP.logo, cachet_url: newP.cachet, daily_revenue_target: newP.dailyRevenueTarget,
        }).eq('id', stationId).then(() => {});
    };
    // Async et renvoie { success, error } — l'assistant d'onboarding (StationOnboarding.jsx)
    // a besoin de savoir si l'ajout a réellement abouti avant d'avancer à l'étape
    // suivante, contrairement à Team.jsx qui reste en fire-and-forget.
    const addEmployee = async (employeeData) => {
        if (!stationId || stationId === 'default') return { success: false, error: 'no_station' };
        const initials = employeeData.name.split(' ').map(n => n[0]).join('').substring(0, 2).toUpperCase() || '👤';
        // daily_status démarre à 'repos', pas 'present' : un laveur qui vient
        // d'être ajouté n'est pas encore de garde aujourd'hui. Sans ça, il
        // apparaissait immédiatement dans le Pointage Journalier ET se
        // retrouvait pointé automatiquement (voir l'effet d'auto-prise de
        // poste dans Washers.jsx, déclenché par dailyStatus === 'present').
        // L'admin doit explicitement le passer à "Présent" pour l'activer.
        const { error } = await supabase.from('employees').insert({
            station_id: stationId, name: employeeData.name, role: employeeData.role, access: employeeData.access,
            status: 'Actif', daily_status: 'repos', avatar: initials,
        });
        if (!error) await loadEmployees();
        return { success: !error, error };
    };

    const updateEmployee = (id, updatedData) => {
        if (!stationId || stationId === 'default') return;
        supabase.from('employees').update(patchToRow(updatedData)).eq('id', id).then(() => loadEmployees());
    };

    const deleteEmployee = (id) => {
        if (!stationId || stationId === 'default') return;
        supabase.from('employees').delete().eq('id', id).then(() => loadEmployees());
    };

    // Abonnement fidélité ACTIF de ce client à CETTE station, avec un solde
    // suffisant pour couvrir `amount` — utilisé pour choisir automatiquement
    // la méthode de paiement 'Abonnement' (déduction via le trigger Postgres,
    // voir add_plate_lookup.sql/recreate_subscriptions.sql) au lieu de la
    // méthode 'Espèces' par défaut, quand le client encaissé est reconnu
    // (compte lié via clientId — plaque ou historique).
    const findEligibleSubscription = (clientId, amount) => {
        if (!clientId) return null;
        return clientSubscriptions.find((s) => s.clientId === clientId && s.status === 'actif' && s.balance >= amount) || null;
    };

    const addWash = (washData) => {
        if (!stationId || stationId === 'default') return;
        // Prix figé dès la création (comme pour une réservation client), pour
        // que "Payé d'avance" à l'ajout ET "Encaisser" plus tard facturent
        // toujours le même montant — voir validatePayment ci-dessous.
        const basePrice = (pricingConfig[washData.category] && pricingConfig[washData.category][washData.service]) || 2500;
        const amount = applyDiscount(promoConfig, washData.category, washData.service, basePrice);
        const paid = !!washData.paid;
        const activeSub = paid ? findEligibleSubscription(washData.clientId, amount) : null;
        const method = activeSub ? 'Abonnement' : 'Espèces';
        supabase.from('reservations').insert({
            station_id: stationId, client_name: washData.client, vehicle_label: washData.vehicle,
            category: washData.category, service: washData.service, paid, amount, status: 'attente',
            // Reconnaissance par plaque (StationDashboard.jsx) : si ce client de
            // passage a déjà un compte automobiliste, on relie la réservation
            // pour qu'elle apparaisse en direct sur son tableau de bord.
            client_id: washData.clientId || null,
        }).select().single().then(async ({ data, error }) => {
            // Payé directement à l'ajout ("Payé d'avance") : il faut créer la
            // transaction ici (rien d'autre ne le fera jamais, contrairement au
            // flux "Encaisser" plus tard qui passe par validatePayment) — sinon
            // ce lavage n'apparaît jamais en Comptabilité/Transactions et ne
            // déduit jamais un abonnement même quand method serait 'Abonnement'.
            if (!error && paid) {
                await supabase.from('transactions').insert({
                    station_id: stationId, reservation_id: data.id, client_id: washData.clientId || null,
                    client_name: washData.client, vehicle_label: washData.vehicle, service: washData.service,
                    method, amount,
                });
                loadTransactions();
            }
            loadReservations();
        });
    };

    // Réactive un laveur qui avait cliqué "Descente" (status 'Terminé') — ex:
    // il était parti 2h et revient. On ne touche pas clockInAt (son tout premier
    // pointage du jour), seulement clockOut/totalTime qu'on efface pour réactiver
    // le bouton "Descendre" : au prochain clic, formatWorkedTime recalculera
    // depuis ce clockInAt d'origine, donnant le temps global de la journée
    // plutôt que juste cette reprise. Utilisée à la fois par le bouton "Reprendre
    // service" (Washers.jsx) et automatiquement par startWash ci-dessous quand
    // un véhicule est confié à un laveur déjà descendu.
    const resumeEmployee = (id) => {
        const patch = { status: 'Actif', clockOut: null, clockOutAt: null, totalTime: null };
        updateEmployee(id, patch);
        recordDailyAttendance(id, patch);
    };

    // Clôture définitive d'un laveur "Terminé" — contrairement à resumeEmployee,
    // ce n'est plus jamais réactivable ce jour-là : ni via le bouton "Reprendre
    // service" (n'apparaît que pour status === 'Terminé', pas 'Fin de service'),
    // ni via une nouvelle affectation de véhicule (voir availableEmployees dans
    // StationDashboard.jsx, qui exclut désormais ce statut). daily_status reste
    // 'present' et clockOut/totalTime restent ceux déjà enregistrés par le
    // dernier "Descendre" — un laveur réellement fini a bien travaillé
    // aujourd'hui, ça doit rester vrai dans l'export mensuel.
    const finishService = (id) => {
        const patch = { status: 'Fin de service' };
        updateEmployee(id, patch);
        recordDailyAttendance(id, patch);
    };

    // Coupure automatique du pointage à l'heure de fermeture (Réglages > Horaires
    // d'ouverture, `stationProfile.closeTime`) — filet de sécurité pour un gérant
    // qui oublie de cliquer "Descendre" : un laveur encore "Actif" une fois cette
    // heure dépassée est automatiquement passé à "Terminé", exactement comme un
    // clic manuel sur "Descendre" (PAS "Fin de service" — voir plus bas pourquoi).
    // Sans ça, le compteur de temps travaillé tournerait indéfiniment tant que
    // personne n'intervient. Le temps total est calculé jusqu'à l'heure de
    // fermeture pile (pas jusqu'au moment de la vérification, qui tourne toutes
    // les minutes) pour refléter le vrai horaire de fermeture.
    //
    // Pourquoi "Terminé" et pas "Fin de service" (le choix initial du gérant,
    // revu après test) : "Fin de service" est un état définitif, sans aucun
    // bouton dans Washers.jsx — la coupure auto prenait donc de vitesse le
    // gérant et lui masquait les boutons "Reprendre service"/"Fin de service"
    // dont il a justement besoin pour gérer une pause ou un départ anticipé
    // (urgence). "Terminé" garde ces deux boutons disponibles après coup :
    // la coupure ne fait qu'arrêter le compteur, le gérant garde la main.
    //
    // Vérifié au montage puis chaque minute — tourne tant que l'appli reste
    // ouverte (pas de tâche serveur, cette appli n'a pas de backend applicatif).
    useEffect(() => {
        const checkAutoClockOut = () => {
            if (!stationId || stationId === 'default' || !stationProfile?.closeTime) return;
            const [closeH, closeM] = stationProfile.closeTime.split(':').map(Number);
            if (Number.isNaN(closeH) || Number.isNaN(closeM)) return;
            const now = new Date();
            const closeAt = new Date(now);
            closeAt.setHours(closeH, closeM, 0, 0);
            if (now < closeAt) return;
            const localDateKey = (d) => new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
            const todayKey = localDateKey(now);
            const toClose = employees.filter((e) =>
                e.role === 'Laveur' && e.status === 'Actif' && e.clockInAt && localDateKey(new Date(e.clockInAt)) === todayKey
            );
            if (toClose.length === 0) return;
            const display = closeAt.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
            toClose.forEach((w) => {
                const totalMinutes = Math.max(0, Math.round((closeAt.getTime() - new Date(w.clockInAt).getTime()) / 60000));
                const total = `${Math.floor(totalMinutes / 60)}h ${String(totalMinutes % 60).padStart(2, '0')}m`;
                const patch = { status: 'Terminé', clockOut: display, clockOutAt: closeAt.toISOString(), totalTime: total };
                updateEmployee(w.id, patch);
                recordDailyAttendance(w.id, patch);
            });
        };
        checkAutoClockOut();
        const interval = setInterval(checkAutoClockOut, 60000);
        return () => clearInterval(interval);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [employees.map((e) => `${e.id}:${e.status}:${e.clockInAt || ''}`).join(','), stationProfile?.closeTime, stationId]);

    const startWash = (id, employeeId) => {
        const emp = (employees || []).find(e => e.id === employeeId);
        supabase.from('reservations').update({
            status: 'en_cours', assigned_to_name: emp ? emp.name : 'Inconnu', started_at: new Date().toISOString(),
        }).eq('id', id).then(() => loadReservations());

        if (emp && emp.status === 'Terminé') resumeEmployee(emp.id);
    };

    const endWash = (id) => {
        supabase.from('reservations').update({
            status: 'termine', completed_at: new Date().toISOString(),
        }).eq('id', id).then(() => loadReservations());
    };

    const skipWash = (id) => {
        supabase.from('reservations').update({ status: 'annule' }).eq('id', id).then(() => loadReservations());
    };

    // Recule un véhicule payé en ligne (Wave/Orange Money) d'une place dans la
    // file, quand le client tarde à venir — règle : ces réservations gardent
    // leur ticket payé au lieu d'être annulées, elles cèdent juste leur tour.
    // La position vient du tri par `created_at` (voir loadReservations), donc
    // "reculer d'un rang" = échanger le created_at avec le véhicule suivant —
    // ça garde l'ordre cohérent partout ailleurs (estimation d'attente côté
    // client, file admin) sans avoir besoin d'une colonne de position dédiée.
    const pushBackOnePosition = (id) => {
        const idx = queue.findIndex((q) => q.id === id);
        if (idx === -1 || idx >= queue.length - 1) return;
        const current = queue[idx];
        const next = queue[idx + 1];
        Promise.all([
            supabase.from('reservations').update({ created_at: next.createdAt }).eq('id', current.id),
            supabase.from('reservations').update({ created_at: current.createdAt }).eq('id', next.id),
        ]).then(() => loadReservations());
    };

    const validatePayment = (id) => {
        const item = queue.find(q => q.id === id) || activeWashes.find(w => w.id === id);
        if (!item || item.paid) return;

        const cat = item.category || "Particulier";
        // Si le prix a déjà été figé à la réservation (ex: côté client, avec un
        // éventuel code promo appliqué), on le respecte plutôt que de le
        // recalculer — sinon on applique la réduction en cours de la station.
        const basePrice = (pricingConfig[cat] && pricingConfig[cat][item.service]) ? pricingConfig[cat][item.service] : 2500;
        const amount = item.amount != null ? item.amount : applyDiscount(promoConfig, cat, item.service, basePrice);
        // Client reconnu (plaque/historique) avec un abonnement actif et un
        // solde suffisant à CETTE station : on encaisse via le wallet plutôt
        // qu'en espèces — le trigger de déduction (station_client_subscriptions)
        // s'occupe du reste dès l'insertion de la transaction ci-dessous.
        const activeSub = findEligibleSubscription(item.clientId, amount);
        const method = activeSub ? 'Abonnement' : 'Espèces';

        supabase.from('reservations').update({ paid: true, amount }).eq('id', id).then(async () => {
            await supabase.from('transactions').insert({
                station_id: stationId, reservation_id: id, client_id: item.clientId || null, client_name: item.client, vehicle_label: item.vehicle,
                service: item.service, method, amount,
            });
            loadReservations();
            loadTransactions();
        });
    };

    // Calcul du temps d'attente estimé pour un client spécifique
    const getEstimatedWaitTime = (clientName) => {
        const norm = (clientName || '').trim().toLowerCase();
        const clientIndex = (queue || []).findIndex(q => (q.client || '').trim().toLowerCase() === norm);
        if (clientIndex === -1) return 0; // Si le client n'est pas dans la file d'attente, temps = 0

        let totalWaitTime = 0;

        // 1. Temps RÉELLEMENT restant des véhicules en cours (durée - temps déjà
        // écoulé depuis startedAt), pas une estimation à plat à 50% du temps total.
        (activeWashes || []).forEach(wash => {
            const cat = wash.category || "Particulier";
            const time = (durationConfig[cat] && durationConfig[cat][wash.service]) ? durationConfig[cat][wash.service] : 30;
            const elapsedMin = wash.startedAt ? (Date.now() - new Date(wash.startedAt).getTime()) / 60000 : time / 2;
            totalWaitTime += Math.max(0, time - elapsedMin);
        });

        // 2. Temps des véhicules devant lui dans la file d'attente
        for (let i = 0; i < clientIndex; i++) {
            const wash = (queue || [])[i];
            const cat = wash.category || "Particulier";
            const time = (durationConfig[cat] && durationConfig[cat][wash.service]) ? durationConfig[cat][wash.service] : 30;
            totalWaitTime += time;
        }

        // Pas de division par une "capacité parallèle" : le temps d'attente est
        // la somme du temps restant des véhicules en lavage + le temps de lavage
        // de chacun des véhicules devant lui dans la file (formule confirmée par
        // le gérant). Diviser par le nombre d'employés "présents" sous-estimait
        // fortement l'attente (ce chiffre inclut souvent du personnel qui ne
        // lave pas en parallèle — caissier, gardien...).
        return Math.round(totalWaitTime);
    };

    // ─── Nettoyage ciblé des données fictives ────────────────────────────────
    // Supprime UNIQUEMENT les entrées de démo connues.
    // Toutes les données créées manuellement sont préservées.
    const cleanDemoData = () => {
        let cleaned = [];

        // Réservations/transactions ne sont plus concernées : une station créée
        // via Supabase ne démarre jamais avec des données fictives (contrairement
        // à l'ancien bootstrap localStorage) — seuls employés et profil peuvent
        // encore porter les anciens noms de démo.

        // 1. Employés : retirer Moussa Diop et Alioune Fall s'ils existent
        const demoEmps = employees.filter(emp => DEMO_EMPLOYEE_NAMES.includes(emp.name));
        if (demoEmps.length > 0 && stationId && stationId !== 'default') {
            supabase.from('employees').delete().in('id', demoEmps.map(e => e.id)).then(() => loadEmployees());
            cleaned.push(`${demoEmps.length} employé(s) fictif(s) supprimé(s)`);
        }

        // 2. Profil station : réinitialiser si toujours le nom de démo
        if (stationProfile?.name === DEMO_STATION_NAME) {
            const cleanProfile = { ...stationProfile, name: '', phone: DEMO_STATION_PHONE === stationProfile.phone ? '' : stationProfile.phone, address: stationProfile.address === 'Plateau, Dakar' ? '' : stationProfile.address };
            updateStationProfile(cleanProfile);
            cleaned.push('Nom de station fictif effacé (à reconfigurer dans Paramètres)');
        }

        return cleaned;
    };

    // Vide la file, l'historique et les transactions de LA STATION COURANTE
    // uniquement (profil et tarifs conservés). Ne touche pas aux autres stations.
    const resetOperationalData = () => {
        if (!stationId || stationId === 'default') return;
        supabase.from('reservations').delete().eq('station_id', stationId).then(() => loadReservations());
        supabase.from('transactions').delete().eq('station_id', stationId).then(() => loadTransactions());
    };

    // Réinitialisation complète de LA STATION COURANTE uniquement (profil,
    // tarifs, employés, historique). Les autres stations et les registres
    // Super Admin / comptes automobilistes ne sont pas affectés.
    const resetStationCompletely = () => {
        updateStationProfile(defaultStationProfile);
        if (stationId && stationId !== 'default') {
            supabase.from('wash_pricing').delete().eq('station_id', stationId).then(() => {});
            supabase.from('stations').update({ promo_config: {} }).eq('id', stationId).then(() => {});
            supabase.from('reservations').delete().eq('station_id', stationId).then(() => loadReservations());
            supabase.from('transactions').delete().eq('station_id', stationId).then(() => loadTransactions());
            supabase.from('employees').delete().eq('station_id', stationId).then(() => {});
            supabase.from('attendance_records').delete().eq('station_id', stationId).then(() => {});
        }
        window.location.reload();
    };

    return (
        <AppStateContext.Provider value={{
            queue, activeWashes, employees, transactions, pricingConfig, durationConfig, promoConfig, stationProfile, completedWashes,
            attendanceHistory, recordDailyAttendance, loadAttendanceForDate, loadAttendanceForMonth,
            customVehicleTypes, addCustomVehicleType,
            shiftTemplates, addShiftTemplate, updateShiftTemplate, deleteShiftTemplate,
            scheduleByDate, loadScheduleRange, setShiftForDay,
            clientSubscriptions, clientSubscriptionInvoices, addClientSubscription, deleteClientSubscription, updateSubscriptionStatus, generateSubscriptionInvoice, markSubscriptionInvoicePaid, rechargeSubscription,
            stationAds, loadStationAds,
            addWash, startWash, endWash, skipWash, pushBackOnePosition, validatePayment, updatePricing, getEstimatedWaitTime,
            updateDuration, updatePromo, updateStationProfile, addEmployee, updateEmployee, deleteEmployee, resumeEmployee, finishService, cleanDemoData,
            resetOperationalData, resetStationCompletely
        }}>
            {children}
        </AppStateContext.Provider>
    );
}

export function useAppState() {
    const context = useContext(AppStateContext);
    if (!context) {
        throw new Error("useAppState must be used within an AppStateProvider");
    }
    return context;
}
