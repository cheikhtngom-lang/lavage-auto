import React, { useCallback, useState } from 'react';
import { motion } from 'framer-motion';
import { X } from 'lucide-react';
import { sourceInfo } from '../../lib/trafficSources';

// Briques communes de Super Admin > Affiliés (pages/SuperAdmin/Affiliates.jsx)
// et de ses onglets Influenceurs / Facebook Ads (components/marketing/).

export const fmt = (n) => Number(n || 0).toLocaleString('fr-FR');
export const fcfa = (n) => `${fmt(Math.round(Number(n || 0)))} FCFA`;
export const pct = (part, total) => (total > 0 ? Math.round((part / total) * 100) : 0);
// Taux avec une décimale sous 10 % (« 2,5 % »), arrondi au-delà.
export const rate = (part, total) => {
  if (!(total > 0)) return '—';
  const v = (part / total) * 100;
  return `${v > 0 && v < 10 ? v.toLocaleString('fr-FR', { maximumFractionDigits: 1 }) : Math.round(v)} %`;
};
export const plural = (n, one, many) => `${fmt(n)} ${n > 1 ? many : one}`;
// toLocaleString (et non toLocaleDateString) : accepte aussi timeStyle.
export const dateFr = (iso, opts = { dateStyle: 'medium' }) => (iso ? new Date(iso).toLocaleString('fr-FR', opts) : '—');
// Date seule « AAAA-MM-JJ » (colonne date) affichée sans décalage de fuseau.
export const dayFr = (d) => {
  if (!d) return '—';
  const [y, m, day] = String(d).slice(0, 10).split('-').map(Number);
  return new Date(y, m - 1, day).toLocaleDateString('fr-FR', { dateStyle: 'medium' });
};
export const todayKey = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

// « il y a 3 j » pour le dernier clic.
export function ago(iso) {
  if (!iso) return '—';
  const min = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 60000));
  if (min < 60) return min <= 1 ? 'à l’instant' : `il y a ${min} min`;
  const h = Math.round(min / 60);
  if (h < 24) return `il y a ${h} h`;
  const d = Math.round(h / 24);
  return d < 31 ? `il y a ${d} j` : dateFr(iso);
}

// Base pas encore à jour (script SQL non exécuté).
export const isMissingSchema = (error) => ['PGRST202', '42883', '42P01', 'PGRST205', '42703'].includes(error?.code);

export const tones = {
  purple: { bg: 'bg-purple-500/10', text: 'text-purple-400' },
  blue: { bg: 'bg-blue-500/10', text: 'text-blue-400' },
  emerald: { bg: 'bg-emerald-500/10', text: 'text-emerald-400' },
  amber: { bg: 'bg-amber-500/10', text: 'text-amber-400' },
  pink: { bg: 'bg-pink-500/10', text: 'text-pink-400' },
  cyan: { bg: 'bg-cyan-500/10', text: 'text-cyan-400' },
};

export const inputCls = 'w-full bg-neutral-950 border border-white/10 rounded-xl px-4 py-3 text-white placeholder-neutral-600 focus:outline-none focus:border-purple-500';

export function useCopy() {
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

export function SourceChip({ source, className = '' }) {
  const info = sourceInfo(source);
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full bg-white/[0.05] border border-white/10 px-2.5 py-0.5 text-xs font-medium text-neutral-200 ${className}`}>
      <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: info.color, boxShadow: `0 0 6px ${info.color}88` }} />
      {info.label}
    </span>
  );
}

// `display` : valeur déjà mise en forme (montant, taux) ; sinon `value` en nombre.
export function KpiCard({ icon: Icon, tone, title, value, display, detail, index = 0 }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: index * 0.06 }}
      className="glass-card rounded-2xl p-6 border border-white/5 bg-white/[0.02] min-w-0"
    >
      <div className={`p-3 rounded-xl w-fit mb-4 ${tone.bg}`}><Icon className={`w-6 h-6 ${tone.text}`} /></div>
      <p className="text-neutral-400 text-sm font-medium mb-1">{title}</p>
      <h3 className="text-3xl font-bold text-white tabular-nums [overflow-wrap:anywhere]">{display ?? fmt(value)}</h3>
      {detail && <p className="text-xs text-neutral-500 mt-1.5 leading-relaxed">{detail}</p>}
    </motion.div>
  );
}

// Petite tuile de total (rangée de 6).
export function StatTile({ icon: Icon, tone, label, value, detail }) {
  return (
    <div className="glass-card rounded-2xl p-4 border border-white/5 bg-white/[0.02] min-w-0">
      <div className="flex items-center gap-2 mb-2">
        <span className={`p-1.5 rounded-lg ${tone.bg}`}><Icon className={`w-4 h-4 ${tone.text}`} /></span>
        <p className="text-neutral-400 text-xs font-medium leading-tight">{label}</p>
      </div>
      <p className="text-2xl font-bold text-white tabular-nums [overflow-wrap:anywhere]">{value}</p>
      {detail && <p className="text-[11px] text-neutral-500 mt-1 leading-snug">{detail}</p>}
    </div>
  );
}

export function Card({ title, subtitle, children, className = '', right }) {
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

export function Modal({ id, title, intro, onClose, busy, children, wide = false }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm" onClick={(e) => { if (e.target === e.currentTarget && !busy) onClose(); }}>
      <motion.div
        initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.95 }}
        role="dialog" aria-modal="true" aria-labelledby={id}
        className={`bg-neutral-900 border border-white/10 rounded-2xl p-6 w-full ${wide ? 'max-w-2xl' : 'max-w-md'} shadow-2xl relative max-h-[90vh] overflow-y-auto`}
      >
        <button onClick={onClose} disabled={busy} aria-label="Fermer" className="modal-close"><X className="w-6 h-6" /></button>
        <h2 id={id} className="text-2xl font-bold text-white mb-1 pr-10">{title}</h2>
        {intro && <p className="text-sm text-neutral-400 mb-6">{intro}</p>}
        {children}
      </motion.div>
    </div>
  );
}

export function Field({ label, htmlFor, hint, children }) {
  return (
    <div>
      <label className="block text-sm font-medium text-neutral-400 mb-1" htmlFor={htmlFor}>{label}</label>
      {children}
      {hint && <p className="text-xs text-neutral-500 mt-1.5">{hint}</p>}
    </div>
  );
}

export function SchemaNotice({ file }) {
  return (
    <div className="glass-card rounded-2xl p-8 border border-amber-500/20 bg-amber-500/[0.04]">
      <h3 className="text-lg font-bold text-white mb-1">La base de données n’est pas encore à jour</h3>
      <p className="text-neutral-400">Exécutez le script <code className="text-amber-300">{file}</code> dans l’éditeur SQL Supabase, puis rechargez la page.</p>
    </div>
  );
}
