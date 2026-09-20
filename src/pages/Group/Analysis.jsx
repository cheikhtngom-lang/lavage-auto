import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { motion } from 'framer-motion';
import { Sparkles, Loader2, Send, Copy, Check, Trash2, ChevronDown, ChevronUp, ShieldCheck, CalendarClock, MessageSquare, FileText, AlertTriangle } from 'lucide-react';
import { useGroup } from '../../components/layout/GroupLayout';
import AiText from '../../components/group/AiText';
import StationFilter from '../../components/group/StationFilter';
import { useDocumentTitle } from '../../lib/useDocumentTitle';
import { PERIOD_PRESETS, presetRange } from '../../lib/groupDashboard';
import { fetchGroupStations } from '../../lib/groups';
import { requestReport, askQuestion, fetchAiUsage, fetchAiHistory, deleteAiEntry } from '../../lib/groupAi';

const PRESETS = PERIOD_PRESETS.filter((p) => !['today', 'yesterday'].includes(p.key));
const SUGGESTIONS = [
  'Quelle station dois-je surveiller en priorité, et pourquoi ?',
  'Quelles stations sont les moins rentables ?',
  "Pourquoi mon chiffre d'affaires évolue-t-il ainsi ?",
  'Quels jours et quelles heures dois-je renforcer ?',
  'Où mes dépenses dérapent-elles ?',
];
const KIND = {
  weekly: { label: 'Hebdomadaire', cls: 'bg-blue-500/10 text-blue-300 border-blue-500/20' },
  report: { label: 'Rapport', cls: 'bg-emerald-500/10 text-emerald-300 border-emerald-500/20' },
  question: { label: 'Question', cls: 'bg-purple-500/10 text-purple-300 border-purple-500/20' },
};

// Analyste IA du groupe : rapport à la demande, questions libres, historique
// (dont le rapport automatique du lundi). Les chiffres viennent du tableau de
// bord ; seuls des chiffres agrégés sont transmis à l'IA.
export default function Analysis() {
  useDocumentTitle('Analyse IA');
  const { org, loaded } = useGroup();

  const [preset, setPreset] = useState('30d');
  const [custom, setCustom] = useState({ start: '', end: '' });
  const [stationIds, setStationIds] = useState([]);
  const [stations, setStations] = useState([]);
  const [usage, setUsage] = useState(null);
  const [history, setHistory] = useState([]);

  const [report, setReport] = useState(null); // { answer, periodLabel }
  const [reportBusy, setReportBusy] = useState(false);
  const [thread, setThread] = useState([]); // [{ role, content }]
  const [question, setQuestion] = useState('');
  const [askBusy, setAskBusy] = useState(false);
  const [error, setError] = useState('');
  const [notConfigured, setNotConfigured] = useState(false);
  const [copied, setCopied] = useState(false);
  const [openId, setOpenId] = useState(null);
  const endRef = useRef(null);

  const range = useMemo(() => presetRange(preset, custom), [preset, custom]);
  const idsKey = stationIds.join(',');

  const reloadSide = useCallback(async () => {
    const [u, h] = await Promise.all([fetchAiUsage().catch(() => null), fetchAiHistory().catch(() => [])]);
    setUsage(u);
    setHistory(h);
  }, []);
  useEffect(() => { if (loaded && org) reloadSide(); }, [loaded, org, reloadSide]);
  useEffect(() => {
    if (!org) return;
    fetchGroupStations(org.id).then((s) => setStations(s.filter((x) => !x.archived))).catch(() => {});
  }, [org]);

  // Les réponses portent sur une période et un périmètre précis : si l'un change, on repart d'un fil vierge.
  useEffect(() => { setThread([]); setReport(null); setError(''); }, [preset, custom.start, custom.end, idsKey]);
  useEffect(() => { endRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' }); }, [thread, askBusy]);

  const limitReached = usage && usage.used >= usage.limit;
  const busy = reportBusy || askBusy;
  const canRun = !!range && !limitReached && !busy && !notConfigured;

  const handleError = (err) => {
    if (err.code === 'ia_non_configuree') setNotConfigured(true);
    else setError(err.message);
    if (err.code === 'limite_atteinte') reloadSide();
  };

  const runReport = async () => {
    setError('');
    setReportBusy(true);
    try {
      const r = await requestReport({ from: range.from, to: range.to, stationIds, periodLabel: range.label });
      setReport({ answer: r.answer, periodLabel: range.label });
      setUsage((u) => (u ? { ...u, used: r.usage.used, limit: r.usage.limit } : u));
      reloadSide();
    } catch (err) {
      handleError(err);
    } finally {
      setReportBusy(false);
    }
  };

  const ask = async (text) => {
    const q = (text ?? question).trim();
    if (q.length < 3 || !canRun) return;
    setError('');
    setAskBusy(true);
    setQuestion('');
    const previous = thread;
    setThread([...previous, { role: 'user', content: q }]);
    try {
      const r = await askQuestion({ from: range.from, to: range.to, stationIds, periodLabel: range.label, question: q, history: previous });
      setThread((t) => [...t, { role: 'assistant', content: r.answer }]);
      setUsage((u) => (u ? { ...u, used: r.usage.used, limit: r.usage.limit } : u));
      reloadSide();
    } catch (err) {
      setThread(previous);
      setQuestion(q);
      handleError(err);
    } finally {
      setAskBusy(false);
    }
  };

  const copy = async (text) => {
    try { await navigator.clipboard.writeText(text); setCopied(true); setTimeout(() => setCopied(false), 1800); } catch { /* ignore */ }
  };

  const remove = async (id) => {
    if (!window.confirm('Supprimer cette entrée de votre historique ?')) return;
    try { await deleteAiEntry(id); setHistory((h) => h.filter((x) => x.id !== id)); } catch (err) { setError(err.message); }
  };

  if (!loaded) return <div className="p-8 text-neutral-500">Chargement…</div>;

  const chips = 'px-3.5 py-1.5 rounded-full text-sm font-medium border transition-colors';
  const resets = usage?.resets_on ? new Date(usage.resets_on).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long' }) : null;

  return (
    <div className="p-6 md:p-8 max-w-5xl mx-auto">
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-4 mb-6">
        <div>
          <h1 className="text-4xl font-bold tracking-tight flex items-center gap-3">
            Analyse <span className="text-emerald-400">IA</span>
            <Sparkles className="w-7 h-7 text-emerald-400" />
          </h1>
          <p className="text-neutral-400 mt-1">Un analyste qui lit les chiffres de tous vos sites et vous dit où agir.</p>
        </div>
        {usage && (
          <div className={`text-sm px-4 py-2 rounded-xl border ${limitReached ? 'bg-red-500/10 border-red-500/30 text-red-300' : 'bg-white/5 border-white/10 text-neutral-300'}`}>
            <strong className="text-white">{usage.used} / {usage.limit}</strong> demandes ce mois{resets && <span className="text-neutral-500"> · renouvelées le {resets}</span>}
          </div>
        )}
      </div>

      {notConfigured && (
        <div className="mb-6 flex items-start gap-3 bg-blue-500/10 border border-blue-500/25 text-blue-200 rounded-xl px-4 py-3 text-sm">
          <Sparkles className="w-4 h-4 mt-0.5 flex-shrink-0" />
          L’analyse IA n’est pas encore activée sur la plateforme. Vos rapports hebdomadaires et vos questions seront disponibles dès son activation.
        </div>
      )}
      {limitReached && (
        <div className="mb-6 flex items-start gap-3 bg-red-500/10 border border-red-500/25 text-red-200 rounded-xl px-4 py-3 text-sm">
          <AlertTriangle className="w-4 h-4 mt-0.5 flex-shrink-0" />
          Vous avez utilisé toutes vos demandes du mois{resets ? ` (renouvelées le ${resets})` : ''}. Vos rapports hebdomadaires automatiques continuent d’arriver. Besoin de plus ? Contactez-nous.
        </div>
      )}

      {/* Période et périmètre */}
      <div className="flex flex-wrap items-center gap-2 mb-8">
        {PRESETS.map((p) => (
          <button key={p.key} onClick={() => setPreset(p.key)} className={`${chips} ${preset === p.key ? 'bg-emerald-600 border-emerald-500 text-white' : 'bg-neutral-900 border-white/10 text-neutral-400 hover:text-white'}`}>{p.label}</button>
        ))}
        {preset === 'custom' && (
          <div className="flex items-center gap-2 ml-1">
            <input type="date" value={custom.start} onChange={(e) => setCustom({ ...custom, start: e.target.value })} className="bg-neutral-900 border border-white/10 rounded-lg px-3 py-1.5 text-sm text-white" />
            <span className="text-neutral-500 text-sm">au</span>
            <input type="date" value={custom.end} onChange={(e) => setCustom({ ...custom, end: e.target.value })} className="bg-neutral-900 border border-white/10 rounded-lg px-3 py-1.5 text-sm text-white" />
          </div>
        )}
        <div className="ml-auto">{stations.length > 0 && <StationFilter stations={stations} selected={stationIds} onChange={setStationIds} />}</div>
      </div>

      {error && <div className="mb-6 text-sm text-red-300 bg-red-500/10 border border-red-500/20 rounded-xl px-4 py-2.5">{error}</div>}

      {/* Rapport */}
      <div className="glass-card rounded-2xl border border-white/5 bg-white/[0.02] p-6 mb-6">
        <div className="flex flex-wrap items-start justify-between gap-3 mb-4">
          <div>
            <h2 className="text-lg font-bold flex items-center gap-2"><FileText className="w-5 h-5 text-emerald-400" /> Rapport d’analyse</h2>
            <p className="text-xs text-neutral-500 mt-0.5">{range ? range.label : 'Choisissez une période'} · synthèse, points de vigilance, recommandations</p>
          </div>
          <div className="flex gap-2">
            {report && (
              <button onClick={() => copy(report.answer)} className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-white/5 hover:bg-white/10 border border-white/10 text-neutral-300 text-sm">
                {copied ? <Check className="w-4 h-4 text-emerald-400" /> : <Copy className="w-4 h-4" />} {copied ? 'Copié' : 'Copier'}
              </button>
            )}
            <button onClick={runReport} disabled={!canRun}
              className="flex items-center gap-2 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 disabled:cursor-not-allowed text-white font-semibold px-4 py-2 rounded-xl text-sm">
              {reportBusy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
              {report ? 'Régénérer' : 'Générer le rapport'}
            </button>
          </div>
        </div>
        {reportBusy && <p className="text-sm text-neutral-400 flex items-center gap-2"><Loader2 className="w-4 h-4 animate-spin" /> Analyse en cours… cela peut prendre jusqu’à une minute.</p>}
        {report && !reportBusy && <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}><AiText text={report.answer} /></motion.div>}
        {!report && !reportBusy && <p className="text-sm text-neutral-500">Un clic, et l’IA analyse vos stations sur la période choisie : ce qui va bien, ce qui inquiète, et quoi faire en priorité.</p>}
      </div>

      {/* Questions */}
      <div className="glass-card rounded-2xl border border-white/5 bg-white/[0.02] p-6 mb-6">
        <h2 className="text-lg font-bold flex items-center gap-2 mb-1"><MessageSquare className="w-5 h-5 text-purple-400" /> Posez une question</h2>
        <p className="text-xs text-neutral-500 mb-4">Sur la même période et les mêmes stations. Chaque réponse compte pour une demande.</p>

        {thread.length === 0 && (
          <div className="flex flex-wrap gap-2 mb-4">
            {SUGGESTIONS.map((s) => (
              <button key={s} onClick={() => ask(s)} disabled={!canRun}
                className="text-left text-xs px-3 py-2 rounded-xl bg-white/5 hover:bg-purple-500/15 border border-white/10 hover:border-purple-500/30 text-neutral-300 disabled:opacity-40 transition-colors">{s}</button>
            ))}
          </div>
        )}

        {thread.length > 0 && (
          <div className="space-y-3 mb-4 max-h-[520px] overflow-y-auto pr-1">
            {thread.map((m, i) => (
              m.role === 'user' ? (
                <div key={i} className="flex justify-end"><div className="max-w-[85%] bg-purple-600/20 border border-purple-500/25 text-purple-100 rounded-2xl rounded-br-md px-4 py-2.5 text-sm">{m.content}</div></div>
              ) : (
                <div key={i} className="bg-white/[0.04] border border-white/10 rounded-2xl rounded-bl-md px-4 py-3"><AiText text={m.content} /></div>
              )
            ))}
            {askBusy && <div className="flex items-center gap-2 text-sm text-neutral-400 px-2"><Loader2 className="w-4 h-4 animate-spin" /> L’analyste réfléchit…</div>}
            <div ref={endRef} />
          </div>
        )}

        <form onSubmit={(e) => { e.preventDefault(); ask(); }} className="flex gap-2">
          <input value={question} onChange={(e) => setQuestion(e.target.value)} maxLength={600} disabled={!canRun && !askBusy}
            placeholder={limitReached ? 'Limite mensuelle atteinte' : 'Ex : pourquoi Baye Lavage baisse-t-elle ?'}
            className="flex-1 bg-neutral-950 border border-white/10 rounded-xl px-4 py-3 text-white text-sm focus:outline-none focus:border-purple-500 disabled:opacity-50" />
          <button type="submit" disabled={!canRun || question.trim().length < 3}
            className="flex items-center gap-2 bg-purple-600 hover:bg-purple-500 disabled:opacity-40 disabled:cursor-not-allowed text-white font-semibold px-4 rounded-xl text-sm">
            {askBusy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />} Envoyer
          </button>
        </form>
      </div>

      {/* Historique */}
      <div className="glass-card rounded-2xl border border-white/5 bg-white/[0.02] p-6 mb-6">
        <h2 className="text-lg font-bold flex items-center gap-2 mb-1"><CalendarClock className="w-5 h-5 text-blue-400" /> Historique et rapports hebdomadaires</h2>
        <p className="text-xs text-neutral-500 mb-4">Chaque lundi, un rapport de la semaine écoulée est généré automatiquement et envoyé à votre adresse email.</p>
        {history.length === 0 ? (
          <p className="text-sm text-neutral-500">Rien pour l’instant. Votre premier rapport hebdomadaire arrivera lundi.</p>
        ) : (
          <div className="space-y-2">
            {history.map((h) => {
              const k = KIND[h.kind] || KIND.report;
              const open = openId === h.id;
              return (
                <div key={h.id} className="bg-black/20 border border-white/5 rounded-xl">
                  <button onClick={() => setOpenId(open ? null : h.id)} className="w-full flex items-center gap-3 px-4 py-3 text-left">
                    <span className={`text-[11px] px-2 py-0.5 rounded-full border ${k.cls}`}>{k.label}</span>
                    <span className="flex-1 min-w-0">
                      <span className="block text-sm text-white truncate">{h.kind === 'question' ? h.question : h.period_label}</span>
                      <span className="block text-xs text-neutral-500">{h.kind === 'question' ? `${h.period_label} · ` : ''}{new Date(h.created_at).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' })}</span>
                    </span>
                    {open ? <ChevronUp className="w-4 h-4 text-neutral-500" /> : <ChevronDown className="w-4 h-4 text-neutral-500" />}
                  </button>
                  {open && (
                    <div className="px-4 pb-4 border-t border-white/5 pt-3">
                      <AiText text={h.answer} />
                      <div className="flex gap-3 mt-3">
                        <button onClick={() => copy(h.answer)} className="text-xs text-neutral-400 hover:text-white flex items-center gap-1"><Copy className="w-3.5 h-3.5" /> Copier</button>
                        {h.kind !== 'weekly' && <button onClick={() => remove(h.id)} className="text-xs text-neutral-500 hover:text-red-400 flex items-center gap-1"><Trash2 className="w-3.5 h-3.5" /> Supprimer</button>}
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      <p className="flex items-start gap-2 text-xs text-neutral-500 pb-4">
        <ShieldCheck className="w-4 h-4 flex-shrink-0 mt-0.5 text-neutral-600" />
        Analyse générée par une IA à partir des chiffres agrégés de vos stations : aucun nom de client, de plaque ni de laveur ne lui est transmis. Elle peut se tromper ou manquer de contexte : vérifiez les points importants avant d’agir.
      </p>
    </div>
  );
}
