import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Card, CardContent } from '../../components/ui/Card';
import { Badge } from '../../components/ui/Badge';
import { CheckCircle2, Clock, XCircle, Search, Droplets, Download, Calendar, Loader2 } from 'lucide-react';
import { useAppState } from '../../hooks/useAppState';

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
  const { employees, updateEmployee, resumeEmployee, attendanceHistory, recordDailyAttendance, loadAttendanceForDate, loadAttendanceForMonth } = useAppState();
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

  const getStatusIcon = (status) => {
    switch(status) {
      case 'Actif': return <CheckCircle2 className="w-4 h-4 text-emerald-400" />;
      case 'En pause': return <Clock className="w-4 h-4 text-amber-400" />;
      case 'Absent': return <XCircle className="w-4 h-4 text-red-400" />;
      case 'Terminé': return <CheckCircle2 className="w-4 h-4 text-blue-400" />;
      default: return null;
    }
  };

  const getStatusColor = (status) => {
    switch(status) {
      case 'Actif': return "bg-emerald-500/20 text-emerald-400 border-emerald-500/30";
      case 'En pause': return "bg-amber-500/20 text-amber-400 border-amber-500/30";
      case 'Absent': return "bg-red-500/20 text-red-400 border-red-500/30";
      case 'Terminé': return "bg-blue-500/20 text-blue-400 border-blue-500/30";
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
    for (let i = 1; i <= daysInMonth; i++) csvContent += `Jour ${i};`;
    csvContent += "Total Heures;Jours Repos;Jours Congé;Jours Maladie;Jours Absence\n";

    washersList.forEach(washer => {
      let totalMinutes = 0;
      let countRepos = 0, countConge = 0, countMaladie = 0, countAbsence = 0;
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
          row += `${formatMinutesToHM(minutes)};`;
        } else {
          row += `${STATUS_LETTER[rec.dailyStatus] || 'A'};`;
          if (rec.dailyStatus === 'repos') countRepos++;
          else if (rec.dailyStatus === 'conge') countConge++;
          else if (rec.dailyStatus === 'maladie') countMaladie++;
          else countAbsence++;
        }
      }

      row += `${formatMinutesToHM(totalMinutes)};${countRepos};${countConge};${countMaladie};${countAbsence}\n`;
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
                                  <button onClick={() => resumeEmployee(member.id)} className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg font-bold text-xs transition-colors shadow-lg shadow-emerald-500/20">
                                    Reprendre service
                                  </button>
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
    </div>
  );
}
