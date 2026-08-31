import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import * as XLSX from 'xlsx';
import { Card, CardContent } from '../../components/ui/Card';
import { Badge } from '../../components/ui/Badge';
import { CheckCircle2, Clock, XCircle, Search, Droplets, Download, Calendar, Loader2, ChevronLeft, ChevronRight, Settings2, FileSpreadsheet, Edit2, Trash2, X, Eye } from 'lucide-react';
import { useAppState } from '../../hooks/useAppState';
import { isPastClosingTime } from '../../lib/stationData';
import { useDocumentTitle } from '../../lib/useDocumentTitle';

// Formate une durée en minutes en "Xh YYm" (ex: 8h 02m) pour le pointage.
function formatMinutesToHM(totalMinutes) {
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  return `${hours}h ${String(minutes).padStart(2, '0')}m`;
}
// Formate un écart entre deux dates en "Xh YYm".
function formatWorkedTime(startIso, end) {
  if (!startIso) return '0h 00m';
  const totalMinutes = Math.max(0, Math.round((end.getTime() - new Date(startIso).getTime()) / 60000));
  return formatMinutesToHM(totalMinutes);
}
// Chemin inverse : relit une durée déjà formatée ("8h 02m", telle que stockée
// dans attendance_records.total_time) pour pouvoir la resommer sur un mois.
function parseDurationToMinutes(str) {
  const m = /(\d+)\s*h\s*(\d+)\s*m/.exec(str || '');
  return m ? parseInt(m[1], 10) * 60 + parseInt(m[2], 10) : 0;
}

// Clé du jour au format YYYY-MM-DD (fuseau local), utilisée pour indexer
// l'historique de pointage et comparer à la date sélectionnée dans le calendrier.
function dateKey(d) {
  const tzOffsetMs = d.getTimezoneOffset() * 60000;
  return new Date(d.getTime() - tzOffsetMs).toISOString().slice(0, 10);
}
function todayKey() { return dateKey(new Date()); }

// ─── Planning de poste (prévisionnel, indépendant du pointage ci-dessus) ──
const SHIFT_COLOR_PALETTE = ['#3b82f6', '#10b981', '#f59e0b', '#a855f7', '#ef4444', '#06b6d4'];

// Lundi comme premier jour de semaine.
function startOfWeek(d) {
  const date = new Date(d);
  date.setHours(0, 0, 0, 0);
  const day = (date.getDay() + 6) % 7;
  date.setDate(date.getDate() - day);
  return date;
}
// Liste des dates (objets Date) de la période affichée : 7 jours si 'week',
// tous les jours du mois si 'month'.
function getPeriodDates(anchor, view) {
  if (view === 'week') {
    const start = startOfWeek(anchor);
    return Array.from({ length: 7 }, (_, i) => new Date(start.getTime() + i * 86400000));
  }
  const year = anchor.getFullYear();
  const month = anchor.getMonth();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  return Array.from({ length: daysInMonth }, (_, i) => new Date(year, month, i + 1));
}

// Statut de pointage effectif : un laveur créé (ou dont le statut de compte est
// "Actif" par défaut) mais qui n'a encore jamais pointé n'est pas réellement en
// train de travailler — on l'affiche "Absent" tant qu'il n'a pas cliqué sur
// "Prise de poste", sinon le bouton n'apparaîtrait jamais pour lui.
function resolvePointageStatus(member) {
  if (member.status === 'Actif' && !member.clockInAt) return 'Absent';
  return member.status || 'Absent';
}

// Cellule "Temps de travail" — statique une fois la journée terminée, mise à
// jour en direct (toutes les 30s) tant que le laveur est activement au poste
// ET que c'est la journée en cours (`live`) — on ne recalcule jamais un écart
// par rapport à "maintenant" pour un jour passé consulté dans l'historique.
function WorkedTimeCell({ member, status, live }) {
  const [, tick] = useState(0);
  const canTickLive = live && status === 'Actif' && !!member.clockInAt;
  React.useEffect(() => {
    if (!canTickLive) return;
    const id = setInterval(() => tick(t => t + 1), 30000);
    return () => clearInterval(id);
  }, [canTickLive]);

  if (member.totalTime) return <span>{member.totalTime}</span>;
  if (canTickLive) {
    return <span className="text-emerald-400">{formatWorkedTime(member.clockInAt, new Date())}</span>;
  }
  return <span className="text-neutral-600 font-normal">-</span>;
}

const STATUS_LETTER = { repos: 'R', conge: 'C', maladie: 'M', absent: 'A' };

export default function Washers() {
  useDocumentTitle('Laveurs');
  const {
    employees, updateEmployee, resumeEmployee, finishService, attendanceHistory, recordDailyAttendance, loadAttendanceForDate, loadAttendanceForMonth,
    shiftTemplates, addShiftTemplate, updateShiftTemplate, deleteShiftTemplate, scheduleByDate, loadScheduleRange, setShiftForDay, stationProfile
  } = useAppState();
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedDate, setSelectedDate] = useState(todayKey());
  const [exporting, setExporting] = useState(false);
  const isToday = selectedDate === todayKey();

  // L'historique d'une date passée n'est chargé qu'à la demande (aujourd'hui
  // est déjà tenu à jour en direct via recordDailyAttendance).
  React.useEffect(() => {
    if (!isToday) loadAttendanceForDate(selectedDate);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedDate, isToday]);

  const washersList = (employees || []).filter(e => e?.role === 'Laveur');

  // ─── Planning de poste (prévisionnel) ────────────────────────────────────
  const [planningView, setPlanningView] = useState('week'); // 'week' | 'month'
  const [planningAnchor, setPlanningAnchor] = useState(new Date());
  const [showShiftTemplatesModal, setShowShiftTemplatesModal] = useState(false);
  const [editingTemplateId, setEditingTemplateId] = useState(null);
  const [templateForm, setTemplateForm] = useState({ label: '', startTime: '08:00', endTime: '14:00', color: SHIFT_COLOR_PALETTE[0] });

  const periodDates = getPeriodDates(planningAnchor, planningView);
  const periodLabel = planningView === 'week'
    ? `${periodDates[0].toLocaleDateString('fr-FR', { day: '2-digit', month: 'short' })} — ${periodDates[6].toLocaleDateString('fr-FR', { day: '2-digit', month: 'short', year: 'numeric' })}`
    : planningAnchor.toLocaleDateString('fr-FR', { month: 'long', year: 'numeric' });

  React.useEffect(() => {
    loadScheduleRange(dateKey(periodDates[0]), dateKey(periodDates[periodDates.length - 1]));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [planningView, planningAnchor.getTime()]);

  const goPrevPeriod = () => setPlanningAnchor(prev => {
    const d = new Date(prev);
    if (planningView === 'week') d.setDate(d.getDate() - 7); else d.setMonth(d.getMonth() - 1);
    return d;
  });
  const goNextPeriod = () => setPlanningAnchor(prev => {
    const d = new Date(prev);
    if (planningView === 'week') d.setDate(d.getDate() + 7); else d.setMonth(d.getMonth() + 1);
    return d;
  });
  const goToTodayPeriod = () => setPlanningAnchor(new Date());

  const resetTemplateForm = () => { setEditingTemplateId(null); setTemplateForm({ label: '', startTime: '08:00', endTime: '14:00', color: SHIFT_COLOR_PALETTE[0] }); };
  const openShiftTemplatesModal = () => { resetTemplateForm(); setShowShiftTemplatesModal(true); };
  const openEditTemplate = (t) => { setEditingTemplateId(t.id); setTemplateForm({ label: t.label, startTime: t.startTime, endTime: t.endTime, color: t.color }); };
  // Supprimer un créneau supprime en cascade (côté base) toutes les cases du
  // planning qui l'utilisaient — sans ce rafraîchissement, scheduleByDate
  // gardait ces cases en cache avec un shiftTemplateId qui n'existe plus,
  // laissant leur <select> dans un état incohérent (valeur sans <option>
  // correspondante) tant que l'utilisateur ne changeait pas de semaine/mois.
  const handleDeleteTemplate = async (id) => {
    await deleteShiftTemplate(id);
    if (editingTemplateId === id) resetTemplateForm();
    loadScheduleRange(dateKey(periodDates[0]), dateKey(periodDates[periodDates.length - 1]));
  };
  const submitTemplate = (e) => {
    e.preventDefault();
    if (!templateForm.label.trim()) return;
    if (editingTemplateId) updateShiftTemplate(editingTemplateId, templateForm); else addShiftTemplate(templateForm);
    resetTemplateForm();
  };

  // Feuille Excel (.xlsx, via SheetJS) : une ligne par laveur, une colonne par
  // jour de la période affichée à l'écran (semaine ou mois).
  const exportPlanningToExcel = () => {
    const header = ['Laveur', ...periodDates.map(d => d.toLocaleDateString('fr-FR', { weekday: 'short', day: '2-digit', month: '2-digit' }))];
    const rows = [header];
    washersList.forEach(w => {
      const row = [w.name];
      periodDates.forEach(d => {
        const template = shiftTemplates.find(t => t.id === scheduleByDate[dateKey(d)]?.[w.id]);
        row.push(template ? `${template.label} (${template.startTime}-${template.endTime})` : '');
      });
      rows.push(row);
    });
    const ws = XLSX.utils.aoa_to_sheet(rows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Planning');
    const periodSuffix = planningView === 'week' ? dateKey(periodDates[0]) : `${planningAnchor.getFullYear()}-${String(planningAnchor.getMonth() + 1).padStart(2, '0')}`;
    XLSX.writeFile(wb, `Planning_${periodSuffix}.xlsx`);
  };

  const getStatusIcon = (status) => {
    switch(status) {
      case 'Actif': return <CheckCircle2 className="w-4 h-4 text-emerald-400" />;
      case 'En pause': return <Clock className="w-4 h-4 text-amber-400" />;
      case 'Absent': return <XCircle className="w-4 h-4 text-red-400" />;
      case 'Terminé': return <CheckCircle2 className="w-4 h-4 text-blue-400" />;
      case 'Fin de service': return <CheckCircle2 className="w-4 h-4 text-neutral-400" />;
      default: return null;
    }
  };

  const getStatusColor = (status) => {
    switch(status) {
      case 'Actif': return "bg-emerald-500/20 text-emerald-400 border-emerald-500/30";
      case 'En pause': return "bg-amber-500/20 text-amber-400 border-amber-500/30";
      case 'Absent': return "bg-red-500/20 text-red-400 border-red-500/30";
      case 'Terminé': return "bg-blue-500/20 text-blue-400 border-blue-500/30";
      case 'Fin de service': return "bg-neutral-500/20 text-neutral-400 border-neutral-500/30";
      default: return "bg-neutral-500/20 text-neutral-400 border-neutral-500/30";
    }
  };

  const changeDailyStatus = (id, newStatus) => {
    updateEmployee(id, { dailyStatus: newStatus });
    recordDailyAttendance(id, { dailyStatus: newStatus });
  };

  // Dès qu'un laveur est marqué "Présent" (aujourd'hui), la prise de poste est
  // enregistrée automatiquement — plus besoin de cliquer sur un bouton séparé.
  // Ne s'applique qu'une fois par jour : un laveur qui a déjà pointé aujourd'hui
  // n'est pas re-pointé si son statut du jour change puis revient à "Présent".
  React.useEffect(() => {
    const toClockIn = washersList.filter(w => w.dailyStatus === 'present' && !w.clockInAt);
    if (toClockIn.length === 0) return;
    const now = new Date();
    const display = now.toLocaleTimeString('fr-FR', {hour: '2-digit', minute:'2-digit'});
    const patch = { status: 'Actif', clockIn: display, clockInAt: now.toISOString(), clockOut: null, clockOutAt: null, totalTime: null };
    toClockIn.forEach(w => {
      updateEmployee(w.id, patch);
      recordDailyAttendance(w.id, { ...patch, dailyStatus: 'present' });
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [washersList.map(w => `${w.id}:${w.dailyStatus}:${w.clockInAt || ''}`).join(',')]);

  const handleClockOut = (id) => {
    const now = new Date();
    const display = now.toLocaleTimeString('fr-FR', {hour: '2-digit', minute:'2-digit'});
    const washer = washersList.find(w => w.id === id);
    const total = formatWorkedTime(washer?.clockInAt, now);
    const patch = { status: 'Terminé', clockOut: display, clockOutAt: now.toISOString(), totalTime: total };
    updateEmployee(id, patch);
    recordDailyAttendance(id, patch);
  };

  // Export du pointage réel du mois en cours : une ligne par employé, une colonne
  // par jour, avec les heures réellement travaillées (calculées depuis clockInAt/
  // clockOutAt, pas un forfait fixe) — voir loadAttendanceForMonth dans useAppState.
  const exportToCSV = async () => {
    const now = new Date();
    const year = now.getFullYear();
    const month = now.getMonth();
    const todayNum = now.getDate();
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const pad = (n) => String(n).padStart(2, '0');

    setExporting(true);
    const monthData = await loadAttendanceForMonth(year, month);
    setExporting(false);

    let csvContent = "ID Employé;Prénom & Nom;Rôle;";
    for (let i = 1; i <= daysInMonth; i++) {
      const d = new Date(year, month, i);
      csvContent += `${d.toLocaleDateString('fr-FR', { weekday: 'short', day: '2-digit', month: '2-digit' })};`;
    }
    csvContent += "Total Heures;Jours Travaillés;Jours Repos;Jours Congé;Jours Maladie;Jours Absence\n";

    washersList.forEach(washer => {
      let totalMinutes = 0;
      let countTravail = 0, countRepos = 0, countConge = 0, countMaladie = 0, countAbsence = 0;
      let row = `${washer.id};${washer.name};${washer.role};`;

      for (let i = 1; i <= daysInMonth; i++) {
        // Aujourd'hui : état live de l'employé (le plus à jour). Les autres jours :
        // instantané réellement enregistré ce jour-là (loadAttendanceForMonth).
        const rec = i === todayNum
          ? { dailyStatus: washer.dailyStatus, clockInAt: washer.clockInAt, clockOutAt: washer.clockOutAt, totalTime: washer.totalTime }
          : monthData[washer.id]?.[`${year}-${pad(month + 1)}-${pad(i)}`];

        if (!rec || !rec.dailyStatus) { row += ";"; continue; } // aucune donnée ce jour-là

        if (rec.dailyStatus === 'present') {
          let minutes = 0;
          if (rec.totalTime) minutes = parseDurationToMinutes(rec.totalTime);
          else if (rec.clockInAt && !rec.clockOutAt) minutes = Math.max(0, Math.round((now.getTime() - new Date(rec.clockInAt).getTime()) / 60000));
          totalMinutes += minutes;
          countTravail++;
          row += `${formatMinutesToHM(minutes)};`;
        } else {
          row += `${STATUS_LETTER[rec.dailyStatus] || 'A'};`;
          if (rec.dailyStatus === 'repos') countRepos++;
          else if (rec.dailyStatus === 'conge') countConge++;
          else if (rec.dailyStatus === 'maladie') countMaladie++;
          else countAbsence++;
        }
      }

      row += `${formatMinutesToHM(totalMinutes)};${countTravail};${countRepos};${countConge};${countMaladie};${countAbsence}\n`;
      csvContent += row;
    });

    // Encodage spécial pour que Excel reconnaisse bien les accents (BOM UTF-8)
    const BOM = "﻿";
    const blob = new Blob([BOM + csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement("a");
    const url = URL.createObjectURL(blob);
    link.setAttribute("href", url);
    link.setAttribute("download", `Pointage_Mensuel_${month + 1}_${year}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const filteredWashers = washersList.filter(m => m?.name?.toLowerCase().includes(searchTerm.toLowerCase()));

  // On sépare ceux présents aujourd'hui de la base complète
  const presentWashers = filteredWashers.filter(w => w.dailyStatus === 'present');

  // Historique : pour une date passée, on relit l'instantané enregistré ce jour-là
  // (voir recordDailyAttendance) plutôt que l'état live des employés, qui a depuis évolué.
  const historyEntriesForDate = Object.values(attendanceHistory?.[selectedDate] || {});
  const historyPresentWashers = historyEntriesForDate
    .filter(rec => rec.dailyStatus === 'present' && rec?.name?.toLowerCase().includes(searchTerm.toLowerCase()));

  const rowsToShow = isToday ? presentWashers : historyPresentWashers;

  const selectedDateLabel = new Date(`${selectedDate}T12:00:00`).toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });

  return (
    <div className="p-8 max-w-7xl mx-auto relative z-10">
      <div className="flex flex-col md:flex-row md:items-center justify-between mb-8 gap-4">
        <div>
          <h1 className="text-4xl font-bold text-white mb-2 tracking-tight">Gestion des <span className="text-blue-400">Laveurs</span></h1>
          <p className="text-neutral-400 text-lg">Sélectionnez les laveurs présents et gérez leur pointage journalier.</p>
        </div>
        <div className="flex gap-4">
          <div className="bg-blue-500/10 border border-blue-500/20 rounded-xl px-6 py-3 flex items-center gap-3">
            <Droplets className="w-5 h-5 text-blue-400" />
            <span className="text-sm font-bold text-blue-400">{presentWashers.length} Présents Aujourd'hui</span>
          </div>
          <button
            onClick={exportToCSV}
            disabled={exporting}
            className="bg-emerald-600 hover:bg-emerald-500 disabled:opacity-60 disabled:cursor-wait text-white rounded-xl px-6 py-3 flex items-center gap-2 font-bold transition-all shadow-lg shadow-emerald-500/20"
          >
            {exporting ? <Loader2 className="w-5 h-5 animate-spin" /> : <Download className="w-5 h-5" />}
            <span className="hidden md:inline">{exporting ? 'Extraction...' : 'Extraire Pointage Mensuel'}</span>
            <span className="md:hidden">{exporting ? '...' : 'Export'}</span>
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">

        {/* Colonne de gauche : Sélection des présents */}
        <Card className="h-fit">
          <CardContent className="p-6">
            <h2 className="text-xl font-bold text-white mb-4">Base de Laveurs</h2>
            <p className="text-sm text-neutral-400 mb-6">Cochez les laveurs de garde pour la journée d'aujourd'hui.</p>

            <div className="space-y-3">
              {filteredWashers.map(washer => (
                <div key={washer.id} className="flex items-center justify-between p-3 rounded-xl bg-neutral-900 border border-white/5">
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-full bg-gradient-to-tr from-blue-600 to-purple-600 flex items-center justify-center font-bold text-white text-xs">
                      {washer.avatar}
                    </div>
                    <span className="text-sm font-medium text-white">{washer.name}</span>
                  </div>
                  <select
                    value={washer.dailyStatus}
                    onChange={(e) => changeDailyStatus(washer.id, e.target.value)}
                    className={`text-xs font-bold px-3 py-1.5 rounded-lg border outline-none appearance-none cursor-pointer transition-colors ${
                      washer.dailyStatus === 'present' ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30' :
                      washer.dailyStatus === 'repos' ? 'bg-blue-500/10 text-blue-400 border-blue-500/30' :
                      washer.dailyStatus === 'conge' ? 'bg-purple-500/10 text-purple-400 border-purple-500/30' :
                      washer.dailyStatus === 'maladie' ? 'bg-amber-500/10 text-amber-400 border-amber-500/30' :
                      'bg-red-500/10 text-red-400 border-red-500/30'
                    }`}
                  >
                    <option value="present" className="bg-neutral-900 text-white">Présent</option>
                    <option value="repos" className="bg-neutral-900 text-white">Repos</option>
                    <option value="conge" className="bg-neutral-900 text-white">Congé</option>
                    <option value="maladie" className="bg-neutral-900 text-white">Maladie</option>
                    <option value="absent" className="bg-neutral-900 text-white">Absent (Injustifié)</option>
                  </select>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        {/* Colonne de droite : Pointage */}
        <Card className="lg:col-span-2">
          <CardContent className="p-6">
            <div className="flex flex-wrap justify-between items-center gap-4 mb-2">
              <h2 className="text-xl font-bold text-white">Pointage {isToday ? 'Journalier' : '— Historique'}</h2>
              <div className="relative w-64">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-neutral-500" />
                <input
                  type="text"
                  placeholder="Rechercher..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="w-full bg-neutral-900 border border-white/10 rounded-lg pl-9 pr-4 py-2 text-sm text-white focus:outline-none focus:border-blue-500 transition-colors"
                />
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-3 mb-6">
              <div className="flex items-center gap-2 bg-neutral-900 border border-white/10 rounded-lg px-3 py-2">
                <Calendar className="w-4 h-4 text-neutral-500 flex-shrink-0" />
                <input
                  type="date"
                  value={selectedDate}
                  max={todayKey()}
                  onChange={(e) => setSelectedDate(e.target.value || todayKey())}
                  className="bg-transparent text-white text-sm outline-none [color-scheme:dark]"
                />
              </div>
              {!isToday && (
                <button
                  type="button"
                  onClick={() => setSelectedDate(todayKey())}
                  className="text-xs font-bold text-blue-400 hover:text-blue-300 px-3 py-1.5 rounded-lg bg-blue-500/10 border border-blue-500/20 transition-colors"
                >
                  Revenir à aujourd'hui
                </button>
              )}
              <span className="text-sm text-neutral-500 capitalize">{selectedDateLabel}</span>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="border-b border-white/10">
                    <th className="p-4 font-semibold text-neutral-400">Employé</th>
                    <th className="p-4 font-semibold text-neutral-400 text-center">Prise de poste</th>
                    <th className="p-4 font-semibold text-neutral-400 text-center">Descente</th>
                    <th className="p-4 font-semibold text-neutral-400 text-center">Temps de travail</th>
                    <th className="p-4 font-semibold text-neutral-400 text-right">Statut</th>
                  </tr>
                </thead>
                <tbody>
                  <AnimatePresence>
                    {rowsToShow.length === 0 ? (
                      <tr><td colSpan="5" className="p-8 text-center text-neutral-500">
                        {isToday ? 'Aucun laveur sélectionné pour aujourd\'hui.' : 'Aucune donnée de pointage pour cette date.'}
                      </td></tr>
                    ) : (
                      rowsToShow.map((member) => {
                        const pointageStatus = isToday ? resolvePointageStatus(member) : (member.status || 'Absent');
                        return (
                        <motion.tr
                          key={member.id}
                          layout
                          initial={{ opacity: 0, scale: 0.95 }}
                          animate={{ opacity: 1, scale: 1 }}
                          exit={{ opacity: 0, scale: 0.95 }}
                          className="border-b border-white/5 hover:bg-white/[0.02] transition-colors"
                        >
                          <td className="p-4">
                            <div className="font-bold text-white">{member.name}</div>
                            <div className="text-xs text-neutral-500">{member.role}</div>
                          </td>
                          <td className="p-4 text-center font-bold text-emerald-400">
                            {member.clockIn || "-"}
                          </td>
                          <td className="p-4 text-center font-bold text-red-400">
                            {member.clockOut || "-"}
                          </td>
                          <td className="p-4 text-center font-bold text-blue-400">
                            <WorkedTimeCell member={member} status={pointageStatus} live={isToday} />
                          </td>
                          <td className="p-4 text-right">
                            {isToday ? (
                              <div className="flex justify-end gap-2">
                                {pointageStatus === 'Actif' && (
                                  <button onClick={() => handleClockOut(member.id)} className="px-3 py-1.5 bg-red-600 hover:bg-red-500 text-white rounded-lg font-bold text-xs transition-colors shadow-lg shadow-red-500/20">
                                    Descente
                                  </button>
                                )}
                                {pointageStatus === 'Terminé' && (
                                  <>
                                    {!isPastClosingTime(stationProfile) && (
                                      <button onClick={() => resumeEmployee(member.id)} className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg font-bold text-xs transition-colors shadow-lg shadow-emerald-500/20">
                                        Reprendre service
                                      </button>
                                    )}
                                    <button onClick={() => finishService(member.id)} className="px-3 py-1.5 bg-neutral-700 hover:bg-neutral-600 text-white rounded-lg font-bold text-xs transition-colors">
                                      Fin de service
                                    </button>
                                  </>
                                )}
                                {pointageStatus === 'Fin de service' && (
                                  <span className="text-xs text-neutral-500 italic">Journée terminée</span>
                                )}
                              </div>
                            ) : (
                              <Badge variant="outline" className={`flex items-center gap-1.5 w-fit ml-auto ${getStatusColor(pointageStatus)}`}>
                                {getStatusIcon(pointageStatus)} {pointageStatus}
                              </Badge>
                            )}
                          </td>
                        </motion.tr>
                        );
                      })
                    )}
                  </AnimatePresence>
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Planning de poste (prévisionnel) — totalement indépendant du pointage
          ci-dessus : ne touche jamais daily_status/status/clockIn. */}
      <Card className="mt-8">
        <CardContent className="p-6">
          <div className="flex flex-wrap items-center justify-between gap-4 mb-6">
            <div>
              <h2 className="text-xl font-bold text-white">Planning de Poste</h2>
              <p className="text-sm text-neutral-400">Prévoyez les horaires de vos laveurs — sans effet sur le pointage journalier.</p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <div className="flex bg-neutral-900 border border-white/10 rounded-lg p-1">
                <button onClick={() => setPlanningView('week')} className={`px-3 py-1.5 rounded-md text-xs font-bold transition-colors ${planningView === 'week' ? 'bg-blue-600 text-white' : 'text-neutral-400 hover:text-white'}`}>Semaine</button>
                <button onClick={() => setPlanningView('month')} className={`px-3 py-1.5 rounded-md text-xs font-bold transition-colors ${planningView === 'month' ? 'bg-blue-600 text-white' : 'text-neutral-400 hover:text-white'}`}>Mois</button>
              </div>
              <button onClick={openShiftTemplatesModal} className="flex items-center gap-1.5 bg-white/5 hover:bg-white/10 border border-white/10 text-white text-xs font-bold px-3 py-2 rounded-lg transition-colors">
                <Settings2 className="w-3.5 h-3.5" /> Gérer les créneaux
              </button>
              <button onClick={exportPlanningToExcel} disabled={washersList.length === 0} className="flex items-center gap-1.5 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 disabled:cursor-not-allowed text-white text-xs font-bold px-3 py-2 rounded-lg transition-colors">
                <FileSpreadsheet className="w-3.5 h-3.5" /> Excel
              </button>
            </div>
          </div>

          <div className="flex items-center justify-center gap-3 mb-6">
            <button onClick={goPrevPeriod} className="p-1.5 rounded-lg bg-neutral-900 border border-white/10 text-neutral-400 hover:text-white transition-colors">
              <ChevronLeft className="w-4 h-4" />
            </button>
            <span className="text-sm font-medium text-white capitalize min-w-[190px] text-center">{periodLabel}</span>
            <button onClick={goNextPeriod} className="p-1.5 rounded-lg bg-neutral-900 border border-white/10 text-neutral-400 hover:text-white transition-colors">
              <ChevronRight className="w-4 h-4" />
            </button>
            <button onClick={goToTodayPeriod} className="text-xs font-bold text-blue-400 hover:text-blue-300 px-3 py-1.5 rounded-lg bg-blue-500/10 border border-blue-500/20 transition-colors">
              Aujourd'hui
            </button>
          </div>

          {shiftTemplates.length > 0 && (
            <div className="flex flex-wrap gap-2 mb-6 p-3 rounded-lg bg-neutral-900/50 border border-white/5">
              <div className="w-full flex items-center gap-2 mb-1">
                <Eye className="w-4 h-4 text-neutral-400" />
                <span className="text-xs font-bold text-neutral-400 uppercase tracking-wide">Aperçu des créneaux</span>
              </div>
              {shiftTemplates.map(t => (
                <div key={t.id} className="flex items-center gap-1.5 px-2.5 py-1 rounded-md border" style={{backgroundColor: `${t.color}15`, borderColor: `${t.color}33`}}>
                   <div className="w-2 h-2 rounded-full flex-shrink-0" style={{backgroundColor: t.color}} />
                   <span className="text-xs font-medium text-white">{t.label} <span className="text-neutral-400">({t.startTime} - {t.endTime})</span></span>
                </div>
              ))}
            </div>
          )}

          {washersList.length === 0 ? (
            <p className="text-center text-neutral-500 py-8">Ajoutez des laveurs pour planifier leurs horaires.</p>
          ) : shiftTemplates.length === 0 ? (
            <div className="text-center py-8">
              <p className="text-neutral-500 mb-4">Aucun créneau défini pour l'instant.</p>
              <button onClick={openShiftTemplatesModal} className="bg-blue-600 hover:bg-blue-500 text-white text-sm font-bold px-4 py-2 rounded-lg transition-colors">Créer un créneau</button>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="border-b border-white/10">
                    <th className="p-3 font-semibold text-neutral-400 whitespace-nowrap">Laveur</th>
                    {periodDates.map(d => (
                      <th key={dateKey(d)} className="p-2 font-semibold text-neutral-400 text-center text-xs whitespace-nowrap">
                        {d.toLocaleDateString('fr-FR', { weekday: 'short' })}<br />{d.toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit' })}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {washersList.map(w => (
                    <tr key={w.id} className="border-b border-white/5">
                      <td className="p-3 font-medium text-white whitespace-nowrap">{w.name}</td>
                      {periodDates.map(d => {
                        const key = dateKey(d);
                        const shiftId = scheduleByDate[key]?.[w.id] || '';
                        const template = shiftTemplates.find(t => t.id === shiftId);
                        return (
                          <td key={key} className="p-1.5 text-center">
                            <select
                              value={shiftId}
                              onChange={(e) => setShiftForDay(w.id, key, e.target.value || null)}
                              style={template ? { backgroundColor: `${template.color}22`, borderColor: `${template.color}88`, color: template.color } : undefined}
                              className="text-xs font-bold px-2 py-1.5 rounded-lg border outline-none appearance-none cursor-pointer transition-colors bg-neutral-900 border-white/10 text-neutral-500 w-full min-w-[64px]"
                            >
                              <option value="" className="bg-neutral-900 text-neutral-400">—</option>
                              {shiftTemplates.map(t => <option key={t.id} value={t.id} className="bg-neutral-900 text-white">{t.label}</option>)}
                            </select>
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Modal Gestion des créneaux */}
      <AnimatePresence>
        {showShiftTemplatesModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
            <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.95 }}
              className="bg-neutral-900 border border-white/10 rounded-2xl p-6 w-full max-w-lg shadow-2xl relative max-h-[85vh] overflow-y-auto">
              <button onClick={() => setShowShiftTemplatesModal(false)} className="absolute top-4 right-4 text-neutral-400 hover:text-white">
                <X className="w-6 h-6" />
              </button>
              <h2 className="text-xl font-bold text-white mb-6">Créneaux de travail</h2>

              {shiftTemplates.length > 0 && (
                <div className="space-y-2 mb-6">
                  {shiftTemplates.map(t => (
                    <div key={t.id} className="flex items-center justify-between gap-3 p-3 rounded-xl bg-neutral-950 border border-white/5">
                      <div className="flex items-center gap-3">
                        <span className="w-3 h-3 rounded-full flex-shrink-0" style={{ backgroundColor: t.color }} />
                        <div>
                          <p className="text-sm font-bold text-white">{t.label}</p>
                          <p className="text-xs text-neutral-500">{t.startTime} — {t.endTime}</p>
                        </div>
                      </div>
                      <div className="flex gap-1.5">
                        <button onClick={() => openEditTemplate(t)} className="p-1.5 bg-white/5 hover:bg-blue-500/20 hover:text-blue-400 text-neutral-400 rounded-lg transition-colors">
                          <Edit2 className="w-3.5 h-3.5" />
                        </button>
                        <button onClick={() => handleDeleteTemplate(t.id)} className="p-1.5 bg-white/5 hover:bg-red-500/20 hover:text-red-400 text-neutral-400 rounded-lg transition-colors">
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}

              <form onSubmit={submitTemplate} className="space-y-3 pt-4 border-t border-white/10">
                <p className="text-xs font-bold text-neutral-500 uppercase tracking-wide">{editingTemplateId ? 'Modifier le créneau' : 'Nouveau créneau'}</p>
                <input type="text" placeholder="Nom (ex: Matin)" value={templateForm.label}
                  onChange={e => setTemplateForm({ ...templateForm, label: e.target.value })}
                  className="w-full bg-neutral-950 border border-white/10 rounded-xl px-4 py-2.5 text-white placeholder-neutral-600 focus:outline-none focus:border-blue-500 transition-colors" />
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs text-neutral-500 mb-1">Début</label>
                    <input type="time" value={templateForm.startTime}
                      onChange={e => setTemplateForm({ ...templateForm, startTime: e.target.value })}
                      className="w-full bg-neutral-950 border border-white/10 rounded-xl px-3 py-2.5 text-white focus:outline-none focus:border-blue-500 transition-colors [color-scheme:dark]" />
                  </div>
                  <div>
                    <label className="block text-xs text-neutral-500 mb-1">Fin</label>
                    <input type="time" value={templateForm.endTime}
                      onChange={e => setTemplateForm({ ...templateForm, endTime: e.target.value })}
                      className="w-full bg-neutral-950 border border-white/10 rounded-xl px-3 py-2.5 text-white focus:outline-none focus:border-blue-500 transition-colors [color-scheme:dark]" />
                  </div>
                </div>
                <div>
                  <label className="block text-xs text-neutral-500 mb-1.5">Couleur</label>
                  <div className="flex gap-2">
                    {SHIFT_COLOR_PALETTE.map(c => (
                      <button key={c} type="button" onClick={() => setTemplateForm({ ...templateForm, color: c })}
                        className={`w-7 h-7 rounded-full transition-all ${templateForm.color === c ? 'ring-2 ring-white ring-offset-2 ring-offset-neutral-900' : ''}`}
                        style={{ backgroundColor: c }} />
                    ))}
                  </div>
                </div>
                <div className="flex gap-2 pt-2">
                  <button type="submit" disabled={!templateForm.label.trim()}
                    className="flex-1 bg-blue-600 hover:bg-blue-500 disabled:bg-neutral-800 disabled:text-neutral-500 disabled:cursor-not-allowed text-white font-bold py-2.5 rounded-xl transition-colors text-sm">
                    {editingTemplateId ? 'Enregistrer' : 'Ajouter'}
                  </button>
                  {editingTemplateId && (
                    <button type="button" onClick={resetTemplateForm} className="px-4 py-2.5 rounded-xl border border-white/10 text-neutral-400 hover:text-white text-sm transition-colors">
                      Annuler
                    </button>
                  )}
                </div>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
