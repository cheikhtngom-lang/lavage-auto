import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { motion } from 'framer-motion';
import { Layers, Footprints, Hourglass, PackageCheck, Banknote, RefreshCw, Loader2, Search, ArrowRight, Building2 } from 'lucide-react';
import { supabase } from '../../lib/supabaseClient';
import { useSuperAdminState } from '../../hooks/useSuperAdminState';
import { useDocumentTitle } from '../../lib/useDocumentTitle';
import { Section, KpiGrid, PeriodBar, Delta } from '../../components/group/shared';
import { AreaChart, Donut, Legend, Bars, compactNumber } from '../../components/ui/charts';
import Pagination from '../../components/ui/Pagination';
import { presetRange, bucketFor, bucketLabel } from '../../lib/groupDashboard';
import { fcfa, fcfaCompact } from '../../lib/bilan';
import { CARPET_SERVICE, SHOE_SERVICE, orderSummary, timeLeftLabel } from '../../lib/carpets';
import { computeCarpetStats, ORDER_FILTERS, matchesSearch, isLateOrder, isOpenOrder, toCollect } from '../../lib/carpetStats';

// Super Admin > Tapis et chaussures : les dépôts de tapis et moquettes, ou de
// chaussures (choix en haut de page, add_shoe_cleaning.sql), de TOUTES les
// stations (rubriques station Exploitation > Tapis / Chaussures). Lecture seule : la RLS de
// carpet_orders et de transactions ouvre déjà tout au super admin, aucune
// fonction SQL n'est nécessaire. Les notes internes des stations
// (carpet_order_notes) ne sont pas lues. Calculs : lib/carpetStats.js.

const ORDER_COLS = 'id, station_id, activity, ticket_no, client_id, client_name, client_phone, items, piece_count, amount, paid, payment_method, status, promised_at, ready_at, picked_up_at, created_at, from_station_id, from_order_id, partner_order_id, transaction_id';
const PAGE = 1000; // plafond de lignes par requête de l'API Supabase

// Lit toutes les lignes, 1 000 par 1 000.
async function fetchAll(build) {
  const rows = [];
  for (let i = 0; i < 50; i += 1) {
    const { data, error } = await build().range(i * PAGE, (i + 1) * PAGE - 1);
    if (error) throw new Error(error.message);
    rows.push(...(data || []));
    if (!data || data.length < PAGE) break;
  }
  return rows;
}

const plural = (n, one, many) => `${n.toLocaleString('fr-FR')} ${n > 1 ? many : one}`;

// Tapis ou chaussures : mêmes calculs, libellés propres à chaque activité.
const VIEWS = {
  tapis: {
    key: 'tapis', label: 'Tapis', title: 'Tapis et moquettes', icon: Layers, service: CARPET_SERVICE, unit: ['pièce', 'pièces'], things: 'tapis',
    received: 'Tapis reçus', returned: 'Tapis rendus', kinds: 'Types de pièces', kindsSub: 'Pièces reçues sur la période',
  },
  chaussures: {
    key: 'chaussures', label: 'Chaussures', title: 'Lavage de chaussures', icon: Footprints, service: SHOE_SERVICE, unit: ['paire', 'paires'], things: 'chaussures',
    received: 'Paires reçues', returned: 'Paires rendues', kinds: 'Types de chaussures', kindsSub: 'Paires reçues sur la période',
  },
};
const ViewContext = createContext(VIEWS.tapis);
const useView = () => useContext(ViewContext);
const unitWord = (view, n) => plural(n, view.unit[0], view.unit[1]);
// En heures jusqu'à 5 jours (une colonne se compare d'un coup d'œil), en jours au-delà.
const fmtHours = (h) => (h == null ? '—' : h < 120 ? `${Math.max(1, Math.round(h))} h` : `${Math.round(h / 24)} j`);
const fmtRate = (r) => (r == null ? null : `${Math.round(r * 100)} % à l'heure`);
const shortDate = (d) => {
  const x = new Date(d);
  const sameYear = x.getFullYear() === new Date().getFullYear();
  return x.toLocaleDateString('fr-FR', sameYear ? { day: 'numeric', month: 'short' } : { day: 'numeric', month: 'short', year: 'numeric' });
};
const since = (d, now) => {
  const h = Math.max(0, (+now - +new Date(d)) / 3600000);
  return h < 1 ? "moins d'une heure" : fmtHours(h);
};
const capitalize = (s) => s.charAt(0).toUpperCase() + s.slice(1);

// Couleur de chaque statut : point, texte et liseré (comme la Facturation).
const STATUS_LOOK = {
  depose: { label: 'Déposé', dot: 'bg-neutral-300' },
  lavage: { label: 'En lavage', dot: 'bg-sky-400' },
  sechage: { label: 'Au séchage', dot: 'bg-cyan-300' },
  pret: { label: 'Prêt à récupérer', dot: 'bg-emerald-400' },
  recupere: { label: 'Rendu au client', dot: 'bg-neutral-600' },
  annule: { label: 'Annulé', dot: 'bg-neutral-700' },
};

// Statut d'un dépôt : libellé, détail daté, retard.
function statusOf(o, now) {
  const look = STATUS_LOOK[o.status] || STATUS_LOOK.depose;
  if (isLateOrder(o, now)) return { ...look, detail: capitalize(timeLeftLabel(o.promised_at, now)), late: true };
  if (isOpenOrder(o)) return { ...look, detail: `À rendre ${timeLeftLabel(o.promised_at, now)}` };
  if (o.status === 'pret') return { ...look, detail: `Attend le client depuis ${since(o.ready_at || o.created_at, now)}` };
  if (o.status === 'recupere') return { ...look, detail: o.picked_up_at ? `Le ${shortDate(o.picked_up_at)}` : '' };
  return { ...look, detail: '' };
}

const initials = (name) => (name || '?').split(/[^\p{L}\p{N}]+/u).filter(Boolean).slice(0, 2).map((w) => w[0]).join('').toUpperCase() || '?';

function StationMark({ station }) {
  const [broken, setBroken] = useState(false);
  if (station?.logo && !broken) {
    return <img src={station.logo} alt="" loading="lazy" onError={() => setBroken(true)} className="h-9 w-9 shrink-0 rounded-xl object-cover ring-1 ring-white/10" />;
  }
  return (
    <span aria-hidden="true" className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-white/[0.05] font-display text-[12px] font-bold tracking-wide text-neutral-200 ring-1 ring-inset ring-white/10">
      {initials(station?.name)}
    </span>
  );
}

// ─── Classement des stations ───────────────────────────────────────────
const STATION_COLS = [
  { key: 'name', label: 'Station', align: 'left' },
  { key: 'revenue', label: "Chiffre d'affaires", align: 'right' },
  { key: 'receivedPieces', label: 'Reçus', align: 'right' },
  { key: 'openPieces', label: 'En cours', align: 'right' },
  { key: 'lateOrders', label: 'En retard', align: 'right' },
  { key: 'returnedPieces', label: 'Rendus', align: 'right' },
  { key: 'avgReadyHours', label: 'Délai moyen', align: 'right' },
  { key: 'toCollect', label: 'À encaisser', align: 'right' },
];

function StationsTable({ rows, totalRevenue }) {
  const view = useView();
  const [sort, setSort] = useState({ key: 'revenue', dir: 'desc' });
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  useEffect(() => { setPage(1); }, [rows.length, sort.key, sort.dir]);
  const sorted = useMemo(() => {
    const dir = sort.dir === 'asc' ? 1 : -1;
    return [...rows].sort((a, b) => {
      const va = a[sort.key], vb = b[sort.key];
      if (va == null && vb == null) return 0;
      if (va == null) return 1;
      if (vb == null) return -1;
      return typeof va === 'string' ? dir * va.localeCompare(vb, 'fr') : dir * (va - vb);
    });
  }, [rows, sort]);
  const visible = sorted.slice((page - 1) * pageSize, page * pageSize);

  return (
    <div>
      <div className="overflow-x-auto -mx-2">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-neutral-400 border-b border-white/10">
              {STATION_COLS.map((c) => (
                <th
                  key={c.key}
                  aria-sort={sort.key === c.key ? (sort.dir === 'desc' ? 'descending' : 'ascending') : undefined}
                  className={`px-2 py-3 font-medium whitespace-nowrap ${c.align === 'right' ? 'text-right' : 'text-left'}`}
                >
                  <button
                    type="button"
                    onClick={() => setSort({ key: c.key, dir: sort.key === c.key && sort.dir === 'desc' ? 'asc' : 'desc' })}
                    className="hover:text-white focus-visible:outline-none focus-visible:text-white"
                  >
                    {c.label}{sort.key === c.key ? (sort.dir === 'desc' ? ' ↓' : ' ↑') : ''}
                  </button>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {visible.map((s) => {
              const share = totalRevenue > 0 ? s.revenue / totalRevenue : 0;
              return (
                <tr key={s.station_id} className="border-b border-white/5 hover:bg-white/[0.03]">
                  <td className="px-2 py-3">
                    <div className="flex items-center gap-3 min-w-[11rem]">
                      <StationMark station={s.station} />
                      <div className="min-w-0">
                        <p className="font-semibold text-white truncate">{s.name}</p>
                        <p className="text-xs text-neutral-500 truncate">{s.city || '—'}</p>
                      </div>
                    </div>
                  </td>
                  <td className="px-2 py-3 text-right">
                    <p className="font-semibold text-white tabular-nums whitespace-nowrap">{fcfa(s.revenue)}</p>
                    <div className="flex items-center justify-end gap-2 mt-1">
                      <Delta d={s.revenueDelta} />
                      <span className="text-[11px] text-neutral-500">{Math.round(share * 100)} %</span>
                    </div>
                    <div className="h-1 rounded-full bg-white/10 mt-1 ml-auto w-24 overflow-hidden"><div className="h-full bg-emerald-500" style={{ width: `${Math.round(share * 100)}%` }} /></div>
                  </td>
                  <td className="px-2 py-3 text-right text-neutral-200 tabular-nums whitespace-nowrap">
                    {s.receivedPieces}<span className="block text-xs text-neutral-500">{plural(s.receivedOrders, 'dépôt', 'dépôts')}</span>
                  </td>
                  <td className="px-2 py-3 text-right text-neutral-200 tabular-nums whitespace-nowrap">
                    {s.openPieces}{s.readyOrders > 0 && <span className="block text-xs text-emerald-300">{plural(s.readyOrders, 'prêt', 'prêts')}</span>}
                  </td>
                  <td className={`px-2 py-3 text-right tabular-nums ${s.lateOrders > 0 ? 'font-semibold text-red-300' : 'text-neutral-500'}`}>{s.lateOrders}</td>
                  <td className="px-2 py-3 text-right text-neutral-200 tabular-nums">{s.returnedPieces}</td>
                  <td className="px-2 py-3 text-right text-neutral-200 tabular-nums whitespace-nowrap">
                    {fmtHours(s.avgReadyHours)}{fmtRate(s.onTimeRate) && <span className="block text-xs text-neutral-500">{fmtRate(s.onTimeRate)}</span>}
                  </td>
                  <td className={`px-2 py-3 text-right tabular-nums whitespace-nowrap ${s.toCollect > 0 ? 'text-amber-300' : 'text-neutral-500'}`}>{s.toCollect > 0 ? fcfa(s.toCollect) : '—'}</td>
                </tr>
              );
            })}
            {sorted.length === 0 && <tr><td colSpan={STATION_COLS.length} className="px-2 py-8 text-center text-neutral-500">Aucune station n'a encore enregistré de {view.things}.</td></tr>}
          </tbody>
        </table>
      </div>
      {sorted.length > 10 && (
        <Pagination page={page} pageSize={pageSize} totalItems={sorted.length} onPageChange={setPage} onPageSizeChange={(n) => { setPageSize(n); setPage(1); }} />
      )}
    </div>
  );
}

// ─── Stations partenaires ──────────────────────────────────────────────
function PartnersList({ flows, nameOf }) {
  const view = useView();
  if (flows.length === 0) {
    return <p className="text-sm text-neutral-500">Aucune station n'a encore confié de {view.things} à une autre. Ça se fait depuis la rubrique {view.label} de la station : « Plus › Confier à une autre station ».</p>;
  }
  return (
    <ul className="divide-y divide-white/[0.06] -mx-2">
      {flows.map((f) => (
        <li key={f.key} className="grid grid-cols-1 gap-2 px-2 py-3.5 sm:grid-cols-[minmax(0,1.6fr)_repeat(3,minmax(0,1fr))] sm:items-center sm:gap-4">
          <div className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-0.5 text-sm">
            <span className="font-semibold text-white">{nameOf(f.fromId)}</span>
            <ArrowRight className="h-4 w-4 shrink-0 text-neutral-500" aria-label={`confie ses ${view.things} à`} />
            <span className="font-semibold text-white">{nameOf(f.toId)}</span>
            <span className="w-full text-xs text-neutral-500">Dernier dépôt le {shortDate(f.lastAt)}</span>
          </div>
          <div className="text-sm sm:text-right">
            <p className="text-neutral-200 tabular-nums">{plural(f.orders, 'dépôt', 'dépôts')}</p>
            <p className="text-xs text-neutral-500">{unitWord(view, f.pieces)}</p>
          </div>
          <div className="text-sm sm:text-right">
            <p className="text-white font-semibold tabular-nums whitespace-nowrap">{fcfa(f.billed)}</p>
            <p className={`text-xs ${f.billed - f.collected > 0 ? 'text-amber-300' : 'text-neutral-500'}`}>
              {f.billed - f.collected > 0 ? `${fcfa(f.billed - f.collected)} à encaisser` : f.billed > 0 ? 'Tout encaissé' : 'Prix à fixer'}
            </p>
          </div>
          <div className="text-sm sm:text-right">
            {f.open > 0 && <p className="text-neutral-200">{plural(f.open, 'en cours', 'en cours')}</p>}
            {f.ready > 0 && <p className="text-emerald-300">{plural(f.ready, 'prêt à aller chercher', 'prêts à aller chercher')}</p>}
            {f.open + f.ready === 0 && <p className="text-neutral-500">Tout est rendu</p>}
          </div>
        </li>
      ))}
    </ul>
  );
}

// ─── Liste des dépôts ──────────────────────────────────────────────────
// En colonnes sur grand écran, en carte sur téléphone (comme la Facturation).
// Le n° de ticket est propre à chaque station : il est écrit sous son nom.
const ROW_GRID = "grid grid-cols-[minmax(0,1.25fr)_minmax(0,1fr)] gap-x-4 gap-y-3 [grid-template-areas:'station_price'_'client_items'_'status_status'] lg:grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)_minmax(0,1.05fr)_minmax(0,1.2fr)_8rem] lg:items-center lg:[grid-template-areas:'station_client_items_status_price']";

function OrdersList({ orders, stationById, partnerStationOf, now }) {
  const view = useView();
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState('tous');
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const nameOf = (id) => stationById.get(id)?.name || 'Station supprimée';

  const counts = useMemo(() => Object.fromEntries(ORDER_FILTERS.map((f) => [f.key, orders.filter((o) => f.test(o, now)).length])), [orders, now]);
  const active = ORDER_FILTERS.find((f) => f.key === filter) || ORDER_FILTERS[0];
  const filtered = useMemo(() => {
    const list = orders.filter((o) => active.test(o, now) && matchesSearch(o, search, nameOf(o.station_id)));
    // En retard : le plus en retard d'abord. Sinon : le plus récent d'abord.
    return active.key === 'retard'
      ? list.sort((a, b) => new Date(a.promised_at) - new Date(b.promised_at))
      : list.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [orders, active, search, now, stationById]);
  useEffect(() => { setPage(1); }, [search, filter]);
  const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize));
  const current = Math.min(page, totalPages);
  const visible = filtered.slice((current - 1) * pageSize, current * pageSize);

  const renderRow = (o) => {
    const st = statusOf(o, now);
    const station = stationById.get(o.station_id);
    const due = toCollect(o);
    const partnerId = o.partner_order_id ? partnerStationOf(o.partner_order_id) : null;
    return (
      <li
        key={o.id}
        className={`relative px-4 py-4 transition-colors hover:bg-white/[0.02] lg:px-6 lg:py-[16px] ${ROW_GRID} ${o.status === 'annule' ? 'opacity-60' : ''}`}
        style={st.late ? { backgroundImage: 'linear-gradient(90deg, rgba(248,113,113,0.06), transparent 45%)' } : undefined}
      >
        {st.late && <span aria-hidden="true" className="absolute bottom-3 left-0 top-3 w-[3px] rounded-r-full bg-red-400" />}

        <div className="flex min-w-0 items-center gap-3 [grid-area:station]">
          <span className="max-sm:hidden"><StationMark station={station} /></span>
          <div className="min-w-0">
            <p className="line-clamp-2 break-words text-sm font-semibold leading-snug text-white" title={nameOf(o.station_id)}>{nameOf(o.station_id)}</p>
            <p className="truncate text-xs text-neutral-500"><span className="font-semibold text-neutral-300 tabular-nums">n° {o.ticket_no}</span> · <span className="max-sm:hidden">déposé le </span>{shortDate(o.created_at)}</p>
          </div>
        </div>

        <div className="min-w-0 [grid-area:client]">
          <p className="truncate text-sm text-neutral-100" title={o.client_name}>{o.client_name}</p>
          {o.from_station_id
            ? <p className="flex items-center gap-1 truncate text-xs text-sky-300"><Building2 className="h-3 w-3 shrink-0" /> Station partenaire</p>
            : <p className="truncate text-xs text-neutral-500 tabular-nums">{o.client_phone || 'Sans téléphone'}</p>}
        </div>

        <div className="min-w-0 [grid-area:items]">
          <p className="text-sm text-neutral-200 first-letter:uppercase">{orderSummary(o)}</p>
          <p className="text-xs text-neutral-500">{unitWord(view, o.piece_count || 1)}</p>
        </div>

        <div className="min-w-0 [grid-area:status] max-lg:rounded-xl max-lg:bg-white/[0.025] max-lg:p-3">
          <p className="flex items-center gap-2 text-sm font-medium text-white">
            <span aria-hidden="true" className={`h-2 w-2 shrink-0 rounded-full ${st.late ? 'bg-red-400' : st.dot}`} style={st.late ? { boxShadow: '0 0 0 4px rgba(248,113,113,0.16)' } : undefined} />
            {st.label}
          </p>
          {st.detail && <p className={`mt-0.5 pl-4 text-xs ${st.late ? 'text-red-300' : 'text-neutral-400'}`}>{st.detail}</p>}
          {partnerId && <p className="mt-0.5 flex items-center gap-1 pl-4 text-xs text-sky-300"><ArrowRight className="h-3 w-3 shrink-0" /> Confié à {nameOf(partnerId)}</p>}
        </div>

        <div className="min-w-0 text-right [grid-area:price]">
          {o.amount > 0
            ? <p className="whitespace-nowrap font-display text-[15px] font-semibold text-white tabular-nums">{fcfa(o.amount)}</p>
            : <p className="text-sm text-neutral-500">Prix à fixer</p>}
          {o.paid
            ? <p className="text-xs text-emerald-300">Payé{o.payment_method ? ` · ${o.payment_method}` : ''}</p>
            : due > 0 ? <p className="text-xs text-amber-300">À encaisser</p> : null}
        </div>
      </li>
    );
  };

  return (
    <div>
      <div className="mb-4 flex flex-col gap-3">
        <div className="relative w-full sm:max-w-xs">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-neutral-500" />
          <input
            type="search"
            placeholder="Ticket, client, téléphone ou station"
            aria-label="Rechercher un dépôt par ticket, client, téléphone ou station"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="h-10 w-full rounded-xl border border-white/10 bg-white/[0.03] pl-9 pr-3 text-sm text-white placeholder:text-neutral-500 transition-colors focus:border-white/25 focus:bg-white/[0.05] focus:outline-none"
          />
        </div>
        <div className="-mx-6 overflow-x-auto px-6 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          <div className="inline-flex gap-1 rounded-xl border border-white/[0.07] bg-white/[0.02] p-1" role="group" aria-label="Filtrer les dépôts">
            {ORDER_FILTERS.map((f) => {
              const on = f.key === active.key;
              const n = counts[f.key];
              return (
                <button
                  key={f.key}
                  type="button"
                  aria-pressed={on}
                  onClick={() => setFilter(f.key)}
                  className={`relative flex h-8 items-center gap-2 whitespace-nowrap rounded-lg px-3 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/30 ${on ? 'text-white' : 'text-neutral-400 hover:text-neutral-200'}`}
                >
                  {on && (
                    <motion.span
                      layoutId="carpet-filter"
                      transition={{ type: 'spring', duration: 0.35, bounce: 0.15 }}
                      className="absolute inset-0 rounded-lg bg-white/[0.09] shadow-[inset_0_1px_0_rgba(255,255,255,0.06)]"
                    />
                  )}
                  <span className="relative">{f.label}</span>
                  <span className={`relative text-xs tabular-nums ${f.key === 'retard' && n > 0 ? 'font-semibold text-red-300' : 'text-neutral-500'}`}>{n}</span>
                </button>
              );
            })}
          </div>
        </div>
      </div>

      {filtered.length === 0 ? (
        <div className="rounded-2xl border-2 border-dashed border-white/10 p-10 text-center">
          <Layers className="mx-auto mb-3 h-10 w-10 text-neutral-600" />
          <p className="font-semibold text-white">{search ? 'Aucun dépôt trouvé' : 'Aucun dépôt dans ce filtre'}</p>
          <p className="mt-1 text-sm text-neutral-400">{search ? 'Ajustez votre recherche.' : 'Rien à signaler ici pour le moment.'}</p>
        </div>
      ) : (
        <div className="overflow-hidden rounded-2xl border border-white/[0.07] bg-neutral-950/70 shadow-[inset_0_1px_0_rgba(255,255,255,0.04),0_24px_60px_-30px_rgba(0,0,0,0.8)]">
          <div aria-hidden="true" className={`hidden border-b border-white/[0.07] px-6 py-3 text-xs font-medium text-neutral-500 lg:grid ${ROW_GRID}`}>
            <span className="[grid-area:station]">Station et ticket</span>
            <span className="[grid-area:client]">Client</span>
            <span className="[grid-area:items]">{view.unit[1].charAt(0).toUpperCase() + view.unit[1].slice(1)}</span>
            <span className="[grid-area:status]">Avancement</span>
            <span className="[grid-area:price] text-right">Prix</span>
          </div>
          <ul className="divide-y divide-white/[0.06]">{visible.map(renderRow)}</ul>
          <Pagination
            page={current}
            pageSize={pageSize}
            totalItems={filtered.length}
            onPageChange={setPage}
            onPageSizeChange={(n) => { setPageSize(n); setPage(1); }}
          />
        </div>
      )}
    </div>
  );
}

// ─── Page ──────────────────────────────────────────────────────────────
export default function Carpets() {
  useDocumentTitle('Tapis et chaussures');
  const { stations } = useSuperAdminState();
  const [activity, setActivity] = useState('tapis');
  const view = VIEWS[activity];
  const pieceWord = (n) => unitWord(view, n);
  const [preset, setPreset] = useState('30d');
  const [custom, setCustom] = useState({ start: '', end: '' });
  const [allOrders, setOrders] = useState(null);
  const [allPayments, setPayments] = useState([]);
  // Activité choisie : les dépôts et encaissements des deux sont lus une fois.
  const orders = useMemo(() => (allOrders ? allOrders.filter((o) => (o.activity || 'tapis') === activity) : null), [allOrders, activity]);
  const payments = useMemo(() => allPayments.filter((p) => p.service === view.service), [allPayments, view.service]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [metric, setMetric] = useState('revenue');
  const [now, setNow] = useState(() => new Date());

  const range = useMemo(() => presetRange(preset, custom), [preset, custom]);
  const bucket = range ? bucketFor(range.from, range.to) : 'day';

  // Dépôts : tous, toutes dates (liste, en cours, partenaires). Encaissements
  // « Tapis » : période choisie et période précédente (évolutions).
  const load = useCallback(async () => {
    if (!range) return;
    setLoading(true);
    setError('');
    try {
      const prevFrom = new Date(+range.from - (+range.to - +range.from));
      const [o, p] = await Promise.all([
        fetchAll(() => supabase.from('carpet_orders').select(ORDER_COLS).order('created_at', { ascending: false }).order('id')),
        fetchAll(() => supabase.from('transactions').select('id, station_id, service, amount, method, created_at')
          .in('service', [CARPET_SERVICE, SHOE_SERVICE]).gte('created_at', prevFrom.toISOString()).lt('created_at', range.to.toISOString())
          .order('created_at', { ascending: false }).order('id')),
      ]);
      setOrders(o);
      setPayments(p);
      setNow(new Date());
    } catch (err) {
      setError(err.message || 'Lecture impossible.');
    } finally {
      setLoading(false);
    }
  }, [range]);
  useEffect(() => { load(); }, [load]);

  const stationById = useMemo(() => new Map((stations || []).map((s) => [s.id, s])), [stations]);
  const nameOf = useCallback((id) => stationById.get(id)?.name || 'Station supprimée', [stationById]);
  const orderById = useMemo(() => new Map((orders || []).map((o) => [o.id, o])), [orders]);
  const partnerStationOf = useCallback((orderId) => orderById.get(orderId)?.station_id || null, [orderById]);

  const stats = useMemo(
    () => (orders && range ? computeCarpetStats({ orders, payments, from: range.from, to: range.to, bucket, now }) : null),
    [orders, payments, range, bucket, now],
  );
  const stationRows = useMemo(() => (stats?.perStation || []).map((s) => {
    const st = stationById.get(s.station_id);
    return { ...s, station: st, name: st?.name || 'Station supprimée', city: [st?.quartier, st?.city].filter(Boolean).filter((v, i, a) => a.indexOf(v) === i).join(', ') };
  }), [stats, stationById]);

  const t = stats?.totals;
  const trend = (stats?.trend || []).map((p) => ({ ...p, label: bucketLabel(p.label, bucket) }));
  const kpis = t ? [
    { title: view.received, value: t.receivedPieces, icon: view.icon, color: 'text-sky-400', bg: 'bg-sky-500/10', d: stats.deltas.receivedPieces,
      spark: trend.map((p) => p.pieces), sparkColor: '#0ea5e9',
      sub: `${plural(t.receivedOrders, 'dépôt', 'dépôts')}${t.receivedFromPartners ? ` · dont ${t.receivedFromPartners} d'une station partenaire` : ''}` },
    { title: 'En cours, en ce moment', value: t.openPieces, icon: Hourglass, color: 'text-amber-400', bg: 'bg-amber-500/10',
      sub: `${plural(t.lateOrders, 'dépôt en retard', 'dépôts en retard')} · ${plural(t.readyOrders, 'prêt à récupérer', 'prêts à récupérer')}` },
    { title: view.returned, value: t.returnedPieces, icon: PackageCheck, color: 'text-emerald-400', bg: 'bg-emerald-500/10', d: stats.deltas.returnedPieces,
      sub: t.avgReadyHours != null ? `Prêts en ${fmtHours(t.avgReadyHours)} en moyenne${t.onTimeRate != null ? ` · ${fmtRate(t.onTimeRate)}` : ''}` : 'Aucun dépôt prêt sur la période' },
    { title: `Chiffre d'affaires ${view.label}`, value: t.revenue, suffix: ' FCFA', icon: Banknote, color: 'text-emerald-400', bg: 'bg-emerald-500/10', d: stats.deltas.revenue,
      spark: trend.map((p) => p.revenue), sparkColor: '#10b981',
      sub: t.toCollect > 0 ? `Reste à encaisser : ${fcfa(t.toCollect)}` : `Période précédente : ${fcfa(t.revenuePrev)}` },
  ] : [];
  const revenueBars = stationRows.filter((s) => s.revenue > 0).sort((a, b) => b.revenue - a.revenue).slice(0, 8)
    .map((s) => ({ label: s.name, value: s.revenue }));
  const kindTotal = (stats?.byKind || []).reduce((s, k) => s + k.value, 0);

  const ViewIcon = view.icon;
  return (
    <ViewContext.Provider value={view}>
    <div className="p-4 sm:p-6 lg:p-8 max-w-7xl mx-auto">
      <div className="flex flex-col lg:flex-row lg:items-end justify-between gap-4 mb-6">
        <div>
          <h1 className="text-3xl sm:text-4xl font-bold tracking-tight flex items-center gap-3"><ViewIcon className="w-9 h-9 text-blue-400" /> {view.title}</h1>
          <p className="text-neutral-400 mt-1">{range ? `${range.label} · comparé à la période précédente de même durée` : 'Choisissez une période'}</p>
          <div className="mt-4 inline-flex gap-1 p-1 rounded-xl bg-white/5 border border-white/10" role="tablist" aria-label="Activité">
            {Object.values(VIEWS).map((v) => (
              <button key={v.key} type="button" role="tab" aria-selected={activity === v.key} onClick={() => setActivity(v.key)}
                className={`inline-flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors ${activity === v.key ? 'bg-blue-600 text-white' : 'text-neutral-400 hover:text-white'}`}>
                <v.icon className="w-4 h-4" /> {v.label}
              </button>
            ))}
          </div>
        </div>
        <button onClick={load} disabled={loading} className="self-start lg:self-auto p-2.5 bg-white/5 hover:bg-white/10 border border-white/10 rounded-xl text-neutral-300 disabled:opacity-60" title="Actualiser" aria-label="Actualiser">
          {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
        </button>
      </div>

      <PeriodBar preset={preset} onPreset={setPreset} custom={custom} onCustom={setCustom} />

      {error && <div className="mb-6 text-sm text-red-400 bg-red-500/10 border border-red-500/20 rounded-xl px-4 py-2.5">{error}</div>}
      {!orders && loading && <div className="flex items-center gap-3 text-neutral-400 p-8"><Loader2 className="w-5 h-5 animate-spin" /> Calcul…</div>}

      {orders && stats && (
        <div className={`space-y-6 transition-opacity ${loading ? 'opacity-60' : ''}`}>
          {orders.length === 0 ? (
            <div className="glass-card rounded-2xl p-12 text-center border-dashed border-2 border-white/10">
              <ViewIcon className="w-14 h-14 text-neutral-600 mx-auto mb-4" />
              <h3 className="text-xl font-bold mb-2">Aucun dépôt de {view.things} pour l'instant</h3>
              <p className="text-neutral-400">Les chiffres apparaissent dès qu'une station enregistre un dépôt dans sa rubrique Exploitation › {view.label}.</p>
            </div>
          ) : (
            <>
              <KpiGrid items={kpis} />

              <Section
                title="Évolution"
                subtitle={bucket === 'day' ? 'Par jour' : bucket === 'week' ? 'Par semaine' : 'Par mois'}
                right={(
                  <div className="flex gap-1 bg-black/30 rounded-lg p-1">
                    {[['revenue', "Chiffre d'affaires"], ['pieces', view.received]].map(([k, l]) => (
                      <button key={k} type="button" aria-pressed={metric === k} onClick={() => setMetric(k)} className={`px-3 py-1 rounded-md text-xs font-semibold ${metric === k ? 'bg-emerald-600 text-white' : 'text-neutral-400 hover:text-white'}`}>{l}</button>
                    ))}
                  </div>
                )}
              >
                <AreaChart
                  data={trend}
                  series={metric === 'revenue' ? [{ key: 'revenue', label: "Chiffre d'affaires", color: '#10b981' }] : [{ key: 'pieces', label: view.received, color: '#0ea5e9' }]}
                  height={260}
                  formatValue={metric === 'revenue' ? fcfa : pieceWord}
                  formatTick={metric === 'revenue' ? fcfaCompact : compactNumber}
                  integer={metric === 'pieces'}
                  emptyWhenZero
                  ariaLabel={metric === 'revenue' ? `Chiffre d'affaires ${view.label} sur la période` : `${view.received} sur la période`}
                />
              </Section>

              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                <Section title={view.kinds} subtitle={view.kindsSub}>
                  {kindTotal === 0 ? <p className="text-sm text-neutral-500">Aucun dépôt sur la période.</p> : (
                    <div className="flex flex-col sm:flex-row items-center gap-6">
                      <Donut data={stats.byKind} centerLabel={String(kindTotal)} centerSub={kindTotal > 1 ? view.unit[1] : view.unit[0]} />
                      <div className="flex-1 w-full"><Legend data={stats.byKind} formatValue={pieceWord} /></div>
                    </div>
                  )}
                </Section>
                <Section title="Chiffre d'affaires par station" subtitle="Les 8 premières sur la période">
                  {revenueBars.length === 0 ? <p className="text-sm text-neutral-500">Aucun encaissement {view.label} sur la période.</p> : <Bars data={revenueBars} color="#10b981" formatValue={fcfa} />}
                </Section>
              </div>

              <Section title="Stations" subtitle="Reçus, rendus et chiffre d'affaires sur la période ; en cours et en retard en ce moment. Cliquez sur un en-tête pour trier.">
                <StationsTable rows={stationRows} totalRevenue={t.revenue} />
              </Section>

              <Section
                title="Stations partenaires"
                subtitle={`Une station qui confie ses ${view.things} à une autre station Galsen, depuis le début${t.partnerRevenue > 0 ? ` · ${fcfa(t.partnerRevenue)} facturés entre stations sur la période` : ''}`}
              >
                <PartnersList flows={stats.partners} nameOf={nameOf} />
              </Section>

              <Section title="Dépôts" subtitle="Toutes les stations, toutes dates : la période ne filtre pas cette liste">
                <OrdersList orders={orders} stationById={stationById} partnerStationOf={partnerStationOf} now={now} />
              </Section>

              <p className="text-xs text-neutral-600 text-center pb-4 max-w-3xl mx-auto leading-relaxed">
                Chiffre d'affaires : encaissements « {view.label} » des stations, comme dans leur Comptabilité. Cet argent revient aux stations :
                il ne passe pas par la plateforme et n'entre pas dans le MRR. Un dépôt confié à une station partenaire est compté chez les deux stations.
                Les dépôts annulés ne sont comptés nulle part.
              </p>
            </>
          )}
        </div>
      )}
    </div>
    </ViewContext.Provider>
  );
}
