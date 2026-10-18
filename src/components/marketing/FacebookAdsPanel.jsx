import React, { useMemo, useState } from 'react';
import { AnimatePresence } from 'framer-motion';
import { Banknote, Eye, UserPlus, BadgeCheck, TrendingUp, Plus, Trash2, Info, Megaphone, Receipt } from 'lucide-react';
import { supabase } from '../../lib/supabaseClient';
import { Card, Field, KpiCard, Modal, SourceChip, dayFr, fcfa, fmt, inputCls, rate, todayKey, tones } from './shared';

// Super Admin > Affiliés > Facebook Ads : dépenses publicitaires saisies par
// campagne (table ad_spends) face à ce que la campagne a rapporté — visites
// des liens de suivi portant ce nom de campagne (utm_campaign), stations
// inscrites, payantes, revenus. Chiffres : marketing_stats()
// (add_influencers_facebook_ads.sql), depuis le début.

const AD_NETWORKS = [
  { key: 'facebook', label: 'Facebook / Instagram (Meta)' },
  { key: 'tiktok', label: 'TikTok' },
  { key: 'google', label: 'Google' },
  { key: 'autre', label: 'Autre' },
];
const networkLabel = (k) => AD_NETWORKS.find((n) => n.key === k)?.label || (k === 'instagram' ? 'Instagram' : 'Autre');
const PAID_SOURCES = ['facebook', 'instagram'];

const costPer = (spend, n) => (spend > 0 && n > 0 ? fcfa(spend / n) : '—');
const roas = (revenue, spend) => (spend > 0 ? `× ${(revenue / spend).toLocaleString('fr-FR', { maximumFractionDigits: 2 })}` : '—');

function SpendModal({ campaigns, initialCampaign, onClose, onSave }) {
  const [form, setForm] = useState({
    campaign: initialCampaign || '', network: 'facebook', amount: '',
    period_start: todayKey(), period_end: todayKey(), note: '',
  });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));

  const submit = async (e) => {
    e.preventDefault();
    // Comparé au utm_campaign sans majuscules ni espaces (campaign_key() côté SQL).
    const campaign = form.campaign.trim().slice(0, 60);
    const amount = Math.round(Number(String(form.amount).replace(/[\s ]/g, '').replace(',', '.')));
    if (!campaign) return setError('Indiquez le nom de la campagne (celui de son lien de suivi).');
    if (!(amount > 0)) return setError('Indiquez le montant dépensé.');
    if (!form.period_start || !form.period_end) return setError('Indiquez la période de la campagne.');
    if (form.period_end < form.period_start) return setError('La fin de période doit suivre le début.');
    setBusy(true);
    setError('');
    try {
      await onSave({
        campaign, network: form.network, amount, period_start: form.period_start, period_end: form.period_end,
        note: form.note.trim() || null,
      });
      onClose();
    } catch (err) {
      setError(err.message);
      setBusy(false);
    }
  };

  return (
    <Modal id="spend-title" title="Ajouter une dépense" onClose={onClose} busy={busy}
      intro="Notez ce que vous avez payé pour une campagne (voir le Gestionnaire de publicités Meta). Plusieurs dépenses d’une même campagne s’additionnent.">
      <form onSubmit={submit} className="space-y-4">
        <Field label="Campagne" htmlFor="spend-campaign" hint="Le même nom que dans son lien de suivi (…&utm_campaign=promo-octobre).">
          <input id="spend-campaign" list="spend-campaigns" className={inputCls} value={form.campaign} maxLength={60} placeholder="Ex. promo-octobre" onChange={set('campaign')} />
          <datalist id="spend-campaigns">
            {campaigns.map((c) => <option key={c.campaign_key} value={c.campaign_key} />)}
          </datalist>
        </Field>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <Field label="Montant (FCFA)" htmlFor="spend-amount">
            <input id="spend-amount" inputMode="numeric" className={inputCls} value={form.amount} placeholder="Ex. 25000" onChange={set('amount')} />
          </Field>
          <Field label="Régie" htmlFor="spend-network">
            <select id="spend-network" className={`${inputCls} appearance-none`} value={form.network} onChange={set('network')}>
              {AD_NETWORKS.map((n) => <option key={n.key} value={n.key}>{n.label}</option>)}
            </select>
          </Field>
          <Field label="Du" htmlFor="spend-start">
            <input id="spend-start" type="date" className={inputCls} value={form.period_start} onChange={set('period_start')} />
          </Field>
          <Field label="Au" htmlFor="spend-end">
            <input id="spend-end" type="date" className={inputCls} value={form.period_end} min={form.period_start} onChange={set('period_end')} />
          </Field>
        </div>
        <Field label="Note (facultatif)" htmlFor="spend-note">
          <textarea id="spend-note" rows={2} className={inputCls} value={form.note} maxLength={300} placeholder="Ex. ciblage Dakar, 25-45 ans" onChange={set('note')} />
        </Field>
        {error && <p className="text-sm text-red-400">{error}</p>}
        <div className="pt-4 border-t border-white/10">
          <button type="submit" disabled={busy} className="w-full bg-purple-600 hover:bg-purple-500 disabled:opacity-60 text-white font-bold py-3 px-4 rounded-xl transition-colors flex items-center justify-center gap-2">
            <Plus className="w-5 h-5" /> {busy ? 'Enregistrement…' : 'Enregistrer la dépense'}
          </button>
        </div>
      </form>
    </Modal>
  );
}

export default function FacebookAdsPanel({ marketing, onReload, onShowLinks }) {
  const [spendFor, setSpendFor] = useState(null); // null : fermé ; '' : nouvelle campagne
  const [showAll, setShowAll] = useState(false);

  const allCampaigns = marketing?.campaigns || [];
  const spends = marketing?.spends || [];
  // Par défaut : campagnes avec une dépense, ou vues depuis Facebook / Instagram.
  const campaigns = useMemo(() => allCampaigns.filter((c) => showAll || Number(c.spend) > 0
    || (c.sources || []).some((s) => PAID_SOURCES.includes(s))), [allCampaigns, showAll]);
  const hidden = allCampaigns.length - campaigns.length;

  const withSpend = allCampaigns.filter((c) => Number(c.spend) > 0);
  const t = withSpend.reduce((s, c) => ({
    spend: s.spend + Number(c.spend), visits: s.visits + c.visits, uniques: s.uniques + c.uniques,
    signups: s.signups + c.signups, paying: s.paying + c.paying, revenue: s.revenue + Number(c.revenue),
  }), { spend: 0, visits: 0, uniques: 0, signups: 0, paying: 0, revenue: 0 });

  const addSpend = async (row) => {
    const { error } = await supabase.from('ad_spends').insert(row);
    if (error) throw new Error(error.message);
    onReload();
  };
  const deleteSpend = async (s) => {
    if (!window.confirm(`Supprimer la dépense de ${fcfa(s.amount)} (campagne « ${s.campaign} ») ?`)) return;
    const { error } = await supabase.from('ad_spends').delete().eq('id', s.id);
    if (error) { window.alert(`Suppression impossible : ${error.message}`); return; }
    onReload();
  };

  return (
    <>
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-5 gap-6 mb-8">
        <KpiCard index={0} icon={Banknote} tone={tones.blue} title="Dépensé" display={fcfa(t.spend)}
          detail={`${withSpend.length} campagne${withSpend.length > 1 ? 's' : ''} avec dépense`} />
        <KpiCard index={1} icon={Eye} tone={tones.purple} title="Visites" value={t.visits} detail={`${fmt(t.uniques)} visiteurs uniques · ${costPer(t.spend, t.visits)} / visite`} />
        <KpiCard index={2} icon={UserPlus} tone={tones.amber} title="Stations inscrites" value={t.signups} detail={`${costPer(t.spend, t.signups)} / inscrite`} />
        <KpiCard index={3} icon={BadgeCheck} tone={tones.emerald} title="Stations payantes" value={t.paying} detail={`${costPer(t.spend, t.paying)} / payante`} />
        <KpiCard index={4} icon={TrendingUp} tone={tones.pink} title="Retour sur dépense" display={roas(t.revenue, t.spend)}
          detail={`${fcfa(t.revenue)} de revenus générés`} />
      </div>

      <Card
        title="Par campagne"
        subtitle="Depuis le début de chaque campagne — revenus = paiements confirmés des stations inscrites par ses liens"
        className="mb-8"
        right={(
          <button type="button" onClick={() => setSpendFor('')}
            className="bg-purple-600 hover:bg-purple-500 text-white px-4 py-2.5 rounded-xl font-bold transition-all shadow-lg shadow-purple-500/20 flex items-center gap-2 text-sm">
            <Plus className="w-4 h-4" /> Ajouter une dépense
          </button>
        )}
      >
        {campaigns.length === 0 ? (
          <p className="text-neutral-500 text-sm py-6 text-center">
            Aucune campagne pour le moment. Créez un lien de suivi avec un nom de campagne (onglet{' '}
            <button type="button" onClick={onShowLinks} className="text-purple-300 underline">Liens & affiliés</button>),
            mettez-le dans votre publicité Facebook, puis notez ici ce que vous avez dépensé.
          </p>
        ) : (
          <div className="overflow-x-auto -mx-6">
            <table className="w-full text-left border-collapse min-w-[1080px] text-sm">
              <thead>
                <tr className="border-b border-white/10">
                  <th className="px-6 py-3 font-semibold text-neutral-400">Campagne</th>
                  <th className="px-3 py-3 font-semibold text-neutral-400 text-right">Dépense</th>
                  <th className="px-3 py-3 font-semibold text-neutral-400 text-right">Visites</th>
                  <th className="px-3 py-3 font-semibold text-neutral-400 text-right">Uniques</th>
                  <th className="px-3 py-3 font-semibold text-neutral-400 text-right">Inscrites</th>
                  <th className="px-3 py-3 font-semibold text-neutral-400 text-right">Payantes</th>
                  <th className="px-3 py-3 font-semibold text-neutral-400 text-right">Revenus</th>
                  <th className="px-3 py-3 font-semibold text-neutral-400 text-right">Coût / visite</th>
                  <th className="px-3 py-3 font-semibold text-neutral-400 text-right">Coût / inscrite</th>
                  <th className="px-3 py-3 font-semibold text-neutral-400 text-right">Coût / payante</th>
                  <th className="px-6 py-3 font-semibold text-neutral-400 text-right" title="Revenus générés / dépense">Retour</th>
                </tr>
              </thead>
              <tbody>
                {campaigns.map((c) => {
                  const spend = Number(c.spend);
                  const revenue = Number(c.revenue);
                  const ratio = spend > 0 ? revenue / spend : null;
                  return (
                    <tr key={c.campaign_key} className="border-b border-white/5 hover:bg-white/[0.02] transition-colors">
                      <td className="px-6 py-3">
                        <p className="font-bold text-white flex items-center gap-2"><Megaphone className="w-4 h-4 text-neutral-500 flex-shrink-0" />{c.label}</p>
                        <div className="flex flex-wrap items-center gap-1.5 mt-1">
                          {(c.sources || []).map((s) => <SourceChip key={s} source={s} />)}
                          {c.period_start && <span className="text-xs text-neutral-500">{dayFr(c.period_start)} → {dayFr(c.period_end)}</span>}
                        </div>
                      </td>
                      <td className="px-3 py-3 text-right tabular-nums">
                        {spend > 0 ? <span className="text-white font-medium">{fcfa(spend)}</span> : (
                          <button type="button" onClick={() => setSpendFor(c.campaign_key)} className="text-xs font-bold text-purple-300 hover:underline">+ dépense</button>
                        )}
                      </td>
                      <td className="px-3 py-3 text-right tabular-nums text-white">{fmt(c.visits)}</td>
                      <td className="px-3 py-3 text-right tabular-nums text-neutral-300">{fmt(c.uniques)}</td>
                      <td className="px-3 py-3 text-right tabular-nums text-white">{fmt(c.signups)}
                        {c.uniques > 0 && <span className="block text-[11px] text-neutral-500">{rate(c.signups, c.uniques)} des uniques</span>}
                      </td>
                      <td className="px-3 py-3 text-right tabular-nums text-white">{fmt(c.paying)}
                        {c.signups > 0 && <span className="block text-[11px] text-neutral-500">{rate(c.paying, c.signups)} des inscrites</span>}
                      </td>
                      <td className="px-3 py-3 text-right tabular-nums text-white">{fcfa(revenue)}</td>
                      <td className="px-3 py-3 text-right tabular-nums text-neutral-300">{costPer(spend, c.visits)}</td>
                      <td className="px-3 py-3 text-right tabular-nums text-neutral-300">{costPer(spend, c.signups)}</td>
                      <td className="px-3 py-3 text-right tabular-nums text-neutral-300">{costPer(spend, c.paying)}</td>
                      <td className={`px-6 py-3 text-right tabular-nums font-bold ${ratio == null ? 'text-neutral-600' : ratio >= 1 ? 'text-emerald-400' : 'text-amber-300'}`}>
                        {roas(revenue, spend)}
                        {ratio != null && <span className="block text-[11px] font-normal text-neutral-500">{ratio >= 1 ? 'rentable' : 'pas encore rentable'}</span>}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
        {(hidden > 0 || showAll) && (
          <label className="mt-4 flex items-center gap-2 text-sm text-neutral-400 cursor-pointer w-fit">
            <input type="checkbox" checked={showAll} onChange={(e) => setShowAll(e.target.checked)} className="accent-purple-500" />
            Afficher aussi les campagnes sans dépense hors Facebook / Instagram{hidden > 0 ? ` (${hidden})` : ''}
          </label>
        )}
      </Card>

      <Card title="Dépenses enregistrées" subtitle="Ce que vous avez payé, campagne par campagne" className="mb-8">
        {spends.length === 0 ? (
          <p className="text-neutral-500 text-sm py-4 text-center">Aucune dépense enregistrée.</p>
        ) : (
          <ul className="divide-y divide-white/5 -my-2">
            {spends.map((s) => (
              <li key={s.id} className="py-3 flex flex-wrap items-center justify-between gap-3">
                <div className="min-w-0 flex items-start gap-3">
                  <Receipt className="w-4 h-4 text-neutral-500 mt-1 flex-shrink-0" />
                  <div className="min-w-0">
                    <p className="text-white font-bold tabular-nums">{fcfa(s.amount)} <span className="font-normal text-neutral-400">· {s.campaign} · {networkLabel(s.network)}</span></p>
                    <p className="text-xs text-neutral-500">{dayFr(s.period_start)} → {dayFr(s.period_end)}{s.note ? ` · ${s.note}` : ''}</p>
                  </div>
                </div>
                <button type="button" onClick={() => deleteSpend(s)} aria-label={`Supprimer la dépense ${s.campaign}`}
                  className="p-2 bg-white/5 hover:bg-red-500/20 hover:text-red-400 text-neutral-400 rounded-lg transition-colors">
                  <Trash2 className="w-4 h-4" />
                </button>
              </li>
            ))}
          </ul>
        )}
      </Card>

      <div className="flex gap-3 rounded-2xl border border-white/5 bg-white/[0.02] p-5 text-sm text-neutral-400 leading-relaxed">
        <Info className="w-5 h-5 text-purple-400 flex-shrink-0 mt-0.5" />
        <p>
          Dans votre publicité Facebook, mettez comme lien un{' '}
          <button type="button" onClick={onShowLinks} className="text-purple-300 underline">lien de suivi</button>{' '}
          (réseau Facebook + nom de campagne) : chaque visite, inscription et paiement de station est alors rattaché à la campagne.
          Une station est « payante » dès son 1er paiement confirmé (abonnement ou publicité). Retour sur dépense = revenus générés / dépense :
          au-dessus de × 1, la campagne a rapporté plus qu’elle n’a coûté.
        </p>
      </div>

      <AnimatePresence>
        {spendFor !== null && <SpendModal campaigns={allCampaigns} initialCampaign={spendFor} onClose={() => setSpendFor(null)} onSave={addSpend} />}
      </AnimatePresence>
    </>
  );
}
