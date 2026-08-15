import React, { createContext, useContext, useState, useEffect } from 'react';
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
const defaultQueue = []; // Aucun véhicule de démo

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
const DEMO_CLIENT_NAMES  = ['Amadou D.', 'Fatou S.', 'Oumar N.'];
const DEMO_EMPLOYEE_NAMES = ['Moussa Diop', 'Alioune Fall'];
const DEMO_STATION_NAME  = 'Auto Clean VIP';
const DEMO_STATION_PHONE = '+221 77 000 00 00';

const AppStateContext = createContext(null);

export function AppStateProvider({ children }) {
    const stationId = getCurrentStationId();

    const [queue, setQueue] = useState(() => loadNamespaced('washQueue', stationId, defaultQueue));
    const [activeWashes, setActiveWashes] = useState(() => loadNamespaced('activeWashes', stationId, []));
    const [employees, setEmployees] = useState(() => loadNamespaced('washEmployees', stationId, defaultEmployees));
    const [transactions, setTransactions] = useState(() => loadNamespaced('washTransactions', stationId, []));
    const [pricingConfig, setPricingConfig] = useState(() => loadNamespaced('washPricingConfig', stationId, defaultPricing));
    const [durationConfig, setDurationConfig] = useState(() => loadNamespaced('washDurationConfig', stationId, defaultDuration));
    const [promoConfig, setPromoConfig] = useState(() => loadNamespaced('promoConfig', stationId, DEFAULT_PROMO));
    const [completedWashes, setCompletedWashes] = useState(() => loadNamespaced('completedWashes', stationId, []));

    // Le profil de la station (nom, adresse, horaires...) est la même donnée
    // que le registre Super Admin (table `stations`) — plus de copie locale
    // séparée, pour ne jamais désynchroniser ce que voit l'admin de ce que
    // voit le registre/l'annuaire public (voir supabase/schema.sql).
    const [stationProfile, setStationProfile] = useState(defaultStationProfile);
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
        if (!stationId || stationId === 'default') { setStationProfile(defaultStationProfile); return; }
        let cancelled = false;
        supabase.from('stations').select('*').eq('id', stationId).single().then(({ data }) => {
            if (!cancelled) setStationProfile(rowToProfile(data));
        });
        return () => { cancelled = true; };
    }, [stationId]);
    // Historique de pointage par jour : { "2026-08-12": { [employeeId]: { name, role, dailyStatus, status, clockIn, clockOut, totalTime... } } }
    // Alimenté au fil de l'eau à chaque action de pointage du jour (voir recordDailyAttendance),
    // pour permettre de consulter qui a travaillé et combien d'heures à une date passée (page Laveurs).
    const [attendanceHistory, setAttendanceHistory] = useState(() => loadNamespaced('attendanceHistory', stationId, {}));

    // La file, les lavages en cours et les transactions peuvent aussi être écrits
    // par un CLIENT (réservation depuis son propre onglet/appareil, via
    // addToStationQueue/addStationTransaction dans stationData.js) — pas
    // seulement par l'admin via les setters ci-dessous. Sans resynchronisation,
    // une réservation client faite après le chargement de cette page restait
    // invisible tant que l'admin ne rafraîchissait pas manuellement. Même
    // mécanisme (poll + storage + focus) que Client/Dashboard.jsx.
    useEffect(() => {
        const refresh = () => {
            setQueue(loadNamespaced('washQueue', stationId, defaultQueue));
            setActiveWashes(loadNamespaced('activeWashes', stationId, []));
            setTransactions(loadNamespaced('washTransactions', stationId, []));
        };
        const interval = setInterval(refresh, 8000);
        window.addEventListener('storage', refresh);
        window.addEventListener('focus', refresh);
        return () => {
            clearInterval(interval);
            window.removeEventListener('storage', refresh);
            window.removeEventListener('focus', refresh);
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [stationId]);

    const updateQueue = (newQ) => { setQueue(newQ); localStorage.setItem(keyFor('washQueue', stationId), JSON.stringify(newQ)); };
    const updateActiveWashes = (newAW) => { setActiveWashes(newAW); localStorage.setItem(keyFor('activeWashes', stationId), JSON.stringify(newAW)); };
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
    const updateTransactions = (newT) => { setTransactions(newT); localStorage.setItem(keyFor('washTransactions', stationId), JSON.stringify(newT)); };
    const updatePricing = (newP) => { setPricingConfig(newP); localStorage.setItem(keyFor('washPricingConfig', stationId), JSON.stringify(newP)); };
    const updateDuration = (newD) => { setDurationConfig(newD); localStorage.setItem(keyFor('washDurationConfig', stationId), JSON.stringify(newD)); };
    const updatePromo = (newPr) => { setPromoConfig(newPr); localStorage.setItem(keyFor('promoConfig', stationId), JSON.stringify(newPr)); };
    const updateStationProfile = (newP) => {
        setStationProfile(newP);
        if (!stationId || stationId === 'default') return;
        supabase.from('stations').update({
            name: newP.name, owner_phone: newP.phone, address: newP.address, quartier: newP.quartier,
            region: newP.region, open_time: newP.openTime, close_time: newP.closeTime,
            logo_url: newP.logo, cachet_url: newP.cachet,
        }).eq('id', stationId).then(() => {});
    };
    const updateCompletedWashes = (newC) => { setCompletedWashes(newC); localStorage.setItem(keyFor('completedWashes', stationId), JSON.stringify(newC)); };

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
        updateQueue([...queue, { id: Date.now(), status: 'attente', ...washData }]);
    };

    const startWash = (id, employeeId) => {
        const itemIndex = queue.findIndex(q => q.id === id);
        if (itemIndex > -1) {
            const item = queue[itemIndex];
            const newQ = [...queue];
            newQ.splice(itemIndex, 1);
            
            const emp = (employees || []).find(e => e.id === parseInt(employeeId));
            const newActive = [...activeWashes, { ...item, status: 'en_cours', assignedTo: emp ? emp.name : 'Inconnu', startedAt: new Date().toISOString() }];
            
            updateQueue(newQ);
            updateActiveWashes(newActive);
        }
    };

    const endWash = (id) => {
        const itemIndex = activeWashes.findIndex(q => q.id === id);
        if (itemIndex > -1) {
            const item = activeWashes[itemIndex];
            const newActive = [...activeWashes];
            newActive.splice(itemIndex, 1);
            updateActiveWashes(newActive);
            
            // Add to completed history
            const now = new Date();
            const timeString = `${now.getHours().toString().padStart(2, '0')}:${now.getMinutes().toString().padStart(2, '0')}`;
            // `completedAtISO` (horodatage complet) permet de filtrer l'historique
            // par date — `completedAt` reste le texte HH:MM affiché tel quel.
            updateCompletedWashes([{ ...item, status: 'termine', completedAt: timeString, completedAtISO: now.toISOString() }, ...completedWashes]);
        }
    };
    
    const skipWash = (id) => {
        const itemIndex = queue.findIndex(q => q.id === id);
        if (itemIndex > -1) {
            const newQ = [...queue];
            newQ.splice(itemIndex, 1);
            updateQueue(newQ);
        }
    };

    const validatePayment = (id) => {
        let item = queue.find(q => q.id === id);
        let inQueue = true;
        if (!item) {
            item = activeWashes.find(w => w.id === id);
            inQueue = false;
        }
        if (!item || item.paid) return;

        const cat = item.category || "Particulier";
        // Si le prix a déjà été figé à la réservation (ex: côté client, avec un
        // éventuel code promo appliqué), on le respecte plutôt que de le
        // recalculer — sinon on applique la réduction en cours de la station.
        const basePrice = (pricingConfig[cat] && pricingConfig[cat][item.service]) ? pricingConfig[cat][item.service] : 2500;
        const amount = item.amount != null ? item.amount : applyDiscount(promoConfig, cat, item.service, basePrice);

        item.paid = true;
        if (inQueue) {
            updateQueue([...queue]);
        } else {
            updateActiveWashes([...activeWashes]);
        }

        const now = new Date();
        const timeString = `${now.getHours().toString().padStart(2, '0')}:${now.getMinutes().toString().padStart(2, '0')}`;
        const newTx = {
            id: Date.now(),
            date: `Aujourd'hui, ${timeString}`,
            client: item.client || "Client",
            service: item.service,
            method: "Espèces",
            amount: amount
        };
        updateTransactions([newTx, ...transactions]);
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

        // 1. File d'attente : retirer les véhicules de démo
        const cleanQ = queue.filter(item => !DEMO_CLIENT_NAMES.includes(item.client));
        if (cleanQ.length !== queue.length) {
            updateQueue(cleanQ);
            cleaned.push(`${queue.length - cleanQ.length} véhicule(s) fictif(s) retiré(s) de la file`);
        }

        // 2. Lavages actifs : retirer les véhicules de démo en cours
        const cleanActive = activeWashes.filter(item => !DEMO_CLIENT_NAMES.includes(item.client));
        if (cleanActive.length !== activeWashes.length) {
            updateActiveWashes(cleanActive);
            cleaned.push(`${activeWashes.length - cleanActive.length} lavage(s) fictif(s) en cours retiré(s)`);
        }

        // 3. Historique terminé : retirer les entrées de démo
        const cleanCompleted = completedWashes.filter(item => !DEMO_CLIENT_NAMES.includes(item.client));
        if (cleanCompleted.length !== completedWashes.length) {
            updateCompletedWashes(cleanCompleted);
            cleaned.push(`${completedWashes.length - cleanCompleted.length} historique(s) fictif(s) supprimé(s)`);
        }

        // 4. Transactions : retirer celles liées aux clients de démo
        const cleanTx = transactions.filter(tx => !DEMO_CLIENT_NAMES.includes(tx.client));
        if (cleanTx.length !== transactions.length) {
            updateTransactions(cleanTx);
            cleaned.push(`${transactions.length - cleanTx.length} transaction(s) fictive(s) supprimée(s)`);
        }

        // 5. Employés : retirer Moussa Diop et Alioune Fall s'ils existent
        const cleanEmps = employees.filter(emp => !DEMO_EMPLOYEE_NAMES.includes(emp.name));
        if (cleanEmps.length !== employees.length) {
            updateEmployees(cleanEmps);
            cleaned.push(`${employees.length - cleanEmps.length} employé(s) fictif(s) supprimé(s)`);
        }

        // 6. Profil station : réinitialiser si toujours le nom de démo
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
        updateQueue([]);
        updateActiveWashes([]);
        updateCompletedWashes([]);
        updateTransactions([]);
    };

    // Réinitialisation complète de LA STATION COURANTE uniquement (profil,
    // tarifs, employés, historique). Les autres stations et les registres
    // Super Admin / comptes automobilistes ne sont pas affectés.
    const resetStationCompletely = () => {
        ['washQueue', 'activeWashes', 'washEmployees', 'washTransactions', 'washPricingConfig', 'washDurationConfig', 'completedWashes', 'attendanceHistory']
            .forEach(base => localStorage.removeItem(keyFor(base, stationId)));
        updateStationProfile(defaultStationProfile);
        window.location.reload();
    };

    return (
        <AppStateContext.Provider value={{
            queue, activeWashes, employees, transactions, pricingConfig, durationConfig, promoConfig, stationProfile, completedWashes,
            attendanceHistory, recordDailyAttendance,
            addWash, startWash, endWash, skipWash, validatePayment, updatePricing, updateEmployees, getEstimatedWaitTime,
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
