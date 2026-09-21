import React, { createContext, useContext, useState, useEffect, useCallback, useRef } from 'react';
import { getCurrentStationId, getCurrentRole } from '../lib/accounts';
import { supabase } from '../lib/supabaseClient';
import { DEFAULT_PRICING, DEFAULT_DURATION } from '../lib/washDefaults';
import { DEFAULT_PROMO, applyDiscount } from '../lib/promoDefaults';
import { nozzleLabel, nozzleKey, sortNozzles, normalizeLines } from '../lib/pompistes';
import { loadPlatformAnnouncements, sendStationAnnouncement as sendStationAnnouncementApi, loadStationKnownClients as loadStationKnownClientsApi, retireAnnouncement } from '../lib/announcements';

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
        pumpLabel: row.pump_label || '', // pompe habituelle (rôle 'Pompiste', voir add_pompistes.sql)
        lastLogin: 'Jamais', // jamais persisté nulle part, valeur statique comme avant la migration
    };
}

// Champs de pointage partagés entre `employees` (état courant) et
// `attendance_records` (instantané par jour) — mêmes noms de colonnes dans
// les deux tables, donc un seul mapping camelCase -> snake_case pour les deux.
const ATTENDANCE_FIELD_MAP = { dailyStatus: 'daily_status', clockIn: 'clock_in', clockOut: 'clock_out', clockInAt: 'clock_in_at', clockOutAt: 'clock_out_at', totalTime: 'total_time', pumpLabel: 'pump_label', pumpNozzles: 'pump_nozzles' };
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
    country: "SN",
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
        assignedWasherNames: row.assigned_washer_names || null,
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

    // Pompes à essence de la station (Paramètres > Pompistes & pompes, voir
    // add_station_pumps.sql) : proposées dans la page Pompistes pour poster un
    // pompiste chaque jour. L'affectation elle-même reste un LIBELLÉ figé
    // (pump_label) — retirer ou renommer une pompe ne réécrit pas l'historique.
    const [pumps, setPumps] = useState([]);
    const loadPumps = useCallback(async () => {
        if (!stationId || stationId === 'default') { setPumps([]); return; }
        // Les pistolets (add_pump_nozzles.sql) sont lus à part : si la table n'existe pas encore,
        // les pompes restent utilisables comme avant, sans pistolets.
        const [{ data }, { data: nozzleRows }] = await Promise.all([
            supabase.from('station_pumps').select('*').eq('station_id', stationId).order('created_at', { ascending: true }),
            supabase.from('pump_nozzles').select('*').eq('station_id', stationId),
        ]);
        const nozzlesOf = (pumpId) => sortNozzles((nozzleRows || []).filter((n) => n.pump_id === pumpId).map((n) => ({
            id: n.id, pumpId: n.pump_id, fuel: n.fuel, number: n.number, label: nozzleLabel(n.fuel, n.number),
        })));
        setPumps((data || []).map((r) => ({ id: r.id, name: r.name, active: r.active !== false, nozzles: nozzlesOf(r.id) })));
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

    // Dépenses (Comptabilité > carte "Dépenses") — même schéma que transactions.
    const [expenses, setExpenses] = useState([]);
    const loadExpenses = useCallback(async () => {
        if (!stationId || stationId === 'default') { setExpenses([]); return; }
        const { data } = await supabase.from('expenses').select('*').eq('station_id', stationId).order('created_at', { ascending: false });
        setExpenses((data || []).map((row) => ({ id: row.id, label: row.label, amount: row.amount, category: row.category, createdAt: row.created_at })));
    }, [stationId]);

    const addExpense = async ({ label, amount, category }) => {
        if (!stationId || stationId === 'default') return;
        await supabase.from('expenses').insert({ station_id: stationId, label, amount: parseInt(amount) || 0, category: category || 'Autre' });
        await loadExpenses();
    };

    // Avis clients de CETTE station — pour le "Score Qualité" d'Analytics.jsx.
    // `station_reviews` est déjà en lecture publique (voir schema.sql), ici on
    // se contente de la scoper à la station courante (Super Admin la lit déjà
    // toutes stations confondues via useSuperAdminState.jsx).
    const [reviews, setReviews] = useState([]);
    const loadReviews = useCallback(async () => {
        if (!stationId || stationId === 'default') { setReviews([]); return; }
        const { data } = await supabase.from('station_reviews').select('*').eq('station_id', stationId).order('created_at', { ascending: false });
        setReviews((data || []).map((row) => ({ id: row.id, rating: row.rating, comment: row.comment, clientName: row.client_name, createdAt: row.created_at })));
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

    // Reversements des lavages payés en ligne (Comptabilité > "Reversements") —
    // même table que Super Admin > Facturation (add_paydunya_per.sql +
    // add_manual_disbursement.sql), scopée à cette station. RLS restreint déjà
    // la lecture aux lignes de la station, `.eq('station_id', ...)` évite juste
    // un aller-retour inutile si jamais elle ne l'était pas. Écriture (marquer
    // réglé) réservée au Super Admin — la station est ici en lecture seule.
    const [lavagePayments, setLavagePayments] = useState([]);
    const loadLavagePayments = useCallback(async () => {
        if (!stationId || stationId === 'default') { setLavagePayments([]); return; }
        const { data } = await supabase.from('paiements_lavage').select('*').eq('station_id', stationId).order('created_at', { ascending: false });
        setLavagePayments((data || []).map((row) => ({
            id: row.id,
            montantTotal: row.montant_total,
            partStation: row.part_station,
            statutRedistribution: row.statut_redistribution,
            redistributionDetail: row.redistribution_detail,
            typeService: row.type_service || 'lavage',
            createdAt: row.created_at,
        })));
    }, [stationId]);

    // Rendez-vous vidange de la station (tous statuts, triés par créneau) —
    // voir add_vidange_feature.sql / src/pages/Admin/Vidange.jsx. Déclaré ici
    // (avant le useEffect principal ci-dessous qui l'appelle) et non plus bas
    // avec le reste de la config vidange : une const référencée dans une
    // dépendance de useEffect AVANT sa propre déclaration plante tout le
    // provider (temporal dead zone), pas juste un avertissement silencieux.
    const [vidangeBookings, setVidangeBookings] = useState([]);
    const loadVidangeBookings = useCallback(async () => {
        if (!stationId || stationId === 'default') { setVidangeBookings([]); return; }
        const { data } = await supabase.from('vidange_bookings').select('*').eq('station_id', stationId).order('scheduled_at', { ascending: true });
        setVidangeBookings((data || []).map((row) => ({
            id: row.id, clientName: row.client_name, vehicleLabel: row.vehicle_label, category: row.category,
            oilType: row.oil_type, filtreHuile: row.filtre_huile, filtreAir: row.filtre_air, mileage: row.mileage,
            scheduledAt: row.scheduled_at, amount: row.amount, paid: row.paid, paymentMethod: row.payment_method,
            status: row.status, createdAt: row.created_at,
        })));
    }, [stationId]);

    // Commandes boutique payées en ligne (add_shop_orders.sql) — même
    // remarque que loadVidangeBookings : déclaré avant le useEffect principal
    // qui le référence (TDZ sinon).
    const [shopOrders, setShopOrders] = useState([]);
    const loadShopOrders = useCallback(async () => {
        if (!stationId || stationId === 'default') { setShopOrders([]); return; }
        const { data } = await supabase.from('shop_orders').select('*').eq('station_id', stationId).order('created_at', { ascending: false });
        setShopOrders((data || []).map((row) => ({
            id: row.id, clientName: row.client_name, productName: row.product_name, unitPrice: row.unit_price,
            quantity: row.quantity, amount: row.amount, fulfillmentType: row.fulfillment_type,
            deliveryAddress: row.delivery_address, deliveryPhone: row.delivery_phone,
            paid: row.paid, paymentMethod: row.payment_method, status: row.status, createdAt: row.created_at,
        })));
    }, [stationId]);

    // Annonces (add_announcements.sql) — reçues : diffusions plateforme
    // (Super Admin -> toutes les stations), pas scopées à `stationId` — voir
    // client_knows_station_for_announcements/RLS, n'importe quel compte
    // station les voit. Envoyées : celles que CETTE station a diffusées à
    // ses clients, pour l'historique "Envoyées récemment" du composeur.
    const [receivedAnnouncements, setReceivedAnnouncements] = useState([]);
    const loadReceivedAnnouncements = useCallback(async () => {
        setReceivedAnnouncements(await loadPlatformAnnouncements());
    }, []);
    const [sentAnnouncements, setSentAnnouncements] = useState([]);
    const loadSentAnnouncements = useCallback(async () => {
        if (!stationId || stationId === 'default') { setSentAnnouncements([]); return; }
        const { data } = await supabase.from('announcements').select('*')
            .eq('scope', 'station_to_clients').eq('station_id', stationId)
            .order('created_at', { ascending: false }).limit(50);
        setSentAnnouncements((data || []).map((row) => ({
            id: row.id, title: row.title, message: row.message, createdAt: row.created_at,
            active: row.active !== false, targetClientIds: row.target_client_ids || [],
            audience: row.audience || 'all',
        })));
    }, [stationId]);
    const retireStationAnnouncement = async (id) => {
        await retireAnnouncement(id);
        await loadSentAnnouncements();
    };

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
        loadExpenses();
        loadReviews();
        loadEmployees();
        loadPumps();
        loadCustomVehicleTypes();
        loadShiftTemplates();
        loadStationAds();
        loadSubscriptions();
        loadLavagePayments();
        loadVidangeBookings();
        loadShopOrders();
        loadReceivedAnnouncements();
        loadSentAnnouncements();
        const refresh = () => { loadReservations(); loadTransactions(); loadExpenses(); loadReviews(); loadEmployees(); loadPumps(); loadCustomVehicleTypes(); loadShiftTemplates(); loadStationAds(); loadSubscriptions(); loadLavagePayments(); loadVidangeBookings(); loadShopOrders(); loadReceivedAnnouncements(); loadSentAnnouncements(); };
        window.addEventListener('focus', refresh);
        // `reservations`/`transactions`/`employees`/`expenses`/`station_reviews`
        // sont dans la publication supabase_realtime (voir schema.sql) : un
        // client qui réserve depuis son propre appareil, un pointage/assignation
        // de laveur, une dépense ajoutée depuis un autre poste ou un nouvel avis
        // apparaissent ici en direct, sans sonder toutes les 8s.
        // `custom_vehicle_types` n'y est pas encore (change trop rarement pour
        // en avoir besoin). Le setInterval restant sert de filet de sécurité
        // (une reconnexion Realtime manquée ne doit pas figer la file indéfiniment).
        const channel = (stationId && stationId !== 'default')
            ? supabase
                .channel(`station-live-${stationId}`)
                .on('postgres_changes', { event: '*', schema: 'public', table: 'reservations', filter: `station_id=eq.${stationId}` }, loadReservations)
                .on('postgres_changes', { event: '*', schema: 'public', table: 'transactions', filter: `station_id=eq.${stationId}` }, loadTransactions)
                .on('postgres_changes', { event: '*', schema: 'public', table: 'expenses', filter: `station_id=eq.${stationId}` }, loadExpenses)
                .on('postgres_changes', { event: '*', schema: 'public', table: 'station_reviews', filter: `station_id=eq.${stationId}` }, loadReviews)
                .on('postgres_changes', { event: '*', schema: 'public', table: 'employees', filter: `station_id=eq.${stationId}` }, loadEmployees)
                .on('postgres_changes', { event: '*', schema: 'public', table: 'paiements_lavage', filter: `station_id=eq.${stationId}` }, loadLavagePayments)
                .on('postgres_changes', { event: '*', schema: 'public', table: 'vidange_bookings', filter: `station_id=eq.${stationId}` }, loadVidangeBookings)
                .on('postgres_changes', { event: '*', schema: 'public', table: 'shop_orders', filter: `station_id=eq.${stationId}` }, loadShopOrders)
                .on('postgres_changes', { event: '*', schema: 'public', table: 'announcements' }, () => { loadReceivedAnnouncements(); loadSentAnnouncements(); })
                .subscribe()
            : null;
        const interval = setInterval(refresh, 45000);
        return () => { clearInterval(interval); window.removeEventListener('focus', refresh); if (channel) supabase.removeChannel(channel); };
    }, [loadReservations, loadTransactions, loadExpenses, loadReviews, loadEmployees, loadPumps, loadCustomVehicleTypes, loadShiftTemplates, loadStationAds, loadLavagePayments, loadVidangeBookings, loadShopOrders, loadReceivedAnnouncements, loadSentAnnouncements, stationId]);

    // Le profil de la station (nom, adresse, horaires...) est la même donnée
    // que le registre Super Admin (table `stations`) — plus de copie locale
    // séparée, pour ne jamais désynchroniser ce que voit l'admin de ce que
    // voit le registre/l'annuaire public (voir supabase/schema.sql).
    const [stationProfile, setStationProfile] = useState(defaultStationProfile);
    // Bandeau promo / réduction / code promo — même principe : colonne
    // `promo_config` de la même ligne `stations`, plus de copie locale séparée.
    const [promoConfig, setPromoConfig] = useState(DEFAULT_PROMO);
    // Facturation SaaS de la station (plan, essai, statut) — table séparée
    // `station_billing` (voir supabase/schema.sql), jamais lue avant : sert
    // à afficher la bannière d'essai (AdminLayout.jsx).
    const [stationBilling, setStationBilling] = useState(null);
    // Distinct de `!stationProfile.name` : sans ça, AdminLayout.jsx affiche
    // brièvement "⚙️ Configurer" (nom vide = état par défaut) le temps que la
    // requête Supabase réponde, même pour une station déjà configurée —
    // un vrai bug rapporté par l'utilisateur, pas juste un flash inoffensif.
    const [stationProfileLoaded, setStationProfileLoaded] = useState(false);
    // Rubriques masquées du menu latéral (Paramètres > Menu, voir lib/adminNav.js
    // et add_station_menu_prefs.sql). null = pas encore chargé -> valeur par
    // défaut. Recopié dans localStorage pour que le menu s'affiche du premier
    // coup sans que des rubriques n'apparaissent puis ne disparaissent.
    const hiddenMenuCacheKey = `ccg_hidden_menu_${stationId}`;
    const [hiddenMenu, setHiddenMenu] = useState(() => {
        try { const raw = localStorage.getItem(hiddenMenuCacheKey); return raw ? JSON.parse(raw) : null; } catch { return null; }
    });
    const rememberHiddenMenu = (list) => {
        setHiddenMenu(list);
        try { localStorage.setItem(hiddenMenuCacheKey, JSON.stringify(list)); } catch { /* stockage indisponible : sans effet */ }
    };
    const rowToProfile = (row) => ({
        name: row?.name || '',
        phone: row?.owner_phone || '',
        address: row?.address || '',
        quartier: row?.quartier || '',
        region: row?.region || '',
        country: row?.country || 'SN',
        openTime: row?.open_time || '08:00',
        closeTime: row?.close_time || '20:00',
        logo: row?.logo_url || null,
        cachet: row?.cachet_url || null,
        dailyRevenueTarget: row?.daily_revenue_target ?? 50000,
        vidangeEnabled: !!row?.vidange_enabled,
        vidangeSlotMinutes: row?.vidange_slot_minutes || 60,
        vidangeDailyCapacity: row?.vidange_daily_capacity || 1,
        vidangeFiltreHuilePrice: row?.vidange_filtre_huile_price ?? null,
        vidangeFiltreAirPrice: row?.vidange_filtre_air_price ?? null,
    });
    const rowToBilling = (row) => ({
        plan: row?.plan || 'Starter',
        activeModules: row?.active_modules || [],
        subscriptionStatus: row?.subscription_status || 'essai',
        trialEndsAt: row?.trial_ends_at || null,
        nextBillingDate: row?.next_billing_date || null,
        paydunyaAlias: row?.paydunya_account_alias || null,
    });
    useEffect(() => {
        setStationProfileLoaded(false);
        if (!stationId || stationId === 'default') { setStationProfile(defaultStationProfile); setPromoConfig(DEFAULT_PROMO); setStationBilling(null); setStationProfileLoaded(true); return; }
        let cancelled = false;
        supabase.from('stations').select('*, station_billing(*)').eq('id', stationId).single().then(({ data }) => {
            if (cancelled) return;
            setStationProfile(rowToProfile(data));
            setPromoConfig(data?.promo_config && Object.keys(data.promo_config).length > 0 ? data.promo_config : DEFAULT_PROMO);
            setStationBilling(rowToBilling(data?.station_billing));
            if (Array.isArray(data?.hidden_menu)) rememberHiddenMenu(data.hidden_menu);
            setStationProfileLoaded(true);
        });
        return () => { cancelled = true; };
    }, [stationId]);

    // ─── Permissions du compte connecté (gestion d'équipe, voir
    // add_station_team.sql + lib/permissions.js). Le propriétaire (role='admin')
    // et le super admin ont tout ('*'). Un collaborateur 'staff' hérite des
    // permissions de son rôle station. null = encore en chargement.
    const initialPerms = () => {
        const r = getCurrentRole();
        return (r === 'admin' || r === 'super_admin') ? ['*'] : null;
    };
    const [myPermissions, setMyPermissions] = useState(initialPerms);
    const [myRoleName, setMyRoleName] = useState('');
    useEffect(() => {
        const r = getCurrentRole();
        if (r === 'admin' || r === 'super_admin') { setMyPermissions(['*']); setMyRoleName('Propriétaire'); return; }
        if (r !== 'staff') { setMyPermissions([]); setMyRoleName(''); return; }
        let cancelled = false;
        (async () => {
            const { data: { user } } = await supabase.auth.getUser();
            if (cancelled || !user) return;
            const { data } = await supabase
                .from('station_members')
                .select('status, station_roles(name, permissions)')
                .eq('profile_id', user.id)
                .maybeSingle();
            if (cancelled) return;
            if (!data || data.status !== 'active') { setMyPermissions([]); setMyRoleName(''); return; }
            setMyPermissions(data.station_roles?.permissions || []);
            setMyRoleName(data.station_roles?.name || '');
        })();
        return () => { cancelled = true; };
    }, [stationId]);

    // Lu/non-lu des annonces (add_announcements.sql), propre au COMPTE
    // connecté (owner ou collaborateur — chacun sa propre ligne `profiles`),
    // pas à la station : même principe que dismissed_ad_ids côté
    // automobiliste (useClientAccount.jsx), juste un tableau d'ids ignorés.
    const [dismissedAnnouncementIds, setDismissedAnnouncementIds] = useState([]);
    useEffect(() => {
        let cancelled = false;
        (async () => {
            const { data: { user } } = await supabase.auth.getUser();
            if (cancelled || !user) return;
            const { data } = await supabase.from('profiles').select('dismissed_announcement_ids').eq('id', user.id).maybeSingle();
            if (!cancelled) setDismissedAnnouncementIds(data?.dismissed_announcement_ids || []);
        })();
        return () => { cancelled = true; };
    }, [stationId]);

    const dismissAnnouncement = async (id) => {
        if (dismissedAnnouncementIds.includes(id)) return;
        const next = [...dismissedAnnouncementIds, id];
        setDismissedAnnouncementIds(next);
        const { data: { user } } = await supabase.auth.getUser();
        if (user) await supabase.from('profiles').update({ dismissed_announcement_ids: next }).eq('id', user.id);
    };

    const sendStationAnnouncement = async (payload) => {
        if (!stationId || stationId === 'default') return;
        await sendStationAnnouncementApi(stationId, payload);
        await loadSentAnnouncements();
    };

    // Alimente le sélecteur de destinataires de AnnouncementForm (abonnés
    // avec compte + clients ayant réservé) — chargé à la demande, pas dans
    // la boucle de rafraîchissement globale.
    const loadStationKnownClients = useCallback(async () => {
        if (!stationId || stationId === 'default') return [];
        return await loadStationKnownClientsApi();
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

    // Grille tarifaire vidange — table séparée de wash_pricing (voir
    // add_vidange_feature.sql), pas de valeurs par défaut : {} tant que la
    // station n'a rien configuré (contrairement au lavage, la vidange est
    // opt-in, voir stationProfile.vidangeEnabled ci-dessous).
    const [vidangePricingConfig, setVidangePricingConfig] = useState({});
    const loadVidangePricingConfig = useCallback(async () => {
        if (!stationId || stationId === 'default') { setVidangePricingConfig({}); return; }
        const { data } = await supabase.from('vidange_pricing').select('*').eq('station_id', stationId);
        const pricing = {};
        (data || []).forEach((row) => { (pricing[row.category] ||= {})[row.oil_type] = row.price; });
        setVidangePricingConfig(pricing);
    }, [stationId]);
    useEffect(() => { loadVidangePricingConfig(); }, [loadVidangePricingConfig]);

    // Écrit la grille vidange complète (mêmes catégories que VIDANGE_CATEGORY_GRID),
    // upsert comme syncWashPricing — voir updatePricing plus bas.
    const updateVidangePricing = async (newConfig) => {
        setVidangePricingConfig(newConfig);
        if (!stationId || stationId === 'default') return;
        const rows = [];
        Object.entries(newConfig).forEach(([category, services]) => {
            Object.entries(services || {}).forEach(([oilType, price]) => {
                rows.push({ station_id: stationId, category, oil_type: oilType, price: parseInt(price, 10) || 0 });
            });
        });
        if (rows.length === 0) return;
        await supabase.from('vidange_pricing').upsert(rows, { onConflict: 'station_id,category,oil_type' });
    };

    // Activation + réglages vidange (créneaux, capacité, suppléments) — colonnes
    // directement sur `stations` (voir add_vidange_feature.sql), regroupées avec
    // le reste du profil station pour n'avoir qu'un seul chargement.
    const updateVidangeSettings = async (patch) => {
        setStationProfile((prev) => ({ ...prev, ...patch }));
        if (!stationId || stationId === 'default') return;
        await supabase.from('stations').update({
            vidange_enabled: patch.vidangeEnabled,
            vidange_slot_minutes: patch.vidangeSlotMinutes,
            vidange_daily_capacity: patch.vidangeDailyCapacity,
            vidange_filtre_huile_price: patch.vidangeFiltreHuilePrice,
            vidange_filtre_air_price: patch.vidangeFiltreAirPrice,
        }).eq('id', stationId);
    };

    const updateVidangeBookingStatus = async (id, status) => {
        await supabase.from('vidange_bookings').update({ status }).eq('id', id);
        await loadVidangeBookings();
    };

    const updateShopOrderStatus = async (id, status) => {
        await supabase.from('shop_orders').update({ status }).eq('id', id);
        await loadShopOrders();
    };

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

    // Signale au minuteur d'inactivité (lib/idleTimeout.js) qu'un lavage est
    // en cours : tant que le départ le plus récent est frais, la session ne
    // s'expire pas (le gérant est au travail). Écrit l'epoch du départ le plus
    // récent, ou efface la clé s'il n'y a plus de lavage en cours.
    useEffect(() => {
        try {
            const starts = activeWashes
                .map((w) => (w.startedAt ? new Date(w.startedAt).getTime() : 0))
                .filter((t) => t > 0);
            if (starts.length) localStorage.setItem('ccg_active_wash_since', String(Math.max(...starts)));
            else localStorage.removeItem('ccg_active_wash_since');
        } catch { /* stockage indisponible : le minuteur retombe sur son défaut */ }
    }, [activeWashes]);

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
                pumpLabel: row.pump_label, liters: row.liters, amountCollected: row.amount_collected,
                pumpNozzles: row.pump_nozzles || [], pumpLines: normalizeLines(row.pump_lines),
            };
        });
        // Fusion (et non remplacement) : pour aujourd'hui, une action de pointage
        // toute fraîche (recordDailyAttendance) n'est peut-être pas encore relue
        // par la base — l'entrée locale, plus récente, l'emporte champ par champ.
        setAttendanceHistory((prev) => {
            const local = prev[dateKey] || {};
            const merged = { ...local };
            Object.entries(dayEntries).forEach(([id, entry]) => { merged[id] = { ...entry, ...(local[id] || {}) }; });
            return { ...prev, [dateKey]: merged };
        });
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
                // name/role figés au moment du pointage — permettent d'inclure
                // dans l'export mensuel un employé supprimé depuis (voir
                // exportAttendanceToExcel dans Washers.jsx).
                name: row.name, role: row.role,
                // relevé de pompe (pompistes) — voir Pompistes.jsx
                pumpLabel: row.pump_label, liters: row.liters, amountCollected: row.amount_collected,
                pumpNozzles: row.pump_nozzles || [], pumpLines: normalizeLines(row.pump_lines),
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
    // Ne concerne que les rôles "Laveur" et "Pompiste" — `status` a un tout autre sens pour les
    // autres rôles (statut du compte dans la page Équipe, pas pointage du jour).
    useEffect(() => {
        const now = new Date();
        const localDateKey = (d) => new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
        const todayKey = localDateKey(now);
        const stale = employees.filter((e) =>
            (e?.role === 'Laveur' || e?.role === 'Pompiste') && e?.dailyStatus === 'present' && e?.clockInAt
            && localDateKey(new Date(e.clockInAt)) !== todayKey);
        if (stale.length === 0 || !stationId || stationId === 'default') return;

        // Clôture propre de la journée précédente AVANT la remise à zéro : si
        // le gérant a oublié de cliquer "Descendre", on ne perd pas la journée
        // travaillée dans le pointage. Heure de sortie estimée = heure de
        // fermeture de la station ce jour-là (à défaut 23:59). C'est une
        // estimation de rattrapage (cas "oubli") : le gérant peut corriger la
        // ligne du mois. Rien à voir avec l'arrêt du compteur en cours de
        // journée, qui lui n'a plus lieu à la fermeture (voir plus bas).
        const [ch, cm] = String(stationProfile?.closeTime || '23:59').split(':').map(Number);
        stale.forEach((e) => {
            if (e.clockOutAt) return; // déjà clôturé
            const clockInAt = new Date(e.clockInAt);
            const workDate = localDateKey(clockInAt);
            const endAt = new Date(clockInAt);
            if (!Number.isNaN(ch) && !Number.isNaN(cm)) endAt.setHours(ch, cm, 0, 0);
            else endAt.setHours(23, 59, 0, 0);
            if (endAt <= clockInAt) endAt.setHours(23, 59, 0, 0); // fermeture avant la prise de poste
            const mins = Math.max(0, Math.round((endAt.getTime() - clockInAt.getTime()) / 60000));
            const total = `${Math.floor(mins / 60)}h ${String(mins % 60).padStart(2, '0')}m`;
            supabase.from('attendance_records').upsert({
                station_id: stationId, employee_id: e.id, work_date: workDate,
                name: e.name, role: e.role, daily_status: 'present',
                clock_in: e.clockIn || null, clock_in_at: e.clockInAt,
                clock_out: endAt.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' }),
                clock_out_at: endAt.toISOString(), total_time: total,
            }, { onConflict: 'employee_id,work_date' }).then(() => {});
        });

        // Statut du nouveau jour : "Repos" (neutre) et non "Absent
        // (Injustifié)" — un laveur pas encore marqué présent est au repos, pas
        // en faute. Le gérant met "Absent (Injustifié)" à la main si besoin.
        supabase.from('employees').update({
            daily_status: 'repos', status: 'Repos', clock_in: null, clock_out: null, clock_in_at: null, clock_out_at: null, total_time: null,
        }).in('id', stale.map((e) => e.id)).then(() => loadEmployees());
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [employees.map((e) => `${e.id}:${e.dailyStatus}:${e.clockInAt || ''}`).join(','), stationProfile?.closeTime]);

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

    // Poste un pompiste sur une pompe pour un jour donné (aujourd'hui, ou un jour passé à
    // corriger), avec les pistolets qu'il tient (`pumpNozzles` = libellés « Essence 1 »…,
    // `undefined` = ne pas y toucher). L'upsert ne touche QUE pump_label et pump_nozzles :
    // le pointage et le relevé (litres, montant) de la même ligne restent intacts.
    const assignPump = async (employeeId, dateKey, pumpLabel, pumpNozzles) => {
        if (!stationId || stationId === 'default') return { success: false, error: 'no_station' };
        const emp = employees.find(e => e.id === employeeId);
        const known = attendanceHistory[dateKey]?.[employeeId];
        const label = (pumpLabel || '').trim() || null;
        const row = {
            station_id: stationId, employee_id: employeeId, work_date: dateKey,
            name: emp?.name ?? known?.name, role: emp?.role ?? known?.role, pump_label: label,
        };
        if (pumpNozzles !== undefined) row.pump_nozzles = pumpNozzles.length ? pumpNozzles : null;
        const { error } = await supabase.from('attendance_records').upsert(row, { onConflict: 'employee_id,work_date' });
        if (!error) {
            setAttendanceHistory((prev) => {
                const dayEntries = prev[dateKey] || {};
                const existing = dayEntries[employeeId] || { id: employeeId, name: emp?.name, role: emp?.role };
                return { ...prev, [dateKey]: { ...dayEntries, [employeeId]: { ...existing, pumpLabel: label, ...(pumpNozzles !== undefined ? { pumpNozzles } : {}) } } };
            });
        }
        return { success: !error, error };
    };

    const samePumpName = (a, b) => (a || '').trim().toLowerCase() === (b || '').trim().toLowerCase();
    // `nozzles` = pistolets cochés à la création : [{ fuel: 'essence'|'gasoil', number }].
    const addPump = async (rawName, nozzles = []) => {
        const name = (rawName || '').trim();
        if (!stationId || stationId === 'default') return { success: false, error: 'no_station' };
        if (!name) return { success: false, error: 'empty' };
        if (name.length > 40) return { success: false, error: 'too_long' };
        if (pumps.some((p) => samePumpName(p.name, name))) return { success: false, error: 'duplicate' };
        const taken = nozzlesTakenElsewhere(null, nozzles);
        if (taken) return { success: false, error: 'taken', holder: taken };
        const { data: created, error } = await supabase.from('station_pumps').insert({ station_id: stationId, name }).select('id').single();
        if (error) return { success: false, error: error.code === '23505' ? 'duplicate' : 'failed' };
        // La pompe existe déjà : si ses pistolets échouent, on le dit sans annuler la pompe
        // (le gérant les recoche via « Modifier les pistolets »).
        let nozzleError = null;
        if (nozzles.length > 0) {
            const { error: nErr } = await supabase.from('pump_nozzles').insert(
                nozzles.map((n) => ({ station_id: stationId, pump_id: created.id, fuel: n.fuel, number: n.number })),
            );
            if (nErr) nozzleError = 'nozzles_failed';
        }
        await loadPumps();
        return { success: true, error: nozzleError };
    };
    // Un pistolet appartient à UNE pompe : un pistolet déjà porté par une AUTRE pompe active ne peut
    // pas être coché ailleurs (celui d'une pompe retirée est libre : il change simplement de pompe).
    const nozzlesTakenElsewhere = (pumpId, picks) => {
        for (const pick of picks) {
            const holder = pumps.find((p) => p.id !== pumpId && p.active && p.nozzles.some((n) => n.fuel === pick.fuel && n.number === pick.number));
            if (holder) return holder.name;
        }
        return null;
    };
    // Remplace les pistolets d'une pompe par ceux cochés. Les relevés passés gardent leurs libellés.
    const setPumpNozzles = async (pumpId, picks) => {
        if (!stationId || stationId === 'default') return { success: false, error: 'no_station' };
        const pump = pumps.find((p) => p.id === pumpId);
        if (!pump) return { success: false, error: 'unknown' };
        const holder = nozzlesTakenElsewhere(pumpId, picks);
        if (holder) return { success: false, error: 'taken', holder };
        const wanted = new Set(picks.map((n) => nozzleKey(n.fuel, n.number)));
        const toRemove = pump.nozzles.filter((n) => !wanted.has(nozzleKey(n.fuel, n.number)));
        const toAdd = picks.filter((n) => !pump.nozzles.some((x) => x.fuel === n.fuel && x.number === n.number));
        if (toAdd.length > 0) {
            // Upsert : un pistolet resté sur une pompe retirée est repris par celle-ci.
            const { error } = await supabase.from('pump_nozzles').upsert(
                toAdd.map((n) => ({ station_id: stationId, pump_id: pumpId, fuel: n.fuel, number: n.number })),
                { onConflict: 'station_id,fuel,number' },
            );
            if (error) { await loadPumps(); return { success: false, error: 'failed' }; }
        }
        if (toRemove.length > 0) {
            const { error } = await supabase.from('pump_nozzles').delete().in('id', toRemove.map((n) => n.id));
            if (error) { await loadPumps(); return { success: false, error: 'failed' }; }
        }
        await loadPumps();
        return { success: true, error: null };
    };
    // Renommer : la pompe habituelle des pompistes et les affectations d'AUJOURD'HUI qui
    // portaient l'ancien nom suivent ; l'historique des jours passés reste figé.
    const renamePump = async (id, rawName) => {
        const name = (rawName || '').trim();
        const old = pumps.find((p) => p.id === id);
        if (!old) return { success: false, error: 'unknown' };
        if (!name) return { success: false, error: 'empty' };
        if (name.length > 40) return { success: false, error: 'too_long' };
        if (name === old.name) return { success: true, error: null };
        if (pumps.some((p) => p.id !== id && samePumpName(p.name, name))) return { success: false, error: 'duplicate' };
        const { error } = await supabase.from('station_pumps').update({ name }).eq('id', id);
        if (error) return { success: false, error: error.code === '23505' ? 'duplicate' : 'failed' };
        const now = new Date();
        const today = new Date(now.getTime() - now.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
        await Promise.all([
            supabase.from('employees').update({ pump_label: name }).eq('station_id', stationId).eq('pump_label', old.name),
            supabase.from('attendance_records').update({ pump_label: name }).eq('station_id', stationId).eq('work_date', today).eq('pump_label', old.name),
        ]);
        setAttendanceHistory((prev) => {
            const day = prev[today];
            if (!day) return prev;
            const next = {};
            Object.entries(day).forEach(([k, v]) => { next[k] = v.pumpLabel === old.name ? { ...v, pumpLabel: name } : v; });
            return { ...prev, [today]: next };
        });
        await Promise.all([loadPumps(), loadEmployees()]);
        return { success: true, error: null };
    };
    // « Retirer » = désactiver (jamais supprimer) : les relevés passés gardent leur libellé.
    const setPumpActive = async (id, active) => {
        const { error } = await supabase.from('station_pumps').update({ active }).eq('id', id);
        if (!error) await loadPumps();
        return { success: !error, error };
    };

    // Relevé de fin de journée d'un pompiste : pompe tenue, litres vendus, montant
    // encaissé (voir add_pompistes.sql). Vit sur la même ligne attendance_records
    // que son pointage — l'upsert ne touche QUE ces colonnes-là, donc ne peut pas
    // écraser le pointage. Contrairement à recordDailyAttendance, on attend la
    // réponse de la base avant de mettre le cache à jour : un montant affiché
    // "enregistré" alors qu'il ne l'est pas serait pire qu'un léger délai.
    // `dateKey` peut être un jour passé (correction d'un oubli).
    // Station avec pistolets : `lines` = [{ label, fuel, liters, amount }] (une par pistolet
    // renseigné) et `pumpNozzles` = pistolets tenus ce jour-là ; liters/amountCollected sont alors
    // la somme des lignes (la base la recalcule, voir le trigger de add_pump_nozzles.sql).
    // `undefined` = ne pas y toucher (station sans pistolets : rien de plus que l'ancien relevé).
    const savePumpReading = async (employeeId, dateKey, { pumpLabel, liters, amountCollected, lines, pumpNozzles }) => {
        if (!stationId || stationId === 'default') return { success: false, error: 'no_station' };
        const emp = employees.find(e => e.id === employeeId);
        const known = attendanceHistory[dateKey]?.[employeeId];
        const label = (pumpLabel || '').trim() || null;
        const detail = lines && lines.length > 0 ? lines : null;
        const row = {
            station_id: stationId, employee_id: employeeId, work_date: dateKey,
            name: emp?.name ?? known?.name, role: emp?.role ?? known?.role,
            pump_label: label, liters, amount_collected: amountCollected,
        };
        if (lines !== undefined) row.pump_lines = detail;
        if (pumpNozzles !== undefined) row.pump_nozzles = pumpNozzles.length ? pumpNozzles : null;
        const { error } = await supabase.from('attendance_records').upsert(row, { onConflict: 'employee_id,work_date' });
        if (!error) {
            setAttendanceHistory((prev) => {
                const dayEntries = prev[dateKey] || {};
                const existing = dayEntries[employeeId] || { id: employeeId, name: emp?.name, role: emp?.role };
                return {
                    ...prev,
                    [dateKey]: {
                        ...dayEntries,
                        [employeeId]: {
                            ...existing, pumpLabel: label, liters, amountCollected,
                            ...(lines !== undefined ? { pumpLines: detail } : {}),
                            ...(pumpNozzles !== undefined ? { pumpNozzles } : {}),
                        },
                    },
                };
            });
        }
        return { success: !error, error };
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
    const updateStationProfile = (rawP) => {
        // Un nom de station vide n'est jamais valide (la station affichait
        // "⚙️ Configurer" à la place de son nom partout, cause d'un vrai cas en
        // production) : si le champ est vidé ou ne contient que des espaces, on
        // garde le nom actuel plutôt que d'écraser la base avec du vide.
        const newP = { ...rawP, name: (rawP?.name || '').trim() || stationProfile?.name || '' };
        setStationProfile(newP);
        if (!stationId || stationId === 'default') return;
        supabase.from('stations').update({
            name: newP.name, owner_phone: newP.phone, address: newP.address, quartier: newP.quartier,
            region: newP.region, country: newP.country || 'SN', open_time: newP.openTime, close_time: newP.closeTime,
            logo_url: newP.logo, cachet_url: newP.cachet, daily_revenue_target: newP.dailyRevenueTarget,
        }).eq('id', stationId).then(() => {});
    };
    // Coche/décoche des rubriques du menu : appliqué tout de suite, sauvegardé en
    // tâche de fond (un échec ne bloque pas l'interface, le menu se recale sur la
    // base au prochain chargement).
    const updateHiddenMenu = (list) => {
        rememberHiddenMenu(list);
        if (!stationId || stationId === 'default') return;
        supabase.from('stations').update({ hidden_menu: list }).eq('id', stationId).then(() => {});
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
            pump_label: employeeData.pumpLabel || null,
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
        // Affichage optimiste : sans ça, le véhicule ajouté restait invisible
        // dans la file pendant tout l'aller-retour réseau (insert PUIS
        // re-fetch complet via loadReservations), donnant l'impression que
        // l'ajout n'avait rien fait — retiré/remplacé dès que loadReservations
        // recharge la vraie ligne (voir plus bas), ou retiré si l'insertion échoue.
        const tempId = `temp-${Date.now()}`;
        setQueue((prev) => [...prev, {
            id: tempId, status: 'attente', clientId: washData.clientId || null, client: washData.client,
            vehicle: washData.vehicle, category: washData.category, service: washData.service,
            paid, amount, createdAt: new Date().toISOString(),
        }]);
        supabase.from('reservations').insert({
            station_id: stationId, client_name: washData.client, vehicle_label: washData.vehicle,
            category: washData.category, service: washData.service, paid, amount, status: 'attente',
            // Reconnaissance par plaque (StationDashboard.jsx) : si ce client de
            // passage a déjà un compte automobiliste, on relie la réservation
            // pour qu'elle apparaisse en direct sur son tableau de bord.
            client_id: washData.clientId || null,
        }).select().single().then(async ({ data, error }) => {
            if (error) {
                console.error('addWash:', error);
                setQueue((prev) => prev.filter((q) => q.id !== tempId));
                alert("Impossible d'ajouter ce véhicule : " + error.message);
                return;
            }
            // Payé directement à l'ajout ("Payé d'avance") : il faut créer la
            // transaction ici (rien d'autre ne le fera jamais, contrairement au
            // flux "Encaisser" plus tard qui passe par validatePayment) — sinon
            // ce lavage n'apparaît jamais en Comptabilité/Transactions et ne
            // déduit jamais un abonnement même quand method serait 'Abonnement'.
            if (paid) {
                const { error: txError } = await supabase.from('transactions').insert({
                    station_id: stationId, reservation_id: data.id, client_id: washData.clientId || null,
                    client_name: washData.client, vehicle_label: washData.vehicle, service: washData.service,
                    method, amount,
                });
                if (txError) console.error('addWash (transaction):', txError);
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

    // Planning du JOUR chargé au démarrage — sert uniquement à l'arrêt
    // automatique ci-dessous (connaître l'heure de fin de poste PLANIFIÉE d'un
    // laveur). Le reste du planning (semaine/mois) se charge à la demande
    // depuis Washers.jsx.
    useEffect(() => {
        if (!stationId || stationId === 'default') return;
        const n = new Date();
        const key = new Date(n.getTime() - n.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
        loadScheduleRange(key, key);
    }, [stationId, loadScheduleRange]);

    // Arrêt automatique du compteur — UNIQUEMENT à l'heure de fin d'un créneau
    // PLANIFIÉ pour ce laveur ce jour-là (shift_templates.end_time via
    // scheduleByDate). C'est "l'heure de descente définie par la station".
    //
    // Il n'y a PLUS d'arrêt à l'heure de fermeture de la station : un laveur
    // sans créneau planifié voit son temps tourner tant que le gérant n'a pas
    // cliqué "Descendre" — y compris si la page est rechargée ou la session
    // interrompue (le temps = now - clockInAt, recalculé à chaque affichage,
    // il ne "s'arrête" jamais tout seul). Le cas "gérant qui oublie" est
    // rattrapé au changement de jour par la réinitialisation quotidienne
    // ci-dessus, qui clôture proprement la journée avant de remettre à zéro.
    //
    // "Terminé" et pas "Fin de service" : "Fin de service" est définitif et
    // sans bouton dans Washers.jsx — l'arrêt auto masquerait alors "Reprendre
    // service"/"Fin de service" dont le gérant a besoin. "Terminé" garde ces
    // boutons : l'arrêt ne fait que figer le compteur, le gérant garde la main.
    //
    // Vérifié au montage puis chaque minute — pas de tâche serveur sur ce projet.
    useEffect(() => {
        const checkAutoClockOut = () => {
            if (!stationId || stationId === 'default') return;
            const now = new Date();
            const localDateKey = (d) => new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
            const todayKey = localDateKey(now);

            employees
                .filter((e) => e.role === 'Laveur' && e.status === 'Actif' && e.clockInAt
                    && localDateKey(new Date(e.clockInAt)) === todayKey)
                .forEach((w) => {
                    // Uniquement si un créneau lui est assigné aujourd'hui.
                    const tplId = scheduleByDate?.[todayKey]?.[w.id];
                    const tpl = tplId ? shiftTemplates.find((t) => t.id === tplId) : null;
                    if (!tpl?.endTime) return; // pas de créneau -> jamais d'arrêt auto
                    const [h, m] = String(tpl.endTime).split(':').map(Number);
                    if (Number.isNaN(h) || Number.isNaN(m)) return;
                    const cutoffAt = new Date(now);
                    cutoffAt.setHours(h, m, 0, 0);
                    if (now < cutoffAt) return; // pas encore l'heure de fin de poste
                    const clockInAt = new Date(w.clockInAt);
                    const totalMinutes = Math.max(0, Math.round((cutoffAt.getTime() - clockInAt.getTime()) / 60000));
                    const total = `${Math.floor(totalMinutes / 60)}h ${String(totalMinutes % 60).padStart(2, '0')}m`;
                    const display = cutoffAt.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
                    const patch = { status: 'Terminé', clockOut: display, clockOutAt: cutoffAt.toISOString(), totalTime: total };
                    updateEmployee(w.id, patch);
                    recordDailyAttendance(w.id, patch);
                });
        };
        checkAutoClockOut();
        const interval = setInterval(checkAutoClockOut, 60000);
        return () => clearInterval(interval);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [employees.map((e) => `${e.id}:${e.status}:${e.clockInAt || ''}`).join(','), stationId, scheduleByDate, shiftTemplates]);

    // employeeIdOrIds accepte un seul id (lavage classique) ou un tableau de
    // 2-3 ids (véhicule volumineux — bus/camion, voir handleGoClick dans
    // StationDashboard.jsx) : plusieurs laveurs se partagent alors le même
    // lavage. assigned_to_name garde le premier laveur (compat Analytics/
    // historique), assigned_washer_names ne contient une valeur QUE s'il y en
    // a plusieurs.
    // Un id "temp-..." est une ligne optimiste d'addWash pas encore remplacée
    // par la vraie ligne Supabase (voir addWash) — la fenêtre est courte (un
    // aller-retour réseau) mais un update dessus ne toucherait aucune ligne
    // réelle en base, sans erreur ni effet visible : on bloque plutôt que de
    // laisser le gérant croire que son clic n'a rien fait.
    const isPendingTempId = (id) => {
        if (typeof id === 'string' && id.startsWith('temp-')) {
            alert("Ce véhicule est en cours d'ajout, patientez un instant avant de réessayer.");
            return true;
        }
        return false;
    };

    const startWash = (id, employeeIdOrIds) => {
        if (isPendingTempId(id)) return;
        const ids = Array.isArray(employeeIdOrIds) ? employeeIdOrIds : [employeeIdOrIds];
        const emps = ids.map(eid => (employees || []).find(e => e.id === eid)).filter(Boolean);
        const names = emps.map(e => e.name);
        supabase.from('reservations').update({
            status: 'en_cours',
            assigned_to_name: names[0] || 'Inconnu',
            assigned_washer_names: names.length > 1 ? names : null,
            started_at: new Date().toISOString(),
        }).eq('id', id).then(() => loadReservations());

        emps.forEach(emp => { if (emp.status === 'Terminé') resumeEmployee(emp.id); });
    };

    const endWash = (id) => {
        supabase.from('reservations').update({
            status: 'termine', completed_at: new Date().toISOString(),
        }).eq('id', id).then(() => loadReservations());
    };

    const skipWash = (id) => {
        if (isPendingTempId(id)) return;
        supabase.from('reservations').update({ status: 'annule' }).eq('id', id).then(() => loadReservations());
    };

    // Recule un véhicule payé en ligne (Wave/Orange Money) d'une place dans la
    // file, quand le client tarde à venir — règle : ces réservations gardent
    // leur ticket payé au lieu d'être annulées, elles cèdent juste leur tour.
    // La position vient du tri par `created_at` (voir loadReservations), donc
    // "reculer d'un rang" = échanger le created_at avec le véhicule suivant —
    // ça garde l'ordre cohérent partout ailleurs (estimation d'attente côté
    // client, file admin) sans avoir besoin d'une colonne de position dédiée.
    // L'échange lui-même passe par une fonction Postgres atomique (voir
    // add_station_push_back_rpc.sql) — deux `update` séparés depuis le
    // navigateur pouvaient laisser l'ordre incohérent en cas de coupure
    // réseau pile entre les deux.
    const pushBackOnePosition = (id) => {
        const idx = queue.findIndex((q) => q.id === id);
        if (idx === -1 || idx >= queue.length - 1) return;
        supabase.rpc('station_push_back_one_position', { p_reservation_id: id })
            .then(({ error }) => { if (error) console.error('pushBackOnePosition:', error); })
            .finally(() => loadReservations());
    };

    const validatePayment = (id) => {
        if (isPendingTempId(id)) return;
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

        supabase.from('reservations').update({ paid: true, amount }).eq('id', id).select().then(async ({ data, error }) => {
            if (error || !data || data.length === 0) {
                console.error('validatePayment:', error || 'aucune ligne mise à jour');
                alert("Impossible de valider ce paiement, réessayez : " + (error?.message || 'la réservation est introuvable.'));
                loadReservations();
                return;
            }
            const { error: txError } = await supabase.from('transactions').insert({
                station_id: stationId, reservation_id: id, client_id: item.clientId || null, client_name: item.client, vehicle_label: item.vehicle,
                service: item.service, method, amount,
            });
            if (txError) console.error('validatePayment (transaction):', txError);
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

        // 2. Profil station : réinitialiser téléphone/adresse s'ils portent
        // encore les valeurs de démo. Le nom, lui, n'est plus jamais vidé (un
        // nom vide est refusé, voir updateStationProfile) : s'il vaut encore
        // le nom de démo, on le signale simplement pour que l'admin le change.
        const hasDemoPhone = DEMO_STATION_PHONE === stationProfile?.phone;
        const hasDemoAddress = stationProfile?.address === 'Plateau, Dakar';
        if (hasDemoPhone || hasDemoAddress) {
            updateStationProfile({ ...stationProfile, phone: hasDemoPhone ? '' : stationProfile.phone, address: hasDemoAddress ? '' : stationProfile.address });
            cleaned.push('Téléphone/adresse fictifs effacés (à reconfigurer dans Paramètres)');
        }
        if (stationProfile?.name === DEMO_STATION_NAME) {
            cleaned.push(`Le nom de la station est encore « ${DEMO_STATION_NAME} » (nom fictif) — à remplacer dans Paramètres`);
        }

        return cleaned;
    };

    // Vide la file, l'historique et les transactions de LA STATION COURANTE
    // uniquement (profil et tarifs conservés). Ne touche pas aux autres stations.
    const resetOperationalData = () => {
        if (!stationId || stationId === 'default') return;
        supabase.from('reservations').delete().eq('station_id', stationId).then(() => loadReservations());
        supabase.from('transactions').delete().eq('station_id', stationId).then(() => loadTransactions());
        supabase.from('expenses').delete().eq('station_id', stationId).then(() => loadExpenses());
    };

    // Réinitialisation complète de LA STATION COURANTE uniquement (profil,
    // tarifs, employés, historique). Les autres stations et les registres
    // Super Admin / comptes automobilistes ne sont pas affectés.
    const resetStationCompletely = () => {
        updateStationProfile(defaultStationProfile);
        if (stationId && stationId !== 'default') {
            supabase.from('wash_pricing').delete().eq('station_id', stationId).then(() => {});
            supabase.from('vidange_pricing').delete().eq('station_id', stationId).then(() => {});
            supabase.from('vidange_bookings').delete().eq('station_id', stationId).then(() => loadVidangeBookings());
            supabase.from('shop_orders').delete().eq('station_id', stationId).then(() => loadShopOrders());
            supabase.from('stations').update({ promo_config: {}, vidange_enabled: false }).eq('id', stationId).then(() => {});
            supabase.from('reservations').delete().eq('station_id', stationId).then(() => loadReservations());
            supabase.from('transactions').delete().eq('station_id', stationId).then(() => loadTransactions());
            supabase.from('expenses').delete().eq('station_id', stationId).then(() => loadExpenses());
            supabase.from('employees').delete().eq('station_id', stationId).then(() => {});
            supabase.from('station_pumps').delete().eq('station_id', stationId).then(() => setPumps([]));
            supabase.from('attendance_records').delete().eq('station_id', stationId).then(() => {});
        }
        window.location.reload();
    };

    return (
        <AppStateContext.Provider value={{
            queue, activeWashes, employees, transactions, expenses, addExpense, reviews, pricingConfig, durationConfig, promoConfig, stationProfile, stationProfileLoaded, stationBilling, completedWashes,
            myPermissions, myRoleName,
            attendanceHistory, recordDailyAttendance, savePumpReading, assignPump, loadAttendanceForDate, loadAttendanceForMonth,
            pumps, addPump, renamePump, setPumpActive, setPumpNozzles,
            hiddenMenu, updateHiddenMenu,
            customVehicleTypes, addCustomVehicleType,
            shiftTemplates, addShiftTemplate, updateShiftTemplate, deleteShiftTemplate,
            scheduleByDate, loadScheduleRange, setShiftForDay,
            clientSubscriptions, clientSubscriptionInvoices, addClientSubscription, deleteClientSubscription, updateSubscriptionStatus, generateSubscriptionInvoice, markSubscriptionInvoicePaid, rechargeSubscription,
            stationAds, loadStationAds,
            lavagePayments,
            vidangePricingConfig, updateVidangePricing, updateVidangeSettings,
            vidangeBookings, updateVidangeBookingStatus,
            shopOrders, updateShopOrderStatus,
            receivedAnnouncements, sentAnnouncements, dismissedAnnouncementIds, dismissAnnouncement, sendStationAnnouncement, retireStationAnnouncement, loadStationKnownClients,
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
