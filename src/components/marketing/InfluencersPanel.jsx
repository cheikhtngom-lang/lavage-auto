import React, { useMemo, useState } from 'react';
import { AnimatePresence } from 'framer-motion';
import {
  Star, Wallet, HandCoins, Hourglass, Plus, Copy, Check, ChevronDown, Trash2, Percent, Info, Building2, Receipt,
} from 'lucide-react';
import { supabase } from '../../lib/supabaseClient';
import { SITE } from '../../lib/siteFooter';
import {
  Card, Field, KpiCard, Modal, SourceChip, dayFr, dateFr, fcfa, fmt, inputCls, plural, todayKey, tones, useCopy,
} from './shared';

// Super Admin > Affiliés > Influenceurs : commissions des affiliés marqués
// « influenceur » et versements (cashout). Chiffres : marketing_stats()
// (add_influencers_facebook_ads.sql) — taux de l'affilié sur chaque paiement
// confirmé (abonnement, publicité) des stations inscrites par son lien,
// pendant les 3 mois qui suivent le 1er paiement de la station.

export const DEFAULT_COMMISSION = 20;

export const PAYOUT_METHODS = [
  { key: 'wave', label: 'Wave' },
  { key: 'orange_money', label: 'Orange Money' },
  { key: 'especes', label: 'Espèces' },
  { key: 'autre', label: 'Autre' },
];
const methodLabel = (k) => PAYOUT_METHODS.find((m) => m.key === k)?.label || 'Autre';
const rateLabel = (r) => `${Number(r ?? DEFAULT_COMMISSION).toLocaleString('fr-FR', { maximumFractionDigits: 2 })} %`;

const parseRate = (v) => {
  const n = Number(String(v).replace(',', '.'));
  return Number.isFinite(n) && n >= 0 && n <= 100 ? Math.round(n * 100) / 100 : null;
};

// Récapitulatif à envoyer par WhatsApp (texte simple, *gras* WhatsApp).
function recapText(inf) {
  const lines = [
    `*${SITE.name} — commissions de ${inf.name}*`,
    `Au ${new Date().toLocaleDateString('fr-FR')}`,
    `Taux : ${rateLabel(inf.commission_rate)} de chaque paiement des stations inscrites via ton lien, pendant 3 mois après leur 1er paiement.`,
    '',
  ];
  const paying = inf.stations.filter((s) => s.first_paid_at);
  if (paying.length === 0) lines.push('Aucune station payante pour le moment.');
  else {
    lines.push(`*Stations (${paying.length})*`);
    for (const s of paying) lines.push(`• ${s.station_name} : ${fcfa(s.eligible_amount)} payés → ${fcfa(s.commission)}`);
  }
  const waiting = inf.stations.length - paying.length;
  if (waiting > 0) lines.push(`(+ ${plural(waiting, 'station inscrite pas encore payante', 'stations inscrites pas encore payantes')})`);
  lines.push('', `Total gagné : ${fcfa(inf.earned)}`, `Déjà versé : ${fcfa(inf.paid)}`, `*Reste à payer : ${fcfa(inf.due)}*`);
  if (inf.payouts.length > 0) {
    lines.push('', '*Versements*');
    for (const p of inf.payouts) lines.push(`• ${dayFr(p.paid_on)} : ${fcfa(p.amount)} (${methodLabel(p.method)}${p.reference ? `, réf. ${p.reference}` : ''})`);
  }
  return lines.join('\n');
}

// ─── Fenêtre « Ajouter un influenceur » ─────────────────────────────────
function MakeInfluencerModal({ candidates, onClose, onSave, onCreateNew }) {
  const [affiliateId, setAffiliateId] = useState(candidates[0]?.id || '');
  const [rateValue, setRateValue] = useState(String(DEFAULT_COMMISSION));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const submit = async (e) => {
    e.preventDefault();
    const r = parseRate(rateValue);
    if (!affiliateId) return setError('Choisissez un affilié.');
    if (r == null) return setError('Le taux doit être compris entre 0 et 100 %.');
    setBusy(true);
    setError('');
    try {
      await onSave(affiliateId, { is_influencer: true, commission_rate: r });
      onClose();
    } catch (err) {
      setError(err.message);
      setBusy(false);
    }
  };

  return (
    <Modal id="make-influencer-title" title="Ajouter un influenceur" onClose={onClose} busy={busy}
      intro="Un affilié influenceur touche une commission sur les paiements des stations qu’il fait inscrire. Vous le payez vous-même (Wave, Orange Money…) puis enregistrez le versement ici.">
      <form onSubmit={submit} className="space-y-4">
        {candidates.length === 0 ? (
          <p className="text-sm text-neutral-400">Tous vos affiliés sont déjà influenceurs.</p>
        ) : (
          <Field label="Affilié" htmlFor="inf-affiliate">
            <select id="inf-affiliate" className={`${inputCls} appearance-none`} value={affiliateId} onChange={(e) => setAffiliateId(e.target.value)}>
              {candidates.map((a) => <option key={a.id} value={a.id}>{a.name} (?ref={a.code}){a.active ? '' : ' — désactivé'}</option>)}
            </select>
          </Field>
        )}
        <button type="button" onClick={onCreateNew} className="text-sm text-purple-300 hover:underline">
          Nouvel affilié ? Créez-le d’abord (son lien personnel) →
        </button>
        <Field label="Commission (%)" htmlFor="inf-rate" hint="20 % par défaut. S’applique à chaque paiement confirmé des stations inscrites par son lien, pendant 3 mois après leur 1er paiement.">
          <input id="inf-rate" inputMode="decimal" className={inputCls} value={rateValue} onChange={(e) => setRateValue(e.target.value)} />
        </Field>
        {error && <p className="text-sm text-red-400">{error}</p>}
        <div className="pt-4 border-t border-white/10">
          <button type="submit" disabled={busy || candidates.length === 0} className="w-full bg-purple-600 hover:bg-purple-500 disabled:opacity-60 text-white font-bold py-3 px-4 rounded-xl transition-colors flex items-center justify-center gap-2">
            <Star className="w-5 h-5" /> {busy ? 'Enregistrement…' : 'Marquer comme influenceur'}
          </button>
        </div>
      </form>
    </Modal>
  );
}

// ─── Fenêtre « Modifier la commission » ─────────────────────────────────
function RateModal({ influencer, onClose, onSave }) {
  const [rateValue, setRateValue] = useState(String(influencer.commission_rate ?? DEFAULT_COMMISSION).replace('.', ','));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const save = async (fields) => {
    setBusy(true);
    setError('');
    try {
      await onSave(influencer.id, fields);
      onClose();
    } catch (err) {
      setError(err.message);
      setBusy(false);
    }
  };
  const submit = (e) => {
    e.preventDefault();
    const r = parseRate(rateValue);
    if (r == null) return setError('Le taux doit être compris entre 0 et 100 %.');
    save({ is_influencer: true, commission_rate: r });
  };
  const remove = () => {
    if (!window.confirm(`${influencer.name} ne sera plus influenceur. ${influencer.payouts.length > 0 ? 'Ses versements restent dans l’historique.' : ''}`)) return;
    save({ is_influencer: false });
  };

  return (
    <Modal id="rate-title" title={`Commission de ${influencer.name}`} onClose={onClose} busy={busy}
      intro="Le nouveau taux s’applique à tous ses paiements pris en compte, y compris ceux déjà passés : le total gagné est recalculé. Le changement est inscrit au journal d’audit.">
      <form onSubmit={submit} className="space-y-4">
        <Field label="Commission (%)" htmlFor="rate-value">
          <input id="rate-value" inputMode="decimal" className={inputCls} value={rateValue} onChange={(e) => setRateValue(e.target.value)} />
        </Field>
        {error && <p className="text-sm text-red-400">{error}</p>}
        <div className="pt-4 border-t border-white/10 flex flex-col sm:flex-row gap-2">
          <button type="submit" disabled={busy} className="flex-1 bg-purple-600 hover:bg-purple-500 disabled:opacity-60 text-white font-bold py-3 px-4 rounded-xl transition-colors">
            {busy ? 'Enregistrement…' : 'Enregistrer'}
          </button>
          {influencer.is_influencer && (
            <button type="button" onClick={remove} disabled={busy} className="px-4 py-3 rounded-xl bg-white/5 hover:bg-red-500/15 text-neutral-300 hover:text-red-300 font-bold transition-colors">
              Retirer le statut
            </button>
          )}
        </div>
      </form>
    </Modal>
  );
}

// ─── Fenêtre « Enregistrer un versement » ───────────────────────────────
function PayoutModal({ influencer, onClose, onSave }) {
  const [form, setForm] = useState({
    amount: influencer.due > 0 ? String(influencer.due) : '',
    method: 'wave', reference: '', paid_on: todayKey(), note: '',
  });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));

  const submit = async (e) => {
    e.preventDefault();
    const amount = Math.round(Number(String(form.amount).replace(/[\s ]/g, '').replace(',', '.')));
    if (!(amount > 0)) return setError('Indiquez le montant versé.');
    if (!form.paid_on) return setError('Indiquez la date du versement.');
    if (amount > influencer.due && !window.confirm(`Ce versement (${fcfa(amount)}) dépasse le reste à payer (${fcfa(influencer.due)}). L’enregistrer quand même ?`)) return;
    setBusy(true);
    setError('');
    try {
      await onSave({
        affiliate_id: influencer.id, amount, method: form.method, paid_on: form.paid_on,
        reference: form.reference.trim() || null, note: form.note.trim() || null,
      });
      onClose();
    } catch (err) {
      setError(err.message);
      setBusy(false);
    }
  };

  return (
    <Modal id="payout-title" title="Enregistrer un versement" onClose={onClose} busy={busy}
      intro={`À ${influencer.name} — reste à payer : ${fcfa(influencer.due)}. Versez d’abord l’argent (Wave, Orange Money…), puis notez-le ici.`}>
      <form onSubmit={submit} className="space-y-4">
        <Field label="Montant (FCFA)" htmlFor="payout-amount">
          <input id="payout-amount" inputMode="numeric" className={inputCls} value={form.amount} placeholder="Ex. 5000" onChange={set('amount')} />
        </Field>
        <Field label="Moyen" htmlFor="payout-method">
          <select id="payout-method" className={`${inputCls} appearance-none`} value={form.method} onChange={set('method')}>
            {PAYOUT_METHODS.map((m) => <option key={m.key} value={m.key}>{m.label}</option>)}
          </select>
        </Field>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <Field label="Référence (facultatif)" htmlFor="payout-ref">
            <input id="payout-ref" className={inputCls} value={form.reference} maxLength={80} placeholder="N° de transaction" onChange={set('reference')} />
          </Field>
          <Field label="Date" htmlFor="payout-date">
            <input id="payout-date" type="date" className={inputCls} value={form.paid_on} max={todayKey()} onChange={set('paid_on')} />
          </Field>
        </div>
        <Field label="Note (facultatif)" htmlFor="payout-note">
          <textarea id="payout-note" rows={2} className={inputCls} value={form.note} maxLength={300} onChange={set('note')} />
        </Field>
        {error && <p className="text-sm text-red-400">{error}</p>}
        <div className="pt-4 border-t border-white/10">
          <button type="submit" disabled={busy} className="w-full bg-emerald-600 hover:bg-emerald-500 disabled:opacity-60 text-white font-bold py-3 px-4 rounded-xl transition-colors flex items-center justify-center gap-2">
            <HandCoins className="w-5 h-5" /> {busy ? 'Enregistrement…' : 'Enregistrer le versement'}
          </button>
        </div>
      </form>
    </Modal>
  );
}

// ─── Carte d'un influenceur ─────────────────────────────────────────────
function InfluencerCard({ inf, copied, onCopy, onPay, onEditRate, onDeletePayout }) {
  const [open, setOpen] = useState(false);
  const paying = inf.stations.filter((s) => s.first_paid_at).length;
  return (
    <div className={`glass-card rounded-2xl border border-white/5 bg-white/[0.02] ${inf.is_influencer ? '' : 'opacity-70'}`}>
      <div className="p-5 sm:p-6">
        <div className="flex flex-wrap items-start justify-between gap-3 mb-4">
          <div className="min-w-0">
            <p className="font-bold text-white text-lg flex flex-wrap items-center gap-2">
              {inf.name}
              <SourceChip source={inf.network} />
              {!inf.is_influencer && <span className="text-xs font-medium px-2.5 py-0.5 rounded-full border border-white/10 text-neutral-400">n’est plus influenceur</span>}
            </p>
            <p className="text-xs text-neutral-500 mt-1">
              ?ref={inf.code} · commission {rateLabel(inf.commission_rate)} · {plural(inf.stations.length, 'station inscrite', 'stations inscrites')}, {plural(paying, 'payante', 'payantes')}
              {inf.contact ? ` · ${inf.contact}` : ''}
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <button type="button" onClick={() => onPay(inf)}
              className="flex items-center gap-1.5 px-3 py-2 bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-400 rounded-lg transition-colors text-xs font-bold">
              <HandCoins className="w-4 h-4" /> Enregistrer un versement
            </button>
            <button type="button" onClick={() => onCopy(recapText(inf), `recap-${inf.id}`)}
              className="flex items-center gap-1.5 px-3 py-2 bg-white/5 hover:bg-white/10 text-neutral-200 rounded-lg transition-colors text-xs font-bold">
              {copied === `recap-${inf.id}` ? <><Check className="w-4 h-4" /> Copié</> : <><Copy className="w-4 h-4" /> Copier le récapitulatif</>}
            </button>
            <button type="button" onClick={() => onEditRate(inf)} aria-label={`Modifier la commission de ${inf.name}`}
              className="flex items-center gap-1.5 px-3 py-2 bg-white/5 hover:bg-white/10 text-neutral-300 rounded-lg transition-colors text-xs font-bold">
              <Percent className="w-4 h-4" /> Commission
            </button>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <div className="rounded-xl bg-white/[0.03] border border-white/5 p-4">
            <p className="text-xs text-neutral-500 mb-1">Total gagné</p>
            <p className="text-xl font-bold text-white tabular-nums">{fcfa(inf.earned)}</p>
          </div>
          <div className="rounded-xl bg-white/[0.03] border border-white/5 p-4">
            <p className="text-xs text-neutral-500 mb-1">Déjà versé</p>
            <p className="text-xl font-bold text-white tabular-nums">{fcfa(inf.paid)}</p>
          </div>
          <div className={`rounded-xl border p-4 ${inf.due > 0 ? 'bg-amber-500/[0.06] border-amber-500/20' : 'bg-white/[0.03] border-white/5'}`}>
            <p className="text-xs text-neutral-500 mb-1">Reste à payer</p>
            <p className={`text-xl font-bold tabular-nums ${inf.due > 0 ? 'text-amber-300' : inf.due < 0 ? 'text-red-300' : 'text-emerald-400'}`}>{fcfa(inf.due)}</p>
            {inf.due < 0 && <p className="text-[11px] text-red-300/80 mt-0.5">Versé en trop</p>}
          </div>
        </div>

        <button type="button" onClick={() => setOpen((o) => !o)} aria-expanded={open}
          className="mt-4 flex items-center gap-1.5 text-sm text-purple-300 hover:text-purple-200">
          <ChevronDown className={`w-4 h-4 transition-transform ${open ? 'rotate-180' : ''}`} />
          {open ? 'Masquer le détail' : `Détail par station et versements (${inf.payouts.length})`}
        </button>
      </div>

      {open && (
        <div className="border-t border-white/5 p-5 sm:p-6 space-y-6">
          <div>
            <h3 className="text-sm font-bold text-white mb-3 flex items-center gap-2"><Building2 className="w-4 h-4 text-neutral-500" /> Stations inscrites par son lien</h3>
            {inf.stations.length === 0 ? (
              <p className="text-sm text-neutral-500">Aucune station inscrite par son lien pour le moment.</p>
            ) : (
              <div className="overflow-x-auto -mx-5 sm:-mx-6">
                <table className="w-full text-left border-collapse min-w-[760px] text-sm">
                  <thead>
                    <tr className="border-b border-white/10">
                      <th className="px-5 sm:px-6 py-2.5 font-semibold text-neutral-400">Station</th>
                      <th className="px-3 py-2.5 font-semibold text-neutral-400">Inscrite le</th>
                      <th className="px-3 py-2.5 font-semibold text-neutral-400">1er paiement</th>
                      <th className="px-3 py-2.5 font-semibold text-neutral-400">Commission jusqu’au</th>
                      <th className="px-3 py-2.5 font-semibold text-neutral-400 text-right">Paiements</th>
                      <th className="px-3 py-2.5 font-semibold text-neutral-400 text-right">Montant payé</th>
                      <th className="px-5 sm:px-6 py-2.5 font-semibold text-neutral-400 text-right">Commission</th>
                    </tr>
                  </thead>
                  <tbody>
                    {inf.stations.map((s) => {
                      const running = s.window_end && new Date(s.window_end) > new Date();
                      return (
                        <tr key={s.station_id} className="border-b border-white/5">
                          <td className="px-5 sm:px-6 py-2.5 text-white font-medium">{s.station_name}</td>
                          <td className="px-3 py-2.5 text-neutral-300">{dateFr(s.signed_up_at)}</td>
                          <td className="px-3 py-2.5 text-neutral-300">{s.first_paid_at ? dateFr(s.first_paid_at) : <span className="text-neutral-500">pas encore payé</span>}</td>
                          <td className="px-3 py-2.5 text-neutral-300">
                            {s.window_end ? <>{dateFr(s.window_end)}{running && <span className="ml-1.5 text-[11px] text-emerald-400">en cours</span>}</> : '—'}
                          </td>
                          <td className="px-3 py-2.5 text-right tabular-nums text-neutral-300">{fmt(s.payments)}</td>
                          <td className="px-3 py-2.5 text-right tabular-nums text-neutral-300">{fcfa(s.eligible_amount)}</td>
                          <td className="px-5 sm:px-6 py-2.5 text-right tabular-nums text-white font-bold">{fcfa(s.commission)}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          <div>
            <h3 className="text-sm font-bold text-white mb-3 flex items-center gap-2"><Receipt className="w-4 h-4 text-neutral-500" /> Historique des versements</h3>
            {inf.payouts.length === 0 ? (
              <p className="text-sm text-neutral-500">Aucun versement enregistré.</p>
            ) : (
              <ul className="divide-y divide-white/5 rounded-xl border border-white/5">
                {inf.payouts.map((p) => (
                  <li key={p.id} className="px-4 py-3 flex flex-wrap items-center justify-between gap-3">
                    <div className="min-w-0">
                      <p className="text-white font-bold tabular-nums">{fcfa(p.amount)} <span className="font-normal text-neutral-400">· {methodLabel(p.method)}{p.reference ? ` · réf. ${p.reference}` : ''}</span></p>
                      <p className="text-xs text-neutral-500">{dayFr(p.paid_on)}{p.note ? ` · ${p.note}` : ''}</p>
                    </div>
                    <button type="button" onClick={() => onDeletePayout(inf, p)} aria-label="Supprimer ce versement"
                      className="p-2 bg-white/5 hover:bg-red-500/20 hover:text-red-400 text-neutral-400 rounded-lg transition-colors">
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

export default function InfluencersPanel({ affiliates, marketing, onAffiliateUpdated, onReload, onCreateAffiliate }) {
  const [copied, copy] = useCopy();
  const [showMake, setShowMake] = useState(false);
  const [rateFor, setRateFor] = useState(null);
  const [payFor, setPayFor] = useState(null);

  const influencers = useMemo(() => {
    const byId = new Map((marketing?.influencers || []).map((i) => [i.affiliate_id, i]));
    return affiliates
      .filter((a) => a.is_influencer || byId.has(a.id))
      .map((a) => {
        const st = byId.get(a.id) || { earned: 0, paid: 0, stations: [], payouts: [] };
        const earned = Number(st.earned || 0);
        const paid = Number(st.paid || 0);
        return { ...a, earned, paid, due: earned - paid, stations: st.stations || [], payouts: st.payouts || [] };
      })
      .sort((x, y) => (Number(y.is_influencer) - Number(x.is_influencer)) || (y.due - x.due) || (y.earned - x.earned));
  }, [affiliates, marketing]);

  const totals = influencers.reduce((t, i) => ({
    earned: t.earned + i.earned, paid: t.paid + i.paid, due: t.due + Math.max(0, i.due),
  }), { earned: 0, paid: 0, due: 0 });
  const toPay = influencers.filter((i) => i.due > 0).length;
  const candidates = affiliates.filter((a) => !a.is_influencer);

  const updateAffiliate = async (id, fields) => {
    const { data, error } = await supabase.from('affiliates').update(fields).eq('id', id).select().single();
    if (error) throw new Error(error.message);
    onAffiliateUpdated(data);
    onReload();
  };
  const addPayout = async (row) => {
    const { error } = await supabase.from('affiliate_payouts').insert(row);
    if (error) throw new Error(error.message);
    onReload();
  };
  const deletePayout = async (inf, p) => {
    if (!window.confirm(`Supprimer le versement de ${fcfa(p.amount)} du ${dayFr(p.paid_on)} à ${inf.name} ? (La suppression est inscrite au journal d’audit.)`)) return;
    const { error } = await supabase.from('affiliate_payouts').delete().eq('id', p.id);
    if (error) { window.alert(`Suppression impossible : ${error.message}`); return; }
    onReload();
  };

  return (
    <>
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-6 mb-8">
        <KpiCard index={0} icon={Star} tone={tones.purple} title="Influenceurs" value={influencers.filter((i) => i.is_influencer).length}
          detail={`${plural(influencers.reduce((s, i) => s + i.stations.length, 0), 'station inscrite', 'stations inscrites')} par leurs liens`} />
        <KpiCard index={1} icon={Wallet} tone={tones.blue} title="Total gagné" display={fcfa(totals.earned)} detail="Commissions sur les paiements confirmés" />
        <KpiCard index={2} icon={HandCoins} tone={tones.emerald} title="Déjà versé" display={fcfa(totals.paid)} detail={plural(influencers.reduce((s, i) => s + i.payouts.length, 0), 'versement', 'versements')} />
        <KpiCard index={3} icon={Hourglass} tone={tones.amber} title="Reste à payer" display={fcfa(totals.due)} detail={toPay > 0 ? plural(toPay, 'influenceur à payer', 'influenceurs à payer') : 'Tout le monde est à jour'} />
      </div>

      <Card
        title="Influenceurs et cashout"
        subtitle="Depuis le début — vous seul voyez ces chiffres (l’influenceur n’a pas d’accès)"
        className="mb-8"
        right={(
          <button type="button" onClick={() => setShowMake(true)}
            className="bg-purple-600 hover:bg-purple-500 text-white px-4 py-2.5 rounded-xl font-bold transition-all shadow-lg shadow-purple-500/20 flex items-center gap-2 text-sm">
            <Plus className="w-4 h-4" /> Ajouter un influenceur
          </button>
        )}
      >
        {influencers.length === 0 ? (
          <p className="text-neutral-500 text-sm py-6 text-center">Aucun influenceur pour le moment. Marquez un affilié comme influenceur pour suivre ses commissions et ses versements.</p>
        ) : (
          <div className="space-y-4">
            {influencers.map((inf) => (
              <InfluencerCard key={inf.id} inf={inf} copied={copied} onCopy={copy}
                onPay={setPayFor} onEditRate={setRateFor} onDeletePayout={deletePayout} />
            ))}
          </div>
        )}
      </Card>

      <div className="flex gap-3 rounded-2xl border border-white/5 bg-white/[0.02] p-5 text-sm text-neutral-400 leading-relaxed">
        <Info className="w-5 h-5 text-purple-400 flex-shrink-0 mt-0.5" />
        <p>
          Une station compte pour un influenceur si elle s’est inscrite après être arrivée par son lien (?ref=…).
          Il gagne son taux (20 % par défaut) sur chaque paiement confirmé de la station à la plateforme — abonnement ou publicité « à la une » —
          pendant les 3 mois qui suivent son 1er paiement. Les paiements en attente ou refusés ne comptent pas.
          Chaque versement, suppression ou changement de taux est inscrit au journal d’audit.
        </p>
      </div>

      <AnimatePresence>
        {showMake && (
          <MakeInfluencerModal candidates={candidates} onClose={() => setShowMake(false)} onSave={updateAffiliate}
            onCreateNew={() => { setShowMake(false); onCreateAffiliate(); }} />
        )}
        {rateFor && <RateModal influencer={rateFor} onClose={() => setRateFor(null)} onSave={updateAffiliate} />}
        {payFor && <PayoutModal influencer={payFor} onClose={() => setPayFor(null)} onSave={addPayout} />}
      </AnimatePresence>
    </>
  );
}
