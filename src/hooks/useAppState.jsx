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
function keyFor(base, stationId) {
    return `${base}_${stationId}`;
}

function loadNamespaced(base, stationId, fallback) {
    const raw = localStorage.getItem(keyFor(base, stationId));
    if (raw == null) return fallback;
    try { return JSON.parse(raw); } catch { return fallback; }
}

// Données par défaut — vides pour une vraie station
const defaultEmployees = []; // Aucun employé de démo

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

    const [employees, setEmployees] = useState(() => loadNamespaced('washEmployees', stationId, defaultEmployees));

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
        const refresh = () => { loadReservations(); loadTransactions(); };
        const interval = setInterval(refresh, 8000);
        window.addEventListener('focus', refresh);
        return () => { clearInterval(interval); window.removeEventListener('focus', refresh); };
    }, [loadReservations, loadTransactions]);

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

    // Alerte sonore : bipe une fois quand un lavage en cours dépasse sa durée
    // estimée, pour prévenir le gérant même s'il n'a pas l'onglet "File
    // d'attente" ouvert (ce provider tourne sur toutes les pages admin, pas
    // seulement StationDashboard). Un id ne sonne qu'une fois — il ressort du
    // suivi dès qu'il quitte activeWashes (lavage terminé/annulé), donc il
    // pourrait re-sonner s'il redémarrait un jour.
    //
    // Un AudioContext créé (et jamais débloqué par un clic) démarre "suspended"
    // dans la plupart des navigateurs — un son déclenché depuis un simple
    // setInterval, sans qu'aucun clic n'ait eu lieu sur la page depuis son
    // chargement, restait donc silencieux. On garde UN SEUL contexte partagé
    // (pas un nouveau à chaque bip) et on le débloque dès le tout premier
    // clic/touch/touche du gérant sur la page, plutôt que d'attendre le bip.
    const notifiedWashIds = useRef(new Set());
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
        const playCompletionChime = () => {
            try {
                const ctx = getAudioCtx();
                if (!ctx) return;
                ctx.resume().catch(() => {});
                const now = ctx.currentTime;
                [880, 1108.73].forEach((freq, i) => {
                    const osc = ctx.createOscillator();
                    const gain = ctx.createGain();
                    osc.type = 'sine';
                    osc.frequency.value = freq;
                    gain.gain.setValueAtTime(0, now + i * 0.15);
                    gain.gain.linearRampToValueAtTime(0.3, now + i * 0.15 + 0.02);
                    gain.gain.exponentialRampToValueAtTime(0.001, now + i * 0.15 + 0.4);
                    osc.connect(gain).connect(ctx.destination);
                    osc.start(now + i * 0.15);
                    osc.stop(now + i * 0.15 + 0.45);
                });
            } catch { /* AudioContext indisponible — pas bloquant */ }
        };

        const checkCompletions = () => {
            const activeIds = new Set(activeWashes.map((w) => w.id));
            for (const id of notifiedWashIds.current) {
                if (!activeIds.has(id)) notifiedWashIds.current.delete(id);
            }
            activeWashes.forEach((item) => {
                if (!item.startedAt || notifiedWashIds.current.has(item.id)) return;
                const cat = item.category || 'Particulier';
                const minutes = (durationConfig[cat] && durationConfig[cat][item.service]) ? durationConfig[cat][item.service] : 30;
                const totalSeconds = Math.max(0, Math.round(minutes * 60));
                const elapsed = Math.floor((Date.now() - new Date(item.startedAt).getTime()) / 1000);
                if (elapsed >= totalSeconds) {
                    notifiedWashIds.current.add(item.id);
                    playCompletionChime();
                }
            });
        };
        checkCompletions();
        const interval = setInterval(checkCompletions, 5000);
        return () => clearInterval(interval);
    }, [activeWashes, durationConfig]);

    // Historique de pointage par jour : { "2026-08-12": { [employeeId]: { name, role, dailyStatus, status, clockIn, clockOut, totalTime... } } }
    // Alimenté au fil de l'eau à chaque action de pointage du jour (voir recordDailyAttendance),
    // pour permettre de consulter qui a travaillé et combien d'heures à une date passée (page Laveurs).
    const [attendanceHistory, setAttendanceHistory] = useState(() => loadNamespaced('attendanceHistory', stationId, {}));

    const updateEmployees = (newE) => { setEmployees(newE); localStorage.setItem(keyFor('washEmployees', stationId), JSON.stringify(newE)); };
    const updateAttendanceHistory = (newH) => { setAttendanceHistory(newH); localStorage.setItem(keyFor('attendanceHistory', stationId), JSON.stringify(newH)); };

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
        const staleIds = new Set(
            employees
                .filter((e) => e?.role === 'Laveur' && e?.dailyStatus === 'present' && e?.clockInAt && localDateKey(new Date(e.clockInAt)) !== todayKey)
                .map((e) => e.id)
        );
        if (staleIds.size === 0) return;
        updateEmployees(employees.map((e) => (staleIds.has(e.id)
            ? { ...e, dailyStatus: 'absent', status: 'Absent', clockIn: null, clockOut: null, clockInAt: null, clockOutAt: null, totalTime: null }
            : e)));
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [employees.map((e) => `${e.id}:${e.dailyStatus}:${e.clockInAt || ''}`).join(',')]);

    // Enregistre/complète l'entrée du jour courant pour un employé (statut du jour et/ou
    // pointage). Chaque appel fusionne avec l'entrée existante du jour, pour que la
    // consultation d'une date passée reflète bien l'état final de cette journée-là.
    const recordDailyAttendance = (employeeId, patch) => {
        // Clé du jour en heure locale (pas UTC) pour matcher le sélecteur de date de Washers.jsx.
        const now = new Date();
        const todayKey = new Date(now.getTime() - now.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
        const emp = employees.find(e => e.id === employeeId);
        const dayEntries = attendanceHistory[todayKey] || {};
        const existing = dayEntries[employeeId] || { id: employeeId, name: emp?.name, role: emp?.role };
        updateAttendanceHistory({
            ...attendanceHistory,
            [todayKey]: { ...dayEntries, [employeeId]: { ...existing, ...patch } },
        });
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
    const addEmployee = (employeeData) => {
        const id = employees.length > 0 ? Math.max(...employees.map(m => m.id)) + 1 : 1;
        const initials = employeeData.name.split(' ').map(n => n[0]).join('').substring(0, 2).toUpperCase() || '👤';
        const newEmployee = {
            id,
            status: "Actif",
            dailyStatus: "present",
            lastLogin: "Jamais",
            avatar: initials,
            clockIn: null,
            clockOut: null,
            totalTime: null,
            ...employeeData
        };
        updateEmployees([...employees, newEmployee]);
    };

    const updateEmployee = (id, updatedData) => {
        updateEmployees(employees.map(emp => emp.id === id ? { ...emp, ...updatedData } : emp));
    };

    const deleteEmployee = (id) => {
        updateEmployees(employees.filter(emp => emp.id !== id));
    };

    const addWash = (washData) => {
        if (!stationId || stationId === 'default') return;
        supabase.from('reservations').insert({
            station_id: stationId, client_name: washData.client, vehicle_label: washData.vehicle,
            category: washData.category, service: washData.service, paid: !!washData.paid, status: 'attente',
        }).then(() => loadReservations());
    };

    const startWash = (id, employeeId) => {
        const emp = (employees || []).find(e => e.id === parseInt(employeeId));
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
        const cleanEmps = employees.filter(emp => !DEMO_EMPLOYEE_NAMES.includes(emp.name));
        if (cleanEmps.length !== employees.length) {
            updateEmployees(cleanEmps);
            cleaned.push(`${employees.length - cleanEmps.length} employé(s) fictif(s) supprimé(s)`);
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
        ['washEmployees', 'attendanceHistory'].forEach(base => localStorage.removeItem(keyFor(base, stationId)));
        updateStationProfile(defaultStationProfile);
        if (stationId && stationId !== 'default') {
            supabase.from('wash_pricing').delete().eq('station_id', stationId).then(() => {});
            supabase.from('stations').update({ promo_config: {} }).eq('id', stationId).then(() => {});
            supabase.from('reservations').delete().eq('station_id', stationId).then(() => {});
            supabase.from('transactions').delete().eq('station_id', stationId).then(() => {});
        }
        window.location.reload();
    };

    return (
        <AppStateContext.Provider value={{
            queue, activeWashes, employees, transactions, pricingConfig, durationConfig, promoConfig, stationProfile, completedWashes,
            attendanceHistory, recordDailyAttendance,
            addWash, startWash, endWash, skipWash, pushBackOnePosition, validatePayment, updatePricing, updateEmployees, getEstimatedWaitTime,
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
