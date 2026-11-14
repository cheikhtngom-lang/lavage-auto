import React, { useEffect, useState } from 'react';
import { ArrowRightLeft, Loader2 } from 'lucide-react';
import { getCurrentRole, getIsGroupOwner, getCurrentStationId, myEstablishments, switchEstablishment } from '../../lib/accounts';

// Compte qui a une station de lavage ET un pressing avec le même e-mail
// (add_pressing_signup_activation.sql) : un bandeau discret pour passer de
// l'un à l'autre. Rien pour un compte à un seul établissement.
const KIND = { lavage: 'ma station', pressing: 'mon pressing' };

export default function EstablishmentSwitch() {
  const owner = getCurrentRole() === 'admin' && !getIsGroupOwner();
  const stationId = getCurrentStationId();
  const [others, setOthers] = useState([]);
  const [busy, setBusy] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!owner) return undefined;
    let cancelled = false;
    myEstablishments().then((list) => { if (!cancelled) setOthers(list.filter((e) => e.id !== stationId)); });
    return () => { cancelled = true; };
  }, [owner, stationId]);

  if (!owner || others.length === 0) return null;

  const go = async (e) => {
    setBusy(e.id);
    setError('');
    try {
      await switchEstablishment(e.id);
      window.location.href = e.business_type === 'pressing' ? '/admin/pressing' : '/admin/queue';
    } catch (err) {
      setError(err.message);
      setBusy(null);
    }
  };

  return (
    <div className="relative z-20 mx-4 sm:mx-6 lg:mx-8 mt-4 flex flex-wrap items-center gap-x-3 gap-y-2 rounded-xl border border-white/10 bg-white/[0.03] px-4 py-2.5 text-sm">
      <ArrowRightLeft className="w-4 h-4 text-sky-300 shrink-0" />
      <span className="text-neutral-300">Votre compte a aussi :</span>
      {others.map((e) => (
        <button key={e.id} type="button" onClick={() => go(e)} disabled={!!busy}
          className="inline-flex items-center gap-1.5 rounded-lg bg-sky-600/20 hover:bg-sky-600/30 border border-sky-500/30 px-3 py-1.5 font-semibold text-sky-200 transition-colors disabled:opacity-60">
          {busy === e.id && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
          Ouvrir {KIND[e.business_type] || 'cet espace'} « {e.name} »
        </button>
      ))}
      {error && <span className="text-red-400 w-full">{error}</span>}
    </div>
  );
}
