// Helpers de pointage partagés par les pages Laveurs et Pompistes (le pointage
// des deux réutilise les mêmes tables : employees + attendance_records).

// Formate une durée en minutes en "Xh YYm" (ex: 8h 02m) pour le pointage.
export function formatMinutesToHM(totalMinutes) {
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  return `${hours}h ${String(minutes).padStart(2, '0')}m`;
}
// Formate un écart entre deux dates en "Xh YYm".
export function formatWorkedTime(startIso, end) {
  if (!startIso) return '0h 00m';
  const totalMinutes = Math.max(0, Math.round((end.getTime() - new Date(startIso).getTime()) / 60000));
  return formatMinutesToHM(totalMinutes);
}
// Chemin inverse : relit une durée déjà formatée ("8h 02m", telle que stockée
// dans attendance_records.total_time) pour pouvoir la resommer sur un mois.
export function parseDurationToMinutes(str) {
  const m = /(\d+)\s*h\s*(\d+)\s*m/.exec(str || '');
  return m ? parseInt(m[1], 10) * 60 + parseInt(m[2], 10) : 0;
}

// Clé du jour au format YYYY-MM-DD (fuseau local), utilisée pour indexer
// l'historique de pointage et comparer à la date sélectionnée dans le calendrier.
export function dateKey(d) {
  const tzOffsetMs = d.getTimezoneOffset() * 60000;
  return new Date(d.getTime() - tzOffsetMs).toISOString().slice(0, 10);
}
export function todayKey() { return dateKey(new Date()); }

// Statut de pointage effectif : un employé créé (ou dont le statut de compte est
// "Actif" par défaut) mais qui n'a encore jamais pointé n'est pas réellement en
// train de travailler — on l'affiche "Absent" tant qu'il n'a pas cliqué sur
// "Prise de poste", sinon le bouton n'apparaîtrait jamais pour lui.
export function resolvePointageStatus(member) {
  if (member.status === 'Actif' && !member.clockInAt) return 'Absent';
  return member.status || 'Absent';
}
