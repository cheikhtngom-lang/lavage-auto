import React, { useState, useEffect } from 'react';
import { formatWorkedTime } from '../../lib/attendance';

// Cellule "Temps de travail" — statique une fois la journée terminée, mise à
// jour en direct (toutes les 30s) tant que l'employé est activement au poste
// ET que c'est la journée en cours (`live`) — on ne recalcule jamais un écart
// par rapport à "maintenant" pour un jour passé consulté dans l'historique.
export default function WorkedTimeCell({ member, status, live }) {
  const [, tick] = useState(0);
  const canTickLive = live && status === 'Actif' && !!member.clockInAt;
  useEffect(() => {
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
