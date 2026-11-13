// Espace automobiliste, rubrique « Mes dépôts » : les tapis, moquettes et
// chaussures déposés en station (add_shoe_cleaning.sql), avec l'étape en
// cours et la date promise. Le client
// sait s'ils sont prêts avant de se déplacer. Un dépôt arrive ici quand le
// client ouvre le lien de suivi envoyé par la station puis se connecte
// (jeton gardé par login.html, rattaché par carpet_claim).
import React, { useCallback, useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { Layers, Footprints, Phone, MessageCircle, Navigation, CheckCircle2, Clock, AlertTriangle, ChevronDown } from 'lucide-react';
import { supabase } from '../../lib/supabaseClient';
import { useClientAccount } from '../../hooks/useClientAccount';
import { useDocumentTitle } from '../../lib/useDocumentTitle';
import { cn } from '../../lib/utils';
import { whatsappLink } from '../../lib/subscriptionReminders';
import {
  CARPET_STEPS, CARPET_STATUS, rowToCarpet, isOpenCarpet, isLateCarpet, stepIndex, orderSummary, fcfa, formatPromise, timeLeftLabel, pieceLines, pieceLabel,
  claimPendingCarpet, activityConfig, CLIENT_DEPOSITS_LABEL,
} from '../../lib/carpets';

const telHref = (phone) => {
  let d = String(phone || '').replace(/\D/g, '');
  if (!d) return null;
  if (d.length === 9 && /^[73]/.test(d)) d = `221${d}`;
  return `tel:+${d}`;
};
const mapsHref = (st) => {
  if (!st) return null;
  if (st.lat && st.lng) return `https://www.google.com/maps/dir/?api=1&destination=${st.lat},${st.lng}`;
  const q = [st.name, st.address, st.quartier].filter(Boolean).join(', ');
  return q ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(q)}` : null;
};
// « 08:00:00 » -> « 8 h », « 07:30 » -> « 7 h 30 »
const fmtTime = (t) => { const [h, m] = String(t).split(':'); return `${parseInt(h, 10)} h${m && m !== '00' ? ` ${m}` : ''}`; };
const hours = (st) => (st?.open_time && st?.close_time ? `${fmtTime(st.open_time)} – ${fmtTime(st.close_time)}` : null);

function Steps({ status }) {
  const idx = stepIndex(status);
  const done = status === 'pret' || status === 'recupere';
  return (
    <ol className="grid grid-cols-4 gap-2" aria-label="Avancement">
      {CARPET_STEPS.map((s, i) => {
        const reached = i <= idx;
        const current = i === idx && !done;
        return (
          <li key={s.key} className="min-w-0">
            <span className={cn('block h-1.5 rounded-full', reached ? (done ? 'bg-emerald-400' : 'bg-blue-400') : 'bg-white/10')} />
            <span className={cn('block text-[11px] sm:text-xs mt-1.5 truncate', current ? 'text-white font-semibold' : reached ? 'text-neutral-300' : 'text-neutral-500')}>
              {s.label}
            </span>
          </li>
        );
      })}
    </ol>
  );
}

function CarpetCard({ order, index }) {
  const cfg = activityConfig(order.activity);
  const KindIcon = cfg.key === 'chaussures' ? Footprints : Layers;
  const st = order.station;
  const ready = order.status === 'pret';
  const late = isLateCarpet(order);
  const call = telHref(st?.owner_phone);
  const wa = whatsappLink(st?.owner_phone, `Bonjour, je viens aux nouvelles de mon dépôt de ${cfg.things} (ticket ${cfg.things} n° ${order.ticketNo}).`);
  const maps = mapsHref(st);
  const h = hours(st);
  return (
    <motion.article
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: Math.min(index, 5) * 0.04, duration: 0.25, ease: [0.23, 1, 0.32, 1] }}
      className={cn('glass-card rounded-2xl border p-5 sm:p-6', ready ? 'border-emerald-500/30 bg-emerald-500/[0.04]' : 'border-white/5 bg-white/[0.02]')}
    >
      <div className="flex items-start justify-between gap-3 mb-1">
        <h3 className="text-lg font-bold text-white leading-snug">{st?.name || 'Station'}</h3>
        <span className="shrink-0 inline-flex items-center gap-1.5 text-xs font-medium text-neutral-300 bg-white/5 border border-white/10 rounded-md px-2 py-1 tabular-nums"><KindIcon className="w-3.5 h-3.5 text-blue-300" aria-hidden="true" /> {cfg.nav} · n° {order.ticketNo}</span>
      </div>
      <p className="text-neutral-400 text-sm mb-5">{orderSummary(order)} · déposé le {new Date(order.createdAt).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long' })}</p>

      {ready ? (
        <div className="flex items-start gap-3 rounded-xl bg-emerald-500/10 border border-emerald-500/25 p-4 mb-5">
          <CheckCircle2 className="w-6 h-6 text-emerald-400 shrink-0" />
          <div>
            <p className="text-white font-bold">Prêt : vous pouvez passer le récupérer</p>
            <p className="text-emerald-200/80 text-sm mt-0.5">
              {order.readyAt ? `Prêt depuis le ${formatPromise(order.readyAt)}` : 'Prêt'}{h ? ` · horaires ${h}` : ''}
            </p>
          </div>
        </div>
      ) : (
        <div className={cn('flex items-start gap-3 rounded-xl p-4 mb-5 border', late ? 'bg-amber-500/10 border-amber-500/25' : 'bg-white/[0.03] border-white/10')}>
          {late ? <AlertTriangle className="w-6 h-6 text-amber-400 shrink-0" /> : <Clock className="w-6 h-6 text-blue-400 shrink-0" />}
          <div>
            <p className="text-white font-bold">{CARPET_STATUS[order.status]?.label || 'En cours'}</p>
            <p className="text-neutral-300 text-sm mt-0.5">
              Prêt au plus tard le <span className="text-white font-medium">{formatPromise(order.promisedAt)}</span>
              {!late && <span className="text-neutral-500"> ({timeLeftLabel(order.promisedAt)})</span>}
            </p>
            {late && <p className="text-amber-200/90 text-sm mt-1">La date annoncée est passée : appelez la station avant de vous déplacer.</p>}
          </div>
        </div>
      )}

      <Steps status={order.status} />

      {/* Détail des pièces : taille et prix de chacune */}
      <ul className="mt-5 space-y-1.5 text-sm">
        {pieceLines(order.items).map((p) => (
          <li key={p.id} className="flex items-baseline justify-between gap-3">
            <span className="text-neutral-300 min-w-0">{pieceLabel(p)}</span>
            <span className="text-neutral-400 tabular-nums shrink-0">{p.price ? fcfa(p.price) : order.amount > 0 ? '' : 'prix au retrait'}</span>
          </li>
        ))}
      </ul>

      <div className="flex flex-wrap items-center justify-between gap-3 mt-5 pt-5 border-t border-white/5">
        <p className="text-sm">
          {order.amount > 0
            ? (order.paid
              ? <span className="text-emerald-400 font-medium">Payé · {fcfa(order.amount)}</span>
              : <span className="text-neutral-300">À régler au retrait : <span className="text-white font-bold">{fcfa(order.amount)}</span></span>)
            : <span className="text-neutral-500">Prix indiqué au retrait</span>}
        </p>
        <div className="grid grid-cols-3 gap-2 w-full sm:w-auto sm:flex">
          {call && <a href={call} className="inline-flex items-center justify-center gap-1.5 px-3 py-2.5 rounded-lg bg-white/5 hover:bg-white/10 border border-white/10 text-sm text-white transition-colors" aria-label={`Appeler ${st?.name || 'la station'}`}><Phone className="w-4 h-4" /> Appeler</a>}
          {wa && <a href={wa} target="_blank" rel="noopener noreferrer" className="inline-flex items-center justify-center gap-1.5 px-3 py-2.5 rounded-lg bg-white/5 hover:bg-white/10 border border-white/10 text-sm text-white transition-colors"><MessageCircle className="w-4 h-4 text-emerald-400" /> WhatsApp</a>}
          {maps && <a href={maps} target="_blank" rel="noopener noreferrer" className={cn('inline-flex items-center justify-center gap-1.5 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors', ready ? 'bg-emerald-600 hover:bg-emerald-500 text-white' : 'bg-white/5 hover:bg-white/10 border border-white/10 text-white')}><Navigation className="w-4 h-4" /> Itinéraire</a>}
        </div>
      </div>
    </motion.article>
  );
}

export default function Carpets() {
  useDocumentTitle(CLIENT_DEPOSITS_LABEL);
  const { account } = useClientAccount();
  const [orders, setOrders] = useState([]);
  const [loaded, setLoaded] = useState(false);
  const [notice, setNotice] = useState(null);
  const [showHistory, setShowHistory] = useState(false);
  const accountId = account?.id;

  const load = useCallback(async () => {
    if (!accountId) return;
    const { data, error } = await supabase
      .from('carpet_orders')
      .select('*, stations(name, owner_phone, address, quartier, lat, lng, open_time, close_time)')
      .eq('client_id', accountId)
      .order('created_at', { ascending: false });
    if (!error) setOrders((data || []).map((row) => ({ ...rowToCarpet(row), station: row.stations || null })));
    setLoaded(true);
  }, [accountId]);

  useEffect(() => {
    if (!accountId) return undefined;
    let cancelled = false;
    (async () => {
      // Lien de suivi ouvert avant la connexion : on rattache d'abord le dépôt.
      const claim = await claimPendingCarpet();
      if (cancelled) return;
      if (claim?.ok) setNotice({ tone: 'ok', text: 'Votre dépôt a été ajouté à votre espace. Il se met à jour tout seul.' });
      else if (claim?.error) setNotice({ tone: 'warn', text: claim.error });
      load();
    })();
    const channel = supabase
      .channel(`my-carpets-${accountId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'carpet_orders', filter: `client_id=eq.${accountId}` }, () => load())
      .subscribe();
    return () => { cancelled = true; supabase.removeChannel(channel); };
  }, [accountId, load]);

  const current = orders.filter(isOpenCarpet).sort((a, b) => (a.status === 'pret' ? -1 : 0) - (b.status === 'pret' ? -1 : 0) || new Date(a.promisedAt) - new Date(b.promisedAt));
  const past = orders.filter((o) => !isOpenCarpet(o));

  return (
    <div className="container mx-auto px-4 py-8 sm:py-12 max-w-3xl relative z-10">
      <div className="mb-8">
        <h1 className="text-3xl sm:text-4xl font-bold mb-2 tracking-tight">Mes <span className="text-blue-400">dépôts</span></h1>
        <p className="text-neutral-400 text-base sm:text-lg">Tapis, moquettes et chaussures déposés en station : voyez s'ils sont prêts avant de vous déplacer.</p>
      </div>

      {notice && (
        <p role="status" className={cn('mb-6 rounded-xl px-4 py-3 text-sm border', notice.tone === 'ok' ? 'bg-emerald-500/10 border-emerald-500/25 text-emerald-200' : 'bg-amber-500/10 border-amber-500/25 text-amber-200')}>
          {notice.text}
        </p>
      )}

      {!loaded ? (
        <div className="glass-card rounded-2xl h-56 border border-white/5 bg-white/[0.02] animate-pulse" />
      ) : current.length === 0 && past.length === 0 ? (
        <div className="glass-card rounded-2xl p-8 sm:p-10 border-dashed border-2 border-white/10">
          <Layers className="w-12 h-12 text-neutral-600 mb-4" />
          <h2 className="text-xl font-bold text-white mb-2">Aucun dépôt pour l'instant</h2>
          <p className="text-neutral-400 mb-6">Certaines stations lavent aussi les tapis de salon, les moquettes et les chaussures.</p>
          <ol className="space-y-3 text-sm">
            {[
              'Déposez vos tapis ou vos chaussures à la station.',
              'La station vous envoie un lien de suivi sur WhatsApp.',
              'Ouvrez-le une fois connecté : le dépôt s\'ajoute ici et vous voyez quand il est prêt.',
            ].map((t, i) => (
              <li key={t} className="flex gap-3 text-neutral-300">
                <span className="w-6 h-6 shrink-0 rounded-full bg-blue-500/15 text-blue-300 text-xs font-bold flex items-center justify-center tabular-nums">{i + 1}</span>
                {t}
              </li>
            ))}
          </ol>
        </div>
      ) : (
        <>
          {current.length === 0 ? (
            <p className="text-neutral-400 mb-6">Aucun dépôt en cours.</p>
          ) : (
            <div className="space-y-5">
              {current.map((o, i) => <CarpetCard key={o.id} order={o} index={i} />)}
            </div>
          )}

          {past.length > 0 && (
            <div className="mt-10">
              <button type="button" onClick={() => setShowHistory((v) => !v)} aria-expanded={showHistory} className="flex items-center gap-2 text-neutral-300 hover:text-white font-medium">
                Historique ({past.length}) <ChevronDown className={cn('w-4 h-4 transition-transform', showHistory && 'rotate-180')} />
              </button>
              {showHistory && (
                <ul className="mt-4 glass-card rounded-2xl border border-white/5 bg-white/[0.02] divide-y divide-white/5">
                  {past.map((o) => (
                    <li key={o.id} className="flex flex-wrap items-center justify-between gap-2 px-5 py-4">
                      <div className="min-w-0">
                        <p className="text-white font-medium truncate">{o.station?.name || 'Station'} · {activityConfig(o.activity).things} n° {o.ticketNo}</p>
                        <p className="text-neutral-500 text-sm">{orderSummary(o)}</p>
                      </div>
                      <p className="text-sm text-neutral-400">
                        {o.status === 'annule' ? 'Annulé' : `Récupéré le ${new Date(o.pickedUpAt || o.readyAt || o.createdAt).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long' })}`}
                        {o.amount > 0 && o.status !== 'annule' ? ` · ${fcfa(o.amount)}` : ''}
                      </p>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}
        </>
      )}
    </div>
  );
}
