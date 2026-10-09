import React, { useCallback, useEffect, useState } from 'react';
import { Megaphone, Plus, Trash2, Eye, EyeOff } from 'lucide-react';
import { supabase } from '../../lib/supabaseClient';
import { useSuperAdminState } from '../../hooks/useSuperAdminState';
import { useDocumentTitle } from '../../lib/useDocumentTitle';
import { loadTickerItems } from '../../lib/ticker';

// Super Admin > Bandeau d'accueil : messages du bandeau défilant en haut du
// hero de index.html (add_site_ticker.sql) — annonce, mot de bienvenue pour
// une station, mise en avant payée… Les publicités payées et actives des
// stations (Publicités) s'y ajoutent toutes seules, après ces messages.
const emptyForm = { message: '', stationId: '', linkUrl: '', startsAt: '', endsAt: '' };

export default function Ticker() {
  useDocumentTitle("Bandeau d'accueil");
  const { stations } = useSuperAdminState();
  const [messages, setMessages] = useState([]);
  const [live, setLive] = useState([]);
  const [form, setForm] = useState(emptyForm);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    const { data } = await supabase.from('site_ticker_messages').select('*, stations!station_id(name)').order('sort_order').order('created_at', { ascending: false });
    setMessages(data || []);
    setLive(await loadTickerItems(supabase));
  }, []);
  useEffect(() => { load(); }, [load]);

  const add = async (e) => {
    e.preventDefault();
    setError('');
    if (!form.message.trim()) return;
    setSaving(true);
    const { data: { user } } = await supabase.auth.getUser();
    const { error: err } = await supabase.from('site_ticker_messages').insert({
      message: form.message.trim(),
      station_id: form.stationId || null,
      link_url: form.linkUrl.trim() || null,
      starts_at: form.startsAt ? new Date(form.startsAt).toISOString() : null,
      ends_at: form.endsAt ? new Date(`${form.endsAt}T23:59:59`).toISOString() : null,
      created_by: user?.id || null,
    });
    setSaving(false);
    if (err) { setError(err.message.includes('link_url') ? 'Le lien doit commencer par https:// ou /' : err.message); return; }
    setForm(emptyForm);
    load();
  };

  const toggle = async (m) => { await supabase.from('site_ticker_messages').update({ active: !m.active }).eq('id', m.id); load(); };
  const remove = async (m) => {
    if (!window.confirm('Supprimer ce message du bandeau ?')) return;
    await supabase.from('site_ticker_messages').delete().eq('id', m.id);
    load();
  };

  const fmt = (iso) => (iso ? new Date(iso).toLocaleDateString('fr-FR', { day: '2-digit', month: 'short', year: 'numeric' }) : null);
  const input = 'w-full bg-neutral-900 border border-white/10 rounded-xl px-4 py-3 text-white text-sm focus:outline-none focus:border-purple-500';

  return (
    <div className="p-4 sm:p-6 lg:p-8 max-w-7xl mx-auto relative z-10">
      <div className="mb-8">
        <h1 className="text-3xl sm:text-4xl font-bold text-white mb-2 tracking-tight">Bandeau <span className="text-purple-400">d'accueil</span></h1>
        <p className="text-neutral-400 text-lg">Messages qui défilent en haut de la page d'accueil. Les publicités payées et actives des stations s'y ajoutent automatiquement.</p>
      </div>

      {/* Aperçu de ce qui défile en ce moment */}
      <div className="glass-card rounded-2xl border border-white/5 bg-white/[0.02] p-5 mb-8">
        <p className="text-sm font-semibold text-neutral-400 mb-3">En ligne maintenant ({live.length})</p>
        {live.length === 0 ? (
          <p className="text-neutral-500 text-sm">Rien à afficher : le bandeau est masqué sur la page d'accueil.</p>
        ) : (
          <div className="flex flex-wrap gap-2">
            {live.map((it) => (
              <span key={it.key} className={`text-xs px-3 py-1.5 rounded-full border ${it.kind === 'ad' ? 'border-amber-500/30 bg-amber-500/10 text-amber-200' : 'border-purple-500/30 bg-purple-500/10 text-purple-200'}`}>
                {it.kind === 'ad' ? 'Pub · ' : ''}{it.label ? `${it.label} — ` : ''}{it.text}
              </span>
            ))}
          </div>
        )}
      </div>

      <form onSubmit={add} className="glass-card rounded-2xl border border-white/5 bg-white/[0.02] p-5 mb-8 space-y-4">
        <h2 className="text-lg font-bold text-white flex items-center gap-2"><Plus className="w-5 h-5 text-purple-400" /> Nouveau message</h2>
        <div>
          <textarea maxLength={200} rows={2} placeholder="Ex : Bienvenue à Baye Lavage, nouvelle station partenaire à Dakar !" value={form.message}
            onChange={(e) => setForm({ ...form, message: e.target.value })} className={input} />
          <p className="text-xs text-neutral-500 mt-1 text-right">{form.message.length}/200</p>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          <div>
            <label className="block text-xs text-neutral-400 mb-1.5">Station mise en avant (facultatif)</label>
            <select value={form.stationId} onChange={(e) => setForm({ ...form, stationId: e.target.value })} className={input}>
              <option value="">Aucune</option>
              {stations.map((s) => <option key={s.id} value={s.id}>{s.name || 'Sans nom'}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-xs text-neutral-400 mb-1.5">Lien (facultatif)</label>
            <input type="text" placeholder="https://… ou /stations" value={form.linkUrl} onChange={(e) => setForm({ ...form, linkUrl: e.target.value })} className={input} />
          </div>
          <div>
            <label className="block text-xs text-neutral-400 mb-1.5">À partir du (facultatif)</label>
            <input type="date" value={form.startsAt} onChange={(e) => setForm({ ...form, startsAt: e.target.value })} className={input} />
          </div>
          <div>
            <label className="block text-xs text-neutral-400 mb-1.5">Jusqu'au (facultatif)</label>
            <input type="date" value={form.endsAt} onChange={(e) => setForm({ ...form, endsAt: e.target.value })} className={input} />
          </div>
        </div>
        {error && <p className="text-sm text-red-400">{error}</p>}
        <button type="submit" disabled={saving || !form.message.trim()}
          className="bg-purple-600 hover:bg-purple-500 disabled:opacity-50 text-white font-bold px-6 py-2.5 rounded-xl transition-colors">
          {saving ? 'Ajout…' : 'Ajouter au bandeau'}
        </button>
      </form>

      {messages.length === 0 ? (
        <div className="glass-card rounded-2xl p-12 text-center border-dashed border-2 border-white/10">
          <Megaphone className="w-14 h-14 text-neutral-600 mx-auto mb-4" />
          <p className="text-neutral-400">Aucun message pour l'instant.</p>
        </div>
      ) : (
        <div className="glass-card rounded-2xl overflow-hidden border border-white/5 bg-white/[0.02] divide-y divide-white/5">
          {messages.map((m) => (
            <div key={m.id} className="p-5 flex flex-wrap items-center justify-between gap-4">
              <div className="min-w-0 flex-1">
                <p className={`font-medium break-words ${m.active ? 'text-white' : 'text-neutral-500 line-through'}`}>{m.message}</p>
                <p className="text-xs text-neutral-500 mt-1">
                  {m.stations?.name && <span className="text-purple-300">{m.stations.name} · </span>}
                  {m.starts_at || m.ends_at ? `${fmt(m.starts_at) || 'dès maintenant'} → ${fmt(m.ends_at) || 'sans fin'}` : 'Sans limite de dates'}
                  {m.link_url && ` · ${m.link_url}`}
                </p>
              </div>
              <div className="flex gap-2">
                <button onClick={() => toggle(m)} title={m.active ? 'Masquer' : 'Afficher'}
                  className="p-2 bg-white/5 hover:bg-white/10 text-neutral-300 rounded-lg transition-colors">
                  {m.active ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
                <button onClick={() => remove(m)} title="Supprimer"
                  className="p-2 bg-white/5 hover:bg-red-500/20 hover:text-red-400 text-neutral-400 rounded-lg transition-colors">
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
