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
        const { data } = await supabase.from('transactions').select('*').eq('station_id', stationId).order('created_at', { ascending: false });
        setTransactions((data || []).map((row) => ({
            id: row.id, date: formatTxDate(row.created_at), createdAt: row.created_at, client: row.client_name, vehicle: row.vehicle_label,
            service: row.service, method: row.method, amount: row.amount,
        })));
    }, [stationId]);

    useEffect(() => {
        loadReservations();
        loadTransactions();
        loadEmployees();
        loadCustomVehicleTypes();
        const refresh = () => { loadReservations(); loadTransactions(); loadEmployees(); loadCustomVehicleTypes(); };
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
    }, [loadReservations, loadTransactions, loadEmployees, loadCustomVehicleTypes, stationId]);

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
            logo_url: newP.logo, cachet_url: newP.cachet,
        }).eq('id', stationId).then(() => {});
    };
    // Async et renvoie { success, error } — l'assistant d'onboarding (StationOnboarding.jsx)
    // a besoin de savoir si l'ajout a réellement abouti avant d'avancer à l'étape
    // suivante, contrairement à Team.jsx qui reste en fire-and-forget.
    const addEmployee = async (employeeData) => {
        if (!stationId || stationId === 'default') return { success: false, error: 'no_station' };
        const initials = employeeData.name.split(' ').map(n => n[0]).join('').substring(0, 2).toUpperCase() || '👤';
        const { error } = await supabase.from('employees').insert({
            station_id: stationId, name: employeeData.name, role: employeeData.role, access: employeeData.access,
            status: 'Actif', daily_status: 'present', avatar: initials,
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

    const addWash = (washData) => {
        if (!stationId || stationId === 'default') return;
        supabase.from('reservations').insert({
            station_id: stationId, client_name: washData.client, vehicle_label: washData.vehicle,
            category: washData.category, service: washData.service, paid: !!washData.paid, status: 'attente',
        }).then(() => loadReservations());
    };

    const startWash = (id, employeeId) => {
        const emp = (employees || []).find(e => e.id === employeeId);
        supabase.from('reservations').update({
            status: 'en_cours', assigned_to_name: emp ? emp.name : 'Inconnu', started_at: new Date().toISOString(),
        }).eq('id', id).then(() => loadReservations());
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

        supabase.from('reservations').update({ paid: true, amount }).eq('id', id).then(async () => {
            await supabase.from('transactions').insert({
                station_id: stationId, reservation_id: id, client_name: item.client, vehicle_label: item.vehicle,
                service: item.service, method: 'Espèces', amount,
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

        // 1. Temps des véhicules en cours (estimation moyenne restante)
        // Pour simplifier, on ajoute 50% du temps total des véhicules actuellement lavés
        (activeWashes || []).forEach(wash => {
            const cat = wash.category || "Particulier";
            const time = (durationConfig[cat] && durationConfig[cat][wash.service]) ? durationConfig[cat][wash.service] : 30;
            totalWaitTime += (time / 2); // on suppose qu'ils sont à mi-chemin
        });

        // 2. Temps des véhicules devant lui dans la file d'attente
        for (let i = 0; i < clientIndex; i++) {
            const wash = (queue || [])[i];
            const cat = wash.category || "Particulier";
            const time = (durationConfig[cat] && durationConfig[cat][wash.service]) ? durationConfig[cat][wash.service] : 30;
            totalWaitTime += time;
        }

        // On divise par le nombre d'employés présents s'il y en a plusieurs (pour simuler la capacité parallèle)
        const activeEmployees = (employees || []).filter(e => e?.present || e?.dailyStatus === 'present').length || 1;
        
        return Math.round(totalWaitTime / activeEmployees);
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
            supabase.from('reservations').delete().eq('station_id', stationId).then(() => {});
            supabase.from('transactions').delete().eq('station_id', stationId).then(() => {});
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
            addWash, startWash, endWash, skipWash, pushBackOnePosition, validatePayment, updatePricing, getEstimatedWaitTime,
            updateDuration, updatePromo, updateStationProfile, addEmployee, updateEmployee, deleteEmployee, cleanDemoData,
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
