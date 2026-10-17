import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Share2, Eye, Mail, MessageCircle, UserPlus, Search, X, Plus, Copy, Check, Link2, Trash2,
  CheckCircle2, RotateCcw, Info, Smartphone, Monitor, Tablet, Megaphone, AlertTriangle, Reply,
} from 'lucide-react';
import { supabase } from '../../lib/supabaseClient';
import { useDocumentTitle } from '../../lib/useDocumentTitle';
import PeriodFilter from '../../components/ui/PeriodFilter';
import Pagination from '../../components/ui/Pagination';
import { AreaChart, Donut, Legend } from '../../components/ui/charts';
import { sourceInfo, LINK_NETWORKS, trackedLink, slugCode, normalizeRef } from '../../lib/trafficSources';

// Super Admin > Affiliés : d'où viennent les visiteurs du site public et ceux
// qui écrivent (formulaire Contact, WhatsApp, appel) ou s'inscrivent — réseaux
// sociaux, recherche, liens d'affiliés. Données : site_traffic_stats(),
// contact_messages, affiliates (add_affiliates_tracking.sql) ; collecte :
// src/visit-tracker.js et lib/attribution.js.

const TABS = [
  { key: 'provenance', label: 'Provenance', icon: Share2 },
  { key: 'messages', label: 'Messages', icon: Mail },
  { key: 'liens', label: 'Liens & affiliés', icon: Link2 },
];

const MONTHS_SHORT = ['janv.', 'févr.', 'mars', 'avr.', 'mai', 'juin', 'juil.', 'août', 'sept.', 'oct.', 'nov.', 'déc.'];
const pad2 = (n) => String(n).padStart(2, '0');
const dayKey = (d) => `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
const monthKey = (d) => `${d.getFullYear()}-${pad2(d.getMonth() + 1)}`;
const fmt = (n) => Number(n || 0).toLocaleString('fr-FR');
const pct = (part, total) => (total > 0 ? Math.round((part / total) * 100) : 0);
const plural = (n, one, many) => `${fmt(n)} ${n > 1 ? many : one}`;

const MESSAGE_STATUS = {
  nouveau: { label: 'À traiter', className: 'bg-blue-500/10 text-blue-300 border-blue-500/20' },
  traite: { label: 'Traité', className: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20' },
};

const DEVICES = [
  { key: 'mobile', label: 'Téléphone', icon: Smartphone },
  { key: 'ordinateur', label: 'Ordinateur', icon: Monitor },
  { key: 'tablette', label: 'Tablette', icon: Tablet },
];

// Plage demandée au serveur et cases de la courbe, selon le filtre de période.
// En « Tous » : jours depuis la 1re visite, regroupés par mois au-delà de 62 jours.
// La courbe s'arrête à aujourd'hui (pas de chute à zéro sur les jours à venir).
function periodOf(segment, day, month, year, firstEventAt) {
  const now = new Date();
  if (segment === 'jour') {
    const [y, m, d] = day.split('-').map(Number);
    const from = new Date(y, m - 1, d);
    const to = new Date(y, m - 1, d + 1);
    const hours = dayKey(from) === dayKey(now) ? now.getHours() + 1 : 24;
    const slots = Array.from({ length: hours }, (_, h) => ({ key: `${dayKey(from)} ${pad2(h)}`, label: `${pad2(h)} h` }));
    return { from, to, bucket: 'hour', group: 'hour', slots };
  }
  if (segment === 'mois') {
    const from = new Date(year, month, 1);
    const to = new Date(year, month + 1, 1);
    const current = year === now.getFullYear() && month === now.getMonth();
    const n = current ? now.getDate() : new Date(year, month + 1, 0).getDate();
    const slots = Array.from({ length: n }, (_, i) => {
      const d = new Date(year, month, i + 1);
      return { key: dayKey(d), label: `${i + 1}` };
    });
    return { from, to, bucket: 'day', group: 'day', slots };
  }
  if (segment === 'annee') {
    const from = new Date(year, 0, 1);
    const to = new Date(year + 1, 0, 1);
    const months = year === now.getFullYear() ? now.getMonth() + 1 : 12;
    const slots = MONTHS_SHORT.slice(0, months).map((label, i) => ({ key: `${year}-${pad2(i + 1)}`, label }));
    return { from, to, bucket: 'month', group: 'month', slots };
  }
  // Tous
  const first = firstEventAt ? new Date(firstEventAt) : now;
  const start = new Date(first.getFullYear(), first.getMonth(), first.getDate());
  const to = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);
  const spanDays = Math.round((to - start) / 86400000);
  if (spanDays <= 62) {
    const slots = Array.from({ length: Math.max(1, spanDays) }, (_, i) => {
      const d = new Date(start.getFullYear(), start.getMonth(), start.getDate() + i);
      return { key: dayKey(d), label: `${d.getDate()} ${MONTHS_SHORT[d.getMonth()]}` };
    });
    return { from: new Date(2026, 0, 1), to, bucket: 'day', group: 'day', slots };
  }
  const slots = [];
  for (let d = new Date(start.getFullYear(), start.getMonth(), 1); d < to; d = new Date(d.getFullYear(), d.getMonth() + 1, 1)) {
    slots.push({ key: monthKey(d), label: `${MONTHS_SHORT[d.getMonth()]} ${String(d.getFullYear()).slice(2)}` });
  }
  return { from: new Date(2026, 0, 1), to, bucket: 'day', group: 'month', slots };
}

const slotKeyOf = (iso, group) => {
  const d = new Date(iso);
  if (group === 'hour') return `${dayKey(d)} ${pad2(d.getHours())}`;
  if (group === 'month') return monthKey(d);
  return dayKey(d);
};

// Base pas encore à jour (script add_affiliates_tracking.sql non exécuté).
const isMissingSchema = (error) => ['PGRST202', '42883', '42P01', 'PGRST205', '42703'].includes(error?.code);

function useCopy() {
  const [copied, setCopied] = useState(null);
  const copy = useCallback(async (text, id = text) => {
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      const el = document.createElement('textarea');
      el.value = text;
      document.body.appendChild(el);
      el.select();
      try { document.execCommand('copy'); } catch { /* rien */ }
      el.remove();
    }
    setCopied(id);
    setTimeout(() => setCopied((c) => (c === id ? null : c)), 2000);
  }, []);
  return [copied, copy];
}

function SourceChip({ source, className = '' }) {
  const info = sourceInfo(source);
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full bg-white/[0.05] border border-white/10 px-2.5 py-0.5 text-xs font-medium text-neutral-200 ${className}`}>
      <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: info.color, boxShadow: `0 0 6px ${info.color}88` }} />
      {info.label}
    </span>
  );
}

function KpiCard({ icon: Icon, tone, title, value, detail, index }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: index * 0.06 }}
      className="glass-card rounded-2xl p-6 border border-white/5 bg-white/[0.02]"
    >
      <div className={`p-3 rounded-xl w-fit mb-4 ${tone.bg}`}><Icon className={`w-6 h-6 ${tone.text}`} /></div>
      <p className="text-neutral-400 text-sm font-medium mb-1">{title}</p>
      <h3 className="text-3xl font-bold text-white tabular-nums">{fmt(value)}</h3>
      {detail && <p className="text-xs text-neutral-500 mt-1.5 leading-relaxed">{detail}</p>}
    </motion.div>
  );
}

function Card({ title, subtitle, children, className = '', right }) {
  return (
    <div className={`glass-card rounded-2xl p-6 border border-white/5 bg-white/[0.02] ${className}`}>
      <div className="flex flex-wrap items-start justify-between gap-3 mb-5">
        <div>
          <h2 className="text-lg font-bold text-white">{title}</h2>
          {subtitle && <p className="text-sm text-neutral-500 mt-0.5">{subtitle}</p>}
        </div>
        {right}
      </div>
      {children}
    </div>
  );
}

const inputCls = 'w-full bg-neutral-950 border border-white/10 rounded-xl px-4 py-3 text-white placeholder-neutral-600 focus:outline-none focus:border-purple-500';

// ─── Fenêtre « Ajouter un affilié » ─────────────────────────────────────
function AffiliateModal({ onClose, onSave }) {
  const [form, setForm] = useState({ name: '', code: '', network: 'facebook', contact: '', note: '' });
  const [codeTouched, setCodeTouched] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));

  const submit = async (e) => {
    e.preventDefault();
    const name = form.name.trim();
    const code = normalizeRef(form.code);
    if (name.length < 2) return setError('Indiquez le nom de l’affilié.');
    if (!code) return setError('Le code doit faire 2 à 30 caractères : lettres minuscules, chiffres, « - » ou « _ ».');
    setBusy(true);
    setError('');
    try {
      await onSave({ name, code, network: form.network, contact: form.contact.trim() || null, note: form.note.trim() || null });
      onClose();
    } catch (err) {
      setError(err.message);
      setBusy(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm" onClick={(e) => { if (e.target === e.currentTarget && !busy) onClose(); }}>
      <motion.div
        initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.95 }}
        role="dialog" aria-modal="true" aria-labelledby="affiliate-title"
        className="bg-neutral-900 border border-white/10 rounded-2xl p-6 w-full max-w-md shadow-2xl relative max-h-[90vh] overflow-y-auto"
      >
        <button onClick={onClose} disabled={busy} aria-label="Fermer" className="modal-close"><X className="w-6 h-6" /></button>
        <h2 id="affiliate-title" className="text-2xl font-bold text-white mb-1">Ajouter un affilié</h2>
        <p className="text-sm text-neutral-400 mb-6">Un partenaire (influenceur, ambassadeur, page amie…) qui partage son propre lien : vous voyez ce qu’il vous apporte.</p>
        <form onSubmit={submit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-neutral-400 mb-1" htmlFor="aff-name">Nom</label>
            <input id="aff-name" className={inputCls} value={form.name} placeholder="Ex. Awa Diop"
              onChange={(e) => { const name = e.target.value; setForm((f) => ({ ...f, name, code: codeTouched ? f.code : slugCode(name) })); }} />
          </div>
          <div>
            <label className="block text-sm font-medium text-neutral-400 mb-1" htmlFor="aff-code">Code du lien</label>
            <input id="aff-code" className={inputCls} value={form.code} placeholder="awa-diop"
              onChange={(e) => { setCodeTouched(true); setForm((f) => ({ ...f, code: e.target.value.toLowerCase().replace(/\s+/g, '-') })); }} />
            <p className="text-xs text-neutral-500 mt-1.5">Son lien : …/?ref={form.code || 'code'}</p>
          </div>
          <div>
            <label className="block text-sm font-medium text-neutral-400 mb-1" htmlFor="aff-network">Réseau principal</label>
            <select id="aff-network" className={`${inputCls} appearance-none`} value={form.network} onChange={set('network')}>
              {LINK_NETWORKS.map((n) => <option key={n.key} value={n.key}>{n.label}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-neutral-400 mb-1" htmlFor="aff-contact">Contact (facultatif)</label>
            <input id="aff-contact" className={inputCls} value={form.contact} maxLength={120} placeholder="Téléphone ou email" onChange={set('contact')} />
          </div>
          <div>
            <label className="block text-sm font-medium text-neutral-400 mb-1" htmlFor="aff-note">Note (facultatif)</label>
            <textarea id="aff-note" rows={2} className={inputCls} value={form.note} maxLength={300} placeholder="Ex. commission convenue, page Facebook…" onChange={set('note')} />
          </div>
          {error && <p className="text-sm text-red-400">{error}</p>}
          <div className="pt-4 border-t border-white/10">
            <button type="submit" disabled={busy} className="w-full bg-purple-600 hover:bg-purple-500 disabled:opacity-60 text-white font-bold py-3 px-4 rounded-xl transition-colors flex items-center justify-center gap-2">
              <Plus className="w-5 h-5" /> {busy ? 'Enregistrement…' : 'Ajouter l’affilié'}
            </button>
          </div>
        </form>
      </motion.div>
    </div>
  );
}

export default function Affiliates() {
  useDocumentTitle('Affiliés');
  const today = new Date();
  const [tab, setTab] = useState('provenance');
  const [segment, setSegment] = useState('mois');
  const [day, setDay] = useState(dayKey(today));
  const [month, setMonth] = useState(today.getMonth());
  const [year, setYear] = useState(today.getFullYear());

  const [stats, setStats] = useState(null);
  const [messages, setMessages] = useState([]);
  const [affiliates, setAffiliates] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [schemaMissing, setSchemaMissing] = useState(false);
  const [firstEventAt, setFirstEventAt] = useState(null);

  const period = useMemo(() => periodOf(segment, day, month, year, firstEventAt), [segment, day, month, year, firstEventAt]);
  const fromIso = period.from.toISOString();
  const toIso = period.to.toISOString();

  const yearOptions = useMemo(() => {
    const first = firstEventAt ? new Date(firstEventAt).getFullYear() : today.getFullYear();
    const list = [];
    for (let y = Math.min(first, today.getFullYear()); y <= today.getFullYear(); y++) list.push(y);
    return list;
  }, [firstEventAt]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setLoadError('');
    (async () => {
      const [statsRes, messagesRes, affiliatesRes] = await Promise.all([
        supabase.rpc('site_traffic_stats', { p_from: fromIso, p_to: toIso, p_bucket: period.bucket }),
        supabase.from('contact_messages')
          .select('id, created_at, name, email, subject, message, status, source, medium, campaign, ref, affiliate_id, referrer_host, landing_path')
          .gte('created_at', fromIso).lt('created_at', toIso)
          .order('created_at', { ascending: false }).limit(1000),
        supabase.from('affiliates').select('*').order('created_at', { ascending: false }),
      ]);
      if (cancelled) return;
      const failure = [statsRes, messagesRes, affiliatesRes].find((r) => r.error);
      if (failure) {
        console.error('Affiliés :', failure.error);
        setSchemaMissing(isMissingSchema(failure.error));
        setLoadError(failure.error.message || 'Chargement impossible.');
        setLoading(false);
        return;
      }
      setSchemaMissing(false);
      setStats(statsRes.data || {});
      if (statsRes.data?.first_event_at) setFirstEventAt(statsRes.data.first_event_at);
      setMessages(messagesRes.data || []);
      setAffiliates(affiliatesRes.data || []);
      setLoading(false);
    })();
    return () => { cancelled = true; };
  }, [fromIso, toIso, period.bucket]);

  // ─── Agrégats par provenance ──────────────────────────────────────────
  const bySource = useMemo(() => {
    const map = new Map();
    const row = (key) => {
      if (!map.has(key)) map.set(key, { key, visite: 0, whatsapp: 0, appel: 0, inscriptions: 0, messages: 0 });
      return map.get(key);
    };
    for (const e of stats?.events || []) {
      const r = row(e.source);
      if (e.kind.startsWith('inscription_')) r.inscriptions += e.count;
      else r[e.kind] += e.count;
    }
    for (const m of stats?.messages || []) row(m.source).messages += m.count;
    return [...map.values()]
      .map((r) => ({ ...r, contacts: r.messages + r.whatsapp + r.appel }))
      .sort((a, b) => (b.visite - a.visite) || (b.contacts - a.contacts) || (b.inscriptions - a.inscriptions));
  }, [stats]);

  const totals = useMemo(() => bySource.reduce((t, r) => ({
    visite: t.visite + r.visite, messages: t.messages + r.messages, whatsapp: t.whatsapp + r.whatsapp,
    appel: t.appel + r.appel, inscriptions: t.inscriptions + r.inscriptions,
  }), { visite: 0, messages: 0, whatsapp: 0, appel: 0, inscriptions: 0 }), [bySource]);

  const signupsByKind = useMemo(() => {
    const out = { inscription_station: 0, inscription_automobiliste: 0, inscription_groupe: 0 };
    for (const e of stats?.events || []) if (e.kind in out) out[e.kind] += e.count;
    return out;
  }, [stats]);

  const topOf = (field) => {
    const best = [...bySource].sort((a, b) => b[field] - a[field])[0];
    const total = bySource.reduce((s, r) => s + r[field], 0);
    return best && best[field] > 0 ? `1re source : ${sourceInfo(best.key).label} (${pct(best[field], total)} %)` : 'Rien sur la période';
  };

  // Courbe : total des visites + les 3 premières sources.
  const topSources = bySource.filter((r) => r.visite > 0).slice(0, 3).map((r) => r.key);
  const chartData = useMemo(() => {
    const slots = period.slots.map((s) => ({ label: s.label, key: s.key, total: 0 }));
    const index = new Map(slots.map((s, i) => [s.key, i]));
    for (const p of stats?.series || []) {
      const i = index.get(slotKeyOf(p.bucket, period.group));
      if (i == null) continue;
      slots[i].total += p.count;
      slots[i][p.source] = (slots[i][p.source] || 0) + p.count;
    }
    return slots;
  }, [stats, period]);
  const chartSeries = [
    { key: 'total', label: 'Toutes les visites', color: '#a855f7' },
    ...topSources.map((k) => ({ key: k, label: sourceInfo(k).label, color: sourceInfo(k).color })),
  ];
  const donutData = bySource.filter((r) => r.visite > 0).map((r) => ({ label: sourceInfo(r.key).label, value: r.visite, color: sourceInfo(r.key).color }));
  const devices = useMemo(() => {
    const counts = Object.fromEntries((stats?.devices || []).map((d) => [d.device, d.count]));
    const total = Object.values(counts).reduce((s, n) => s + n, 0);
    return DEVICES.map((d) => ({ ...d, count: counts[d.key] || 0, share: pct(counts[d.key] || 0, total) }));
  }, [stats]);

  // ─── Messages ─────────────────────────────────────────────────────────
  const [msgSearch, setMsgSearch] = useState('');
  const [msgStatus, setMsgStatus] = useState('tous');
  const [msgSource, setMsgSource] = useState('toutes');
  const [msgPage, setMsgPage] = useState(1);
  const [msgPageSize, setMsgPageSize] = useState(10);
  const [expanded, setExpanded] = useState({});
  const affiliateById = useMemo(() => new Map(affiliates.map((a) => [a.id, a])), [affiliates]);
  const messageSources = useMemo(() => [...new Set(messages.map((m) => m.source || 'inconnu'))], [messages]);
  const filteredMessages = messages.filter((m) => {
    if (msgStatus !== 'tous' && m.status !== msgStatus) return false;
    if (msgSource !== 'toutes' && (m.source || 'inconnu') !== msgSource) return false;
    const q = msgSearch.trim().toLowerCase();
    return !q || [m.name, m.email, m.subject, m.message].some((v) => (v || '').toLowerCase().includes(q));
  });
  useEffect(() => { setMsgPage(1); }, [msgSearch, msgStatus, msgSource, fromIso]);
  const msgTotalPages = Math.max(1, Math.ceil(filteredMessages.length / msgPageSize));
  const msgCurrentPage = Math.min(msgPage, msgTotalPages);
  const pageMessages = filteredMessages.slice((msgCurrentPage - 1) * msgPageSize, msgCurrentPage * msgPageSize);
  const toTreat = messages.filter((m) => m.status === 'nouveau').length;

  const setMessageStatus = async (id, status) => {
    const { error } = await supabase.from('contact_messages').update({ status }).eq('id', id);
    if (error) { window.alert(`Mise à jour impossible : ${error.message}`); return; }
    setMessages((prev) => prev.map((m) => (m.id === id ? { ...m, status } : m)));
    window.dispatchEvent(new Event('ccg:contact-messages-changed')); // pastille du menu
  };

  // ─── Liens & affiliés ─────────────────────────────────────────────────
  const origin = typeof window !== 'undefined' ? window.location.origin : 'https://galsenautocleaner.com';
  const [linkNetwork, setLinkNetwork] = useState('facebook');
  const [linkCampaign, setLinkCampaign] = useState('');
  const [copied, copy] = useCopy();
  const [showAffiliateModal, setShowAffiliateModal] = useState(false);
  const generatedLink = trackedLink(origin, { source: linkNetwork, campaign: linkCampaign });

  const affiliateStats = useMemo(() => {
    const map = new Map();
    const row = (id) => { if (!map.has(id)) map.set(id, { visite: 0, contacts: 0, inscriptions: 0 }); return map.get(id); };
    for (const e of stats?.affiliates || []) {
      const r = row(e.affiliate_id);
      if (e.kind === 'visite') r.visite += e.count;
      else if (e.kind.startsWith('inscription_')) r.inscriptions += e.count;
      else r.contacts += e.count;
    }
    for (const m of stats?.affiliate_messages || []) row(m.affiliate_id).contacts += m.count;
    return map;
  }, [stats]);

  const addAffiliate = async (fields) => {
    const { data, error } = await supabase.from('affiliates').insert(fields).select().single();
    if (error) throw new Error(error.code === '23505' ? 'Ce code est déjà utilisé par un autre affilié.' : error.message);
    setAffiliates((prev) => [data, ...prev]);
  };
  const toggleAffiliate = async (a) => {
    const { error } = await supabase.from('affiliates').update({ active: !a.active }).eq('id', a.id);
    if (error) { window.alert(error.message); return; }
    setAffiliates((prev) => prev.map((x) => (x.id === a.id ? { ...x, active: !a.active } : x)));
  };
  const deleteAffiliate = async (a) => {
    if (!window.confirm(`Supprimer l'affilié ${a.name} ? Son lien ne sera plus reconnu ; les visites déjà comptées restent dans les totaux.`)) return;
    const { error } = await supabase.from('affiliates').delete().eq('id', a.id);
    if (error) { window.alert(error.message); return; }
    setAffiliates((prev) => prev.filter((x) => x.id !== a.id));
  };

  const tones = {
    purple: { bg: 'bg-purple-500/10', text: 'text-purple-400' },
    blue: { bg: 'bg-blue-500/10', text: 'text-blue-400' },
    emerald: { bg: 'bg-emerald-500/10', text: 'text-emerald-400' },
    amber: { bg: 'bg-amber-500/10', text: 'text-amber-400' },
  };

  return (
    <div className="p-4 sm:p-6 lg:p-8 max-w-7xl mx-auto relative z-10">
      <div className="mb-8">
        <h1 className="text-3xl sm:text-4xl font-bold text-white mb-2 tracking-tight">Affiliés & <span className="text-purple-400">provenance</span></h1>
        <p className="text-neutral-400 text-lg">D’où viennent vos visiteurs, et ceux qui vous écrivent ou s’inscrivent : réseaux sociaux, Google, liens d’affiliés.</p>
      </div>

      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 mb-8">
        <div className="flex flex-wrap gap-2" role="tablist" aria-label="Rubriques Affiliés">
          {TABS.map(({ key, label, icon: Icon }) => (
            <button
              key={key}
              type="button"
              role="tab"
              aria-selected={tab === key}
              onClick={() => setTab(key)}
              className={`px-4 py-2 rounded-full text-sm font-medium border transition-colors flex items-center gap-2 ${tab === key ? 'bg-purple-600 border-purple-500 text-white' : 'bg-neutral-900 border-white/10 text-neutral-400 hover:text-white'}`}
            >
              <Icon className="w-4 h-4" /> {label}
              {key === 'messages' && toTreat > 0 && <span className="min-w-[20px] h-5 px-1.5 rounded-md bg-blue-500/20 text-blue-200 text-[11px] font-semibold flex items-center justify-center tabular-nums">{toTreat}</span>}
            </button>
          ))}
        </div>
        <PeriodFilter
          accent="purple"
          segment={segment}
          onSegmentChange={setSegment}
          day={day}
          onDayChange={(v) => v && setDay(v)}
          month={month}
          onMonthChange={setMonth}
          year={year}
          onYearChange={setYear}
          yearOptions={yearOptions}
        />
      </div>

      {schemaMissing ? (
        <div className="glass-card rounded-2xl p-8 border border-amber-500/20 bg-amber-500/[0.04] flex gap-4">
          <AlertTriangle className="w-6 h-6 text-amber-400 flex-shrink-0" />
          <div>
            <h3 className="text-lg font-bold text-white mb-1">La base de données n’est pas encore à jour</h3>
            <p className="text-neutral-400">Exécutez le script <code className="text-amber-300">add_affiliates_tracking.sql</code> dans l’éditeur SQL Supabase, puis rechargez la page.</p>
          </div>
        </div>
      ) : loadError ? (
        <div className="glass-card rounded-2xl p-8 border border-red-500/20 bg-red-500/[0.04] text-red-300">Chargement impossible : {loadError}</div>
      ) : (
        <div className={loading ? 'opacity-60 pointer-events-none transition-opacity' : 'transition-opacity'}>
          {tab === 'provenance' && (
            <>
              <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-6 mb-8">
                <KpiCard index={0} icon={Eye} tone={tones.purple} title="Visites" value={totals.visite} detail={topOf('visite')} />
                <KpiCard index={1} icon={Mail} tone={tones.blue} title="Messages reçus" value={totals.messages} detail={topOf('messages')} />
                <KpiCard index={2} icon={MessageCircle} tone={tones.emerald} title="Clics WhatsApp / appel" value={totals.whatsapp + totals.appel}
                  detail={`${plural(totals.whatsapp, 'clic WhatsApp', 'clics WhatsApp')} · ${plural(totals.appel, 'appel', 'appels')}`} />
                <KpiCard index={3} icon={UserPlus} tone={tones.amber} title="Inscriptions" value={totals.inscriptions}
                  detail={`${plural(signupsByKind.inscription_station, 'station', 'stations')} · ${plural(signupsByKind.inscription_automobiliste, 'automobiliste', 'automobilistes')} · ${plural(signupsByKind.inscription_groupe, 'groupe', 'groupes')}`} />
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-8">
                <Card title="Visites dans le temps" subtitle="Toutes les visites et les 3 premières sources" className="lg:col-span-2">
                  <AreaChart data={chartData} series={chartSeries} height={260} integer emptyWhenZero
                    formatValue={(v) => plural(v, 'visite', 'visites')} formatTick={(v) => String(Math.round(v))} ariaLabel="Visites dans le temps" />
                </Card>
                <Card title="Répartition des visites" subtitle="Par provenance">
                  <Donut data={donutData} centerLabel={fmt(totals.visite)} centerSub={totals.visite > 1 ? 'visites' : 'visite'} />
                  <div className="mt-6"><Legend data={donutData} formatValue={(v) => fmt(v)} /></div>
                </Card>
              </div>

              <Card title="Par provenance" subtitle="Ce que chaque réseau vous apporte sur la période" className="mb-8">
                {bySource.length === 0 ? (
                  <p className="text-neutral-500 text-sm py-6 text-center">Aucune visite ni aucun message sur la période.</p>
                ) : (
                  <div className="overflow-x-auto -mx-6">
                    <table className="w-full text-left border-collapse min-w-[720px]">
                      <thead>
                        <tr className="border-b border-white/10 text-sm">
                          <th className="px-6 py-3 font-semibold text-neutral-400">Provenance</th>
                          <th className="px-4 py-3 font-semibold text-neutral-400 text-right">Visites</th>
                          <th className="px-4 py-3 font-semibold text-neutral-400 text-right">Messages</th>
                          <th className="px-4 py-3 font-semibold text-neutral-400 text-right">WhatsApp</th>
                          <th className="px-4 py-3 font-semibold text-neutral-400 text-right">Appels</th>
                          <th className="px-4 py-3 font-semibold text-neutral-400 text-right">Inscriptions</th>
                          <th className="px-6 py-3 font-semibold text-neutral-400 text-right" title="(messages + WhatsApp + appels) / visites">Taux de contact</th>
                        </tr>
                      </thead>
                      <tbody>
                        {bySource.map((r) => {
                          const cell = (n) => <td className={`px-4 py-3 text-right tabular-nums ${n > 0 ? 'text-white font-medium' : 'text-neutral-600'}`}>{fmt(n)}</td>;
                          return (
                            <tr key={r.key} className="border-b border-white/5 hover:bg-white/[0.02] transition-colors">
                              <td className="px-6 py-3"><SourceChip source={r.key === 'inconnu' ? null : r.key} /></td>
                              {cell(r.visite)}{cell(r.messages)}{cell(r.whatsapp)}{cell(r.appel)}{cell(r.inscriptions)}
                              <td className="px-6 py-3 text-right tabular-nums text-neutral-300">{r.visite > 0 ? `${pct(r.contacts, r.visite)} %` : '—'}</td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                )}
              </Card>

              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                <Card title="Appareils" subtitle="Avec quoi on vous visite">
                  <div className="space-y-4">
                    {devices.map((d) => (
                      <div key={d.key}>
                        <div className="flex items-center justify-between text-sm mb-1.5">
                          <span className="flex items-center gap-2 text-neutral-300"><d.icon className="w-4 h-4 text-neutral-500" /> {d.label}</span>
                          <span className="text-neutral-400 tabular-nums">{fmt(d.count)} · {d.share} %</span>
                        </div>
                        <div className="h-2 bg-white/[0.06] rounded-full overflow-hidden">
                          <motion.div initial={{ width: 0 }} animate={{ width: `${d.share}%` }} transition={{ duration: 0.8 }} className="h-full rounded-full bg-gradient-to-r from-purple-500 to-fuchsia-400" />
                        </div>
                      </div>
                    ))}
                  </div>
                </Card>
                <Card title="Campagnes" subtitle="Visites des liens de suivi avec un nom de campagne">
                  {(stats?.campaigns || []).length === 0 ? (
                    <p className="text-sm text-neutral-500">Aucune campagne sur la période. Donnez un nom de campagne à vos liens (onglet Liens & affiliés) pour comparer vos publications.</p>
                  ) : (
                    <ul className="divide-y divide-white/5">
                      {stats.campaigns.map((c) => (
                        <li key={`${c.campaign}-${c.source}`} className="py-2.5 flex items-center justify-between gap-3">
                          <span className="min-w-0 flex items-center gap-2"><Megaphone className="w-4 h-4 text-neutral-500 flex-shrink-0" /><span className="truncate text-white">{c.campaign}</span><SourceChip source={c.source} /></span>
                          <span className="text-neutral-300 tabular-nums flex-shrink-0">{plural(c.count, 'visite', 'visites')}</span>
                        </li>
                      ))}
                    </ul>
                  )}
                </Card>
              </div>

              <div className="mt-8 flex gap-3 rounded-2xl border border-white/5 bg-white/[0.02] p-5 text-sm text-neutral-400 leading-relaxed">
                <Info className="w-5 h-5 text-purple-400 flex-shrink-0 mt-0.5" />
                <p>
                  Chaque visite est rattachée au site d’où vient le visiteur (Facebook, Google…) ou au lien de suivi utilisé.
                  WhatsApp et TikTok n’indiquent souvent pas d’où vient le visiteur : partagez-y vos <button type="button" onClick={() => setTab('liens')} className="text-purple-300 underline">liens de suivi</button>,
                  sinon ces visites comptent en « Accès direct ». Les messages, clics WhatsApp et inscriptions reprennent la dernière provenance connue du visiteur.
                  Les comptes connectés (stations, clients, vous) ne sont pas comptés.
                </p>
              </div>
            </>
          )}

          {tab === 'messages' && (
            <>
              <div className="flex flex-col md:flex-row gap-3 mb-6">
                <div className="relative flex-1">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-neutral-500" />
                  <input type="text" placeholder="Rechercher (nom, email, sujet, message)…" value={msgSearch} onChange={(e) => setMsgSearch(e.target.value)}
                    className="w-full bg-neutral-900 border border-white/10 rounded-xl pl-10 pr-4 py-3 text-white focus:outline-none focus:border-purple-500 transition-colors" />
                </div>
                <select value={msgStatus} onChange={(e) => setMsgStatus(e.target.value)} aria-label="Statut"
                  className="bg-neutral-900 border border-white/10 rounded-xl px-4 py-3 text-white focus:outline-none focus:border-purple-500 appearance-none">
                  <option value="tous">Tous les statuts</option>
                  <option value="nouveau">À traiter</option>
                  <option value="traite">Traités</option>
                </select>
                <select value={msgSource} onChange={(e) => setMsgSource(e.target.value)} aria-label="Provenance"
                  className="bg-neutral-900 border border-white/10 rounded-xl px-4 py-3 text-white focus:outline-none focus:border-purple-500 appearance-none">
                  <option value="toutes">Toutes les provenances</option>
                  {messageSources.map((k) => <option key={k} value={k}>{sourceInfo(k === 'inconnu' ? null : k).label}</option>)}
                </select>
              </div>

              {filteredMessages.length === 0 ? (
                <div className="glass-card rounded-2xl p-12 text-center border-dashed border-2 border-white/10">
                  <Mail className="w-14 h-14 text-neutral-600 mx-auto mb-4" />
                  <h3 className="text-xl font-bold text-white mb-2">{messages.length === 0 ? 'Aucun message sur la période' : 'Aucun résultat'}</h3>
                  <p className="text-neutral-400">{messages.length === 0 ? 'Les messages du formulaire Contact du site apparaissent ici, avec leur provenance.' : 'Ajustez votre recherche ou vos filtres.'}</p>
                </div>
              ) : (
                <div className="glass-card rounded-2xl overflow-hidden border border-white/5 bg-white/[0.02]">
                  <ul className="divide-y divide-white/5">
                    {pageMessages.map((m) => {
                      const aff = m.affiliate_id ? affiliateById.get(m.affiliate_id) : null;
                      const status = MESSAGE_STATUS[m.status] || MESSAGE_STATUS.nouveau;
                      const long = (m.message || '').length > 280;
                      return (
                        <li key={m.id} className="p-5 sm:p-6">
                          <div className="flex flex-wrap items-start justify-between gap-3 mb-2">
                            <div className="min-w-0">
                              <p className="font-bold text-white">{m.subject}</p>
                              <p className="text-sm text-neutral-400 [overflow-wrap:anywhere]">
                                {m.name} · <a href={`mailto:${m.email}`} className="text-purple-300 hover:underline">{m.email}</a> · {new Date(m.created_at).toLocaleString('fr-FR', { dateStyle: 'medium', timeStyle: 'short' })}
                              </p>
                            </div>
                            <span className={`text-xs font-medium px-3 py-1 rounded-full border flex-shrink-0 ${status.className}`}>{status.label}</span>
                          </div>
                          <div className="flex flex-wrap items-center gap-2 mb-3 text-xs text-neutral-500">
                            <SourceChip source={m.source} />
                            {m.campaign && <span>campagne « {m.campaign} »</span>}
                            {aff && <span>affilié : <span className="text-neutral-300">{aff.name}</span></span>}
                            {!aff && m.ref && <span>code {m.ref}</span>}
                            {m.referrer_host && <span>depuis {m.referrer_host}</span>}
                          </div>
                          <p className={`text-sm text-neutral-300 leading-relaxed whitespace-pre-wrap [overflow-wrap:anywhere] ${long && !expanded[m.id] ? 'line-clamp-4' : ''}`}>{m.message}</p>
                          {long && (
                            <button type="button" onClick={() => setExpanded((e) => ({ ...e, [m.id]: !e[m.id] }))} className="text-xs text-purple-300 hover:underline mt-1">
                              {expanded[m.id] ? 'Réduire' : 'Lire la suite'}
                            </button>
                          )}
                          <div className="flex flex-wrap gap-2 mt-4">
                            <a href={`mailto:${m.email}?subject=${encodeURIComponent(`Re : ${m.subject}`)}`}
                              className="flex items-center gap-1.5 px-3 py-2 bg-white/5 hover:bg-white/10 text-neutral-200 rounded-lg transition-colors text-xs font-bold">
                              <Reply className="w-4 h-4" /> Répondre
                            </a>
                            {m.status === 'nouveau' ? (
                              <button type="button" onClick={() => setMessageStatus(m.id, 'traite')}
                                className="flex items-center gap-1.5 px-3 py-2 bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-400 rounded-lg transition-colors text-xs font-bold">
                                <CheckCircle2 className="w-4 h-4" /> Marquer traité
                              </button>
                            ) : (
                              <button type="button" onClick={() => setMessageStatus(m.id, 'nouveau')}
                                className="flex items-center gap-1.5 px-3 py-2 bg-white/5 hover:bg-white/10 text-neutral-400 rounded-lg transition-colors text-xs font-bold">
                                <RotateCcw className="w-4 h-4" /> Remettre à traiter
                              </button>
                            )}
                          </div>
                        </li>
                      );
                    })}
                  </ul>
                  <Pagination
                    page={msgCurrentPage}
                    pageSize={msgPageSize}
                    totalItems={filteredMessages.length}
                    onPageChange={setMsgPage}
                    onPageSizeChange={(n) => { setMsgPageSize(n); setMsgPage(1); }}
                  />
                </div>
              )}
            </>
          )}

          {tab === 'liens' && (
            <>
              <Card title="Créer un lien de suivi" subtitle="À coller dans vos publications : chaque visite par ce lien est comptée pour le bon réseau, même depuis WhatsApp ou TikTok." className="mb-8">
                <div className="flex flex-wrap gap-2 mb-4" role="radiogroup" aria-label="Réseau du lien">
                  {LINK_NETWORKS.map((n) => (
                    <button key={n.key} type="button" role="radio" aria-checked={linkNetwork === n.key} onClick={() => setLinkNetwork(n.key)}
                      className={`flex items-center gap-2 px-3 py-2 rounded-xl text-sm border transition-colors ${linkNetwork === n.key ? 'border-purple-500 bg-purple-500/15 text-white' : 'border-white/10 bg-white/[0.03] text-neutral-400 hover:text-white'}`}>
                      <span className="w-2 h-2 rounded-full" style={{ background: n.color }} /> {n.label}
                    </button>
                  ))}
                </div>
                <label className="block text-sm font-medium text-neutral-400 mb-1" htmlFor="link-campaign">Nom de campagne (facultatif)</label>
                <input id="link-campaign" className={`${inputCls} md:w-1/2 mb-4`} value={linkCampaign} maxLength={60} placeholder="Ex. promo-octobre, statut-whatsapp-lundi"
                  onChange={(e) => setLinkCampaign(e.target.value)} />
                <div className="flex flex-col sm:flex-row gap-2">
                  <code className="flex-1 min-w-0 rounded-xl bg-neutral-950 border border-white/10 px-4 py-3 text-sm text-purple-200 [overflow-wrap:anywhere]">{generatedLink}</code>
                  <button type="button" onClick={() => copy(generatedLink, 'generated')}
                    className="flex items-center justify-center gap-2 px-5 py-3 rounded-xl bg-purple-600 hover:bg-purple-500 text-white font-bold transition-colors flex-shrink-0">
                    {copied === 'generated' ? <><Check className="w-4 h-4" /> Copié</> : <><Copy className="w-4 h-4" /> Copier</>}
                  </button>
                </div>
              </Card>

              <Card
                title="Affiliés"
                subtitle="Partenaires qui partagent leur propre lien — chiffres sur la période choisie"
                right={(
                  <button type="button" onClick={() => setShowAffiliateModal(true)}
                    className="bg-purple-600 hover:bg-purple-500 text-white px-4 py-2.5 rounded-xl font-bold transition-all shadow-lg shadow-purple-500/20 flex items-center gap-2 text-sm">
                    <Plus className="w-4 h-4" /> Ajouter un affilié
                  </button>
                )}
              >
                {affiliates.length === 0 ? (
                  <p className="text-neutral-500 text-sm py-6 text-center">Aucun affilié pour le moment. Ajoutez un partenaire pour lui donner un lien personnel et suivre ce qu’il vous apporte.</p>
                ) : (
                  <div className="overflow-x-auto -mx-6">
                    <table className="w-full text-left border-collapse min-w-[860px]">
                      <thead>
                        <tr className="border-b border-white/10 text-sm">
                          <th className="px-6 py-3 font-semibold text-neutral-400">Affilié</th>
                          <th className="px-4 py-3 font-semibold text-neutral-400">Réseau</th>
                          <th className="px-4 py-3 font-semibold text-neutral-400">Lien</th>
                          <th className="px-4 py-3 font-semibold text-neutral-400 text-right">Visites</th>
                          <th className="px-4 py-3 font-semibold text-neutral-400 text-right">Contacts</th>
                          <th className="px-4 py-3 font-semibold text-neutral-400 text-right">Inscriptions</th>
                          <th className="px-6 py-3 font-semibold text-neutral-400 text-right">Actions</th>
                        </tr>
                      </thead>
                      <tbody>
                        {affiliates.map((a) => {
                          const st = affiliateStats.get(a.id) || { visite: 0, contacts: 0, inscriptions: 0 };
                          const link = trackedLink(origin, { ref: a.code });
                          return (
                            <tr key={a.id} className={`border-b border-white/5 hover:bg-white/[0.02] transition-colors ${a.active ? '' : 'opacity-50'}`}>
                              <td className="px-6 py-3">
                                <p className="font-bold text-white">{a.name}</p>
                                <p className="text-xs text-neutral-500">{[a.contact, a.note].filter(Boolean).join(' · ') || `code ${a.code}`}</p>
                              </td>
                              <td className="px-4 py-3"><SourceChip source={a.network} /></td>
                              <td className="px-4 py-3">
                                <button type="button" onClick={() => copy(link, a.id)} title={link}
                                  className="flex items-center gap-1.5 text-xs font-medium text-purple-300 hover:text-purple-200">
                                  {copied === a.id ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
                                  {copied === a.id ? 'Copié' : `?ref=${a.code}`}
                                </button>
                              </td>
                              <td className="px-4 py-3 text-right tabular-nums text-white">{fmt(st.visite)}</td>
                              <td className="px-4 py-3 text-right tabular-nums text-white">{fmt(st.contacts)}</td>
                              <td className="px-4 py-3 text-right tabular-nums text-white">{fmt(st.inscriptions)}</td>
                              <td className="px-6 py-3">
                                <div className="flex justify-end gap-2">
                                  <button type="button" onClick={() => toggleAffiliate(a)}
                                    className={`px-3 py-2 rounded-lg text-xs font-bold transition-colors ${a.active ? 'bg-white/5 hover:bg-white/10 text-neutral-300' : 'bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-400'}`}>
                                    {a.active ? 'Désactiver' : 'Réactiver'}
                                  </button>
                                  <button type="button" onClick={() => deleteAffiliate(a)} aria-label={`Supprimer ${a.name}`}
                                    className="p-2 bg-white/5 hover:bg-red-500/20 hover:text-red-400 text-neutral-400 rounded-lg transition-colors">
                                    <Trash2 className="w-4 h-4" />
                                  </button>
                                </div>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                )}
              </Card>
            </>
          )}
        </div>
      )}

      <AnimatePresence>
        {showAffiliateModal && <AffiliateModal onClose={() => setShowAffiliateModal(false)} onSave={addAffiliate} />}
      </AnimatePresence>
    </div>
  );
}
