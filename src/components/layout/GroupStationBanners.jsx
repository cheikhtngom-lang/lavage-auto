import React, { useEffect, useState } from 'react';
import { Briefcase, ArrowLeft, Loader2 } from 'lucide-react';
import { getCurrentRole, getCurrentStationId, getIsGroupOwner } from '../../lib/accounts';
import { closeStation, getMyStationGroup, getPendingJoinForMyStation, respondJoin, leaveGroup } from '../../lib/groups';

// Bandeaux liés à l'offre Sur mesure, montés en haut de l'espace station :
//  • chef d'entreprise « ouvert » sur une station : retour à son groupe ;
//  • propriétaire d'une station SOLLICITÉE par un groupe : accepter / refuser ;
//  • propriétaire d'une station RATTACHÉE : avis (facturation par le groupe) + « Quitter ».
// Voir add_sur_mesure_groups.sql.
export default function GroupStationBanners({ stationName }) {
  const patron = getIsGroupOwner();
  const owner = getCurrentRole() === 'admin' && !patron;
  const stationId = getCurrentStationId();

  const [join, setJoin] = useState(null);
  const [group, setGroup] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!owner) return undefined;
    let cancelled = false;
    getPendingJoinForMyStation().then((j) => { if (!cancelled) setJoin(j); });
    if (stationId && stationId !== 'default') getMyStationGroup(stationId).then((g) => { if (!cancelled) setGroup(g); });
    return () => { cancelled = true; };
  }, [owner, stationId]);

  const backToGroup = async () => {
    setBusy(true);
    try { await closeStation(); } catch { /* le layout du groupe referme aussi la station */ }
    window.location.href = '/groupe';
  };

  const respond = async (accept) => {
    const org = join.organizations?.name || 'ce groupe';
    const msg = accept
      ? `Accepter de rejoindre « ${org} » ?\n\nLe responsable du groupe verra toute l’activité de votre station et pourra y agir. La facturation passera par le groupe. Vous pourrez quitter le groupe à tout moment.`
      : `Refuser la demande de « ${org} » ?`;
    if (!window.confirm(msg)) return;
    setBusy(true);
    setError('');
    try {
      await respondJoin(join.id, accept);
      setJoin(null);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  const leave = async () => {
    if (!window.confirm('Quitter le groupe ? Votre station redevient indépendante, avec son propre abonnement.')) return;
    setBusy(true);
    setError('');
    try {
      await leaveGroup();
      window.location.reload();
    } catch (err) {
      setError(err.message);
      setBusy(false);
    }
  };

  return (
    <>
      {patron && (
        <div className="relative z-20 flex flex-wrap items-center gap-3 border-b px-6 py-2.5 text-sm bg-emerald-500/10 border-emerald-500/25">
          <Briefcase className="w-4 h-4 text-emerald-400 flex-shrink-0" />
          <span className="text-emerald-200 flex-1 min-w-[200px]">
            Vous travaillez dans <strong>{stationName || 'cette station'}</strong> en tant que chef d’entreprise.
          </span>
          <button onClick={backToGroup} disabled={busy} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white font-semibold disabled:opacity-60">
            {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <ArrowLeft className="w-4 h-4" />} Mon groupe
          </button>
        </div>
      )}

      {owner && join && (
        <div className="relative z-20 flex flex-col sm:flex-row sm:items-center gap-3 border-b px-6 py-3 text-sm bg-blue-500/10 border-blue-500/30">
          <span className="text-blue-200 flex-1">
            <strong>{join.organizations?.name || 'Un groupe'}</strong> souhaite rattacher votre station à son offre « Sur mesure ».
            Le responsable du groupe verrait toute l’activité de votre station et pourrait y agir ; la facturation passerait par le groupe.
          </span>
          <div className="flex gap-2 flex-shrink-0">
            <button onClick={() => respond(false)} disabled={busy} className="px-4 py-1.5 rounded-lg border border-red-500/40 text-red-300 hover:bg-red-500/10 disabled:opacity-60 font-medium">Refuser</button>
            <button onClick={() => respond(true)} disabled={busy} className="px-4 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-500 text-white font-bold disabled:opacity-60">Accepter</button>
          </div>
        </div>
      )}

      {owner && group && (
        <div className="relative z-20 flex flex-wrap items-center gap-3 border-b px-6 py-2.5 text-sm bg-white/[0.04] border-white/10">
          <Briefcase className="w-4 h-4 text-neutral-400 flex-shrink-0" />
          <span className="text-neutral-300 flex-1 min-w-[200px]">
            Cette station fait partie du groupe <strong>{group.name}</strong> : son abonnement est réglé par le groupe.
          </span>
          {group.origin === 'joined' && (
            <button onClick={leave} disabled={busy} className="px-3 py-1.5 rounded-lg bg-white/5 hover:bg-white/10 border border-white/10 text-neutral-200 text-xs font-medium disabled:opacity-60">
              Quitter le groupe
            </button>
          )}
        </div>
      )}

      {error && <p className="relative z-20 px-6 py-2 text-sm text-red-400 bg-red-500/10">{error}</p>}
    </>
  );
}
