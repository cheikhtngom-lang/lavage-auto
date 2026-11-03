import React, { useMemo, useState } from 'react';
import { Search, UserPlus, X, Check, MessageCircle, FileText, BatteryCharging, Trash2, PauseCircle, PlayCircle, ChevronLeft, ChevronRight, Pencil, AlertTriangle, AlertCircle, Phone } from 'lucide-react';
import { useAppState } from '../../hooks/useAppState';
import { useDocumentTitle } from '../../lib/useDocumentTitle';
import { useMediaQuery } from '../../lib/useMediaQuery';
import { whatsappLink } from '../../lib/subscriptionReminders';
import { cn } from '../../lib/utils';

// Abonnements clients de la station : forfaits mensuels prépayés. Le solde
// (balance) est débité à chaque lavage payé « Abonnement » (trigger
// deduct_subscription_balance) ; les factures mensuelles comptent dans la
// comptabilité une fois payées (Accounting.jsx). Mise en page : bandeau du
// mois en cours, puis liste des abonnés + fiche (carnet des 12 mois,
// historique), ou journal des factures regroupé par mois.

const fcfa = (n) => `${(Number(n) || 0).toLocaleString('fr-FR')} FCFA`;
const monthKeyOf = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
const monthDate = (key) => { const [y, m] = key.split('-').map(Number); return new Date(y, m - 1, 1); };
const monthLong = (key) => monthDate(key).toLocaleDateString('fr-FR', { month: 'long', year: 'numeric' });
const monthName = (key) => monthDate(key).toLocaleDateString('fr-FR', { month: 'long' });
const monthShort = (key) => monthDate(key).toLocaleDateString('fr-FR', { month: 'short' }).replace('.', '');
const capitalize = (s) => (s ? s.charAt(0).toUpperCase() + s.slice(1) : s);
const initials = (name) => (name || '?').trim().split(/\s+/).slice(0, 2).map((w) => w[0]).join('').toUpperCase() || '?';
const parseAmount = (v) => Math.max(0, parseInt(String(v).replace(/\D/g, ''), 10) || 0);

const INVOICE_STATE = {
  paye: { label: 'Payée', dot: 'bg-emerald-400', text: 'text-emerald-300' },
  a_payer: { label: 'À payer', dot: 'bg-amber-400', text: 'text-amber-300' },
  annule: { label: 'Annulée', dot: 'bg-neutral-600', text: 'text-neutral-500' },
};

// Facture « vivante » d'un abonné pour un mois, hors annulées : une facture
// payée l'emporte (mois réglé même s'il reste un doublon à annuler).
const liveInvoice = (invoices, month) => {
  const live = invoices.filter((i) => i.billingMonth === month && i.status !== 'annule');
  return live.find((i) => i.status === 'paye') || live[0] || null;
};

const focusRing = 'outline-none focus-visible:ring-2 focus-visible:ring-emerald-400/70';
const btnPrimary = cn('inline-flex items-center justify-center gap-2 rounded-xl bg-emerald-500 px-4 py-2.5 text-sm font-semibold text-neutral-950 transition-colors hover:bg-emerald-400 disabled:cursor-not-allowed disabled:opacity-50', focusRing);
const btnSecondary = cn('inline-flex items-center justify-center gap-2 rounded-xl border border-white/10 bg-white/[0.04] px-4 py-2.5 text-sm font-semibold text-neutral-100 transition-colors hover:bg-white/[0.08] disabled:cursor-not-allowed disabled:opacity-50', focusRing);
const inputCls = 'w-full rounded-xl border border-white/10 bg-neutral-950 px-3.5 py-2.5 text-white placeholder:text-neutral-600 focus:border-emerald-500 focus:outline-none';

// ─── Carnet : les 12 mois d'une année, une case par mois ────────────────
// Payé = case pleine, à payer = case cerclée ambre, non facturé = pointillés.
function Carnet({ invoices, year, startKey, currentKey, compact = false, onPickMonth }) {
  const months = Array.from({ length: 12 }, (_, i) => `${year}-${String(i + 1).padStart(2, '0')}`);
  return (
    <ol className={cn('grid', compact ? 'grid-cols-12 gap-[3px]' : 'grid-cols-6 gap-2 sm:grid-cols-12')} aria-label={`Carnet ${year}`}>
      {months.map((key) => {
        const inv = liveInvoice(invoices, key);
        const state = inv?.status || null;
        const outside = key < startKey || key > currentKey;
        const isCurrent = key === currentKey;
        const label = `${capitalize(monthLong(key))} : ${state === 'paye' ? `payé, ${fcfa(inv.amount)}` : state === 'a_payer' ? `à payer, ${fcfa(inv.amount)}` : outside ? 'hors abonnement' : 'pas facturé'}`;
        const tone = state === 'paye'
          ? 'border-emerald-400/50 bg-emerald-400/20 text-emerald-200'
          : state === 'a_payer'
            ? 'border-amber-400/60 bg-amber-400/10 text-amber-200'
            : outside ? 'border-white/[0.05] bg-transparent text-neutral-700' : 'border-dashed border-white/15 bg-transparent text-neutral-500';
        if (compact) {
          return <li key={key} title={label} className={cn('h-2 rounded-[2px] border', tone, isCurrent && 'ring-1 ring-white/40 ring-offset-1 ring-offset-neutral-950')} />;
        }
        const canBill = !inv && !outside && onPickMonth;
        const Cell = canBill ? 'button' : 'div';
        return (
          <li key={key}>
            <Cell
              {...(canBill ? { type: 'button', onClick: () => onPickMonth(key) } : {})}
              title={canBill ? `${label}. Cliquer pour facturer.` : label}
              aria-label={canBill ? `${label}. Facturer ce mois` : label}
              className={cn('flex h-14 w-full flex-col items-center justify-center rounded-lg border text-xs font-medium transition-colors', tone, isCurrent && 'ring-1 ring-white/40', canBill && cn('hover:border-emerald-400/60 hover:text-emerald-200', focusRing))}
            >
              <span className="capitalize">{monthShort(key)}</span>
              <span className="mt-1 h-3.5">{state === 'paye' ? <Check className="h-3.5 w-3.5" strokeWidth={3} /> : state === 'a_payer' ? <span className="block h-1.5 w-1.5 rounded-full bg-amber-400" /> : null}</span>
            </Cell>
          </li>
        );
      })}
    </ol>
  );
}

// ─── Fenêtres ─────────────────────────────────────────────────────────────
function Modal({ title, subtitle, onClose, busy, children }) {
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/70 p-0 sm:items-center sm:p-4" onClick={(e) => { if (e.target === e.currentTarget && !busy) onClose(); }}>
      <div role="dialog" aria-modal="true" aria-label={title} className="relative max-h-[92vh] w-full overflow-y-auto rounded-t-2xl border border-white/10 bg-neutral-900 p-6 shadow-2xl sm:max-w-md sm:rounded-2xl">
        <button type="button" onClick={onClose} disabled={busy} aria-label="Fermer" className="modal-close"><X className="h-6 w-6" /></button>
        <h2 className="font-display text-2xl font-bold text-white">{title}</h2>
        {subtitle && <p className="mt-1 text-neutral-400">{subtitle}</p>}
        <div className="mt-6">{children}</div>
      </div>
    </div>
  );
}

// Montant tapé librement, avec l'option d'en faire le nouveau prix mensuel
// quand il diffère du prix actuel de l'abonné.
function AmountField({ id, amount, setAmount, price, keepAsPrice, setKeepAsPrice }) {
  const value = parseAmount(amount);
  return (
    <>
      <label htmlFor={id} className="mb-1.5 block text-sm font-medium text-neutral-300">Montant (FCFA)</label>
      <input id={id} type="text" inputMode="numeric" autoComplete="off" value={amount} onChange={(e) => setAmount(e.target.value)} className={cn(inputCls, 'font-display text-xl tabular-nums')} />
      <p className="mt-1.5 text-xs text-neutral-500">Prix actuel de l'abonnement : {fcfa(price)} par mois. Vous pouvez taper un autre montant.</p>
      {value > 0 && value !== price && (
        <label className="mt-3 flex cursor-pointer items-start gap-3 rounded-xl border border-white/10 bg-white/[0.03] p-3.5">
          <input type="checkbox" checked={keepAsPrice} onChange={(e) => setKeepAsPrice(e.target.checked)} className="mt-0.5 accent-emerald-500" />
          <span className="text-sm text-neutral-300">Faire de {fcfa(value)} le nouveau prix mensuel (au lieu de {fcfa(price)})</span>
        </label>
      )}
    </>
  );
}

function InvoiceModal({ sub, invoices, initialMonth, onClose, onSubmit }) {
  const [month, setMonth] = useState(initialMonth);
  const [amount, setAmount] = useState(String(sub.price));
  const [keepAsPrice, setKeepAsPrice] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const existing = month ? liveInvoice(invoices, month) : null;
  const value = parseAmount(amount);

  const submit = async (e) => {
    e.preventDefault();
    if (!month || !value || existing) return;
    setBusy(true);
    setError('');
    const err = await onSubmit({ month, amount: value, keepAsPrice: keepAsPrice && value !== sub.price });
    if (err) { setError(err.message || 'La facture n’a pas été créée.'); setBusy(false); return; }
    onClose();
  };

  return (
    <Modal title="Facturer un mois" subtitle={sub.clientName} onClose={onClose} busy={busy}>
      <form onSubmit={submit} className="space-y-5">
        <div>
          <label htmlFor="inv-month" className="mb-1.5 block text-sm font-medium text-neutral-300">Mois facturé</label>
          <input id="inv-month" type="month" value={month} onChange={(e) => setMonth(e.target.value)} className={cn(inputCls, '[color-scheme:dark]')} required />
        </div>
        <div><AmountField id="inv-amount" amount={amount} setAmount={setAmount} price={sub.price} keepAsPrice={keepAsPrice} setKeepAsPrice={setKeepAsPrice} /></div>
        {existing && (
          <p className="flex items-start gap-2 rounded-xl border border-amber-400/30 bg-amber-400/10 p-3.5 text-sm text-amber-100">
            <AlertTriangle className="mt-0.5 h-4 w-4 flex-shrink-0 text-amber-300" />
            {capitalize(monthLong(month))} est déjà facturé ({fcfa(existing.amount)}, {INVOICE_STATE[existing.status].label.toLowerCase()}). Annulez cette facture dans l’historique pour en refaire une.
          </p>
        )}
        {error && <p className="flex items-center gap-2 text-sm text-red-400"><AlertCircle className="h-4 w-4" /> {error}</p>}
        <button type="submit" disabled={busy || !value || !month || !!existing} className={cn(btnPrimary, 'w-full py-3')}>
          <FileText className="h-4 w-4" /> {busy ? 'Création…' : `Facturer ${month ? monthLong(month) : ''}`}
        </button>
      </form>
    </Modal>
  );
}

function RechargeModal({ sub, onClose, onSubmit }) {
  const [amount, setAmount] = useState(String(sub.price));
  const [keepAsPrice, setKeepAsPrice] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const value = parseAmount(amount);

  const submit = async (e) => {
    e.preventDefault();
    if (!value) return;
    setBusy(true);
    setError('');
    const err = await onSubmit({ amount: value, keepAsPrice: keepAsPrice && value !== sub.price });
    if (err) { setError(err.message || 'Le solde n’a pas été rechargé.'); setBusy(false); return; }
    onClose();
  };

  return (
    <Modal title="Recharger le solde" subtitle={sub.clientName} onClose={onClose} busy={busy}>
      <form onSubmit={submit} className="space-y-5">
        <div><AmountField id="rec-amount" amount={amount} setAmount={setAmount} price={sub.price} keepAsPrice={keepAsPrice} setKeepAsPrice={setKeepAsPrice} /></div>
        <p className="rounded-xl border border-white/[0.06] bg-white/[0.03] p-3.5 text-sm text-neutral-300">
          Le solde passe de <strong className="tabular-nums text-white">{fcfa(sub.balance)}</strong> à <strong className="tabular-nums text-white">{fcfa((sub.balance || 0) + value)}</strong>.
          {sub.status !== 'actif' && ' L’abonnement redevient actif.'}
        </p>
        {error && <p className="flex items-center gap-2 text-sm text-red-400"><AlertCircle className="h-4 w-4" /> {error}</p>}
        <button type="submit" disabled={busy || !value} className={cn(btnPrimary, 'w-full py-3')}>
          <BatteryCharging className="h-4 w-4" /> {busy ? 'Recharge…' : `Recharger ${value ? fcfa(value) : ''}`}
        </button>
      </form>
    </Modal>
  );
}

function AddSubscriberModal({ onClose, onSubmit }) {
  const [client, setClient] = useState({ name: '', phone: '', email: '', address: '' });
  const [price, setPrice] = useState('15000');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const submit = async (e) => {
    e.preventDefault();
    if (!client.name || !client.phone || !parseAmount(price)) return;
    setBusy(true);
    setError('');
    try {
      const err = await onSubmit(client, parseAmount(price));
      if (err) { setError(`La création a échoué : ${err.message}`); setBusy(false); return; }
      onClose();
    } catch {
      setError('La création a échoué. Ce numéro a peut-être déjà un abonnement.');
      setBusy(false);
    }
  };

  const field = (key, label, props = {}) => (
    <div>
      <label htmlFor={`add-${key}`} className="mb-1.5 block text-sm font-medium text-neutral-300">{label}</label>
      <input id={`add-${key}`} value={client[key]} onChange={(e) => setClient({ ...client, [key]: e.target.value })} className={inputCls} {...props} />
    </div>
  );

  return (
    <Modal title="Nouvel abonné" subtitle="Son solde démarre au prix du premier mois." onClose={onClose} busy={busy}>
      <form onSubmit={submit} className="space-y-4">
        {field('name', 'Prénom et nom', { placeholder: 'Moussa Diop', required: true, autoComplete: 'off' })}
        {field('phone', 'Téléphone', { placeholder: '77 000 00 00', required: true, inputMode: 'tel', autoComplete: 'off' })}
        {field('email', 'E-mail (facultatif)', { type: 'email', placeholder: 'moussa@exemple.com', autoComplete: 'off' })}
        {field('address', 'Adresse (facultatif)', { placeholder: 'Dakar, Point E', autoComplete: 'off' })}
        <div>
          <label htmlFor="add-price" className="mb-1.5 block text-sm font-medium text-neutral-300">Prix mensuel (FCFA)</label>
          <input id="add-price" type="text" inputMode="numeric" value={price} onChange={(e) => setPrice(e.target.value)} className={cn(inputCls, 'font-display text-xl tabular-nums')} required />
        </div>
        {error && <p className="flex items-center gap-2 text-sm text-red-400"><AlertCircle className="h-4 w-4" /> {error}</p>}
        <button type="submit" disabled={busy || !client.name || !client.phone || !parseAmount(price)} className={cn(btnPrimary, 'w-full py-3')}>
          <UserPlus className="h-4 w-4" /> {busy ? 'Création…' : 'Activer l’abonnement'}
        </button>
      </form>
    </Modal>
  );
}

// ─── Fiche d'un abonné ───────────────────────────────────────────────────
function SubscriberSheet({ sub, invoices, currentKey, stationName, onBack, onInvoice, onRecharge, onSavePrice, onToggleStatus, onDelete, onMarkPaid, onCancelInvoice }) {
  const [year, setYear] = useState(() => Number(currentKey.slice(0, 4)));
  const [editingPrice, setEditingPrice] = useState(false);
  const [priceDraft, setPriceDraft] = useState(String(sub.price));
  const [savingPrice, setSavingPrice] = useState(false);
  const startDate = new Date(sub.startedAt || sub.createdAt || Date.now());
  const startKey = monthKeyOf(startDate);
  const startYear = startDate.getFullYear();
  const currentYear = Number(currentKey.slice(0, 4));
  const current = liveInvoice(invoices, currentKey);
  const balance = sub.balance || 0;
  const ratio = sub.price > 0 ? Math.max(0, Math.min(1, balance / sub.price)) : 0;
  const suspended = sub.status !== 'actif';
  const reminder = (inv) => whatsappLink(sub.clientPhone, `Bonjour ${sub.clientName}, votre abonnement ${stationName ? `chez ${stationName} ` : ''}de ${monthLong(inv.billingMonth)} (${fcfa(inv.amount)}) est à régler. Merci.`);

  const savePrice = async () => {
    const value = parseAmount(priceDraft);
    if (!value || value === sub.price) { setEditingPrice(false); setPriceDraft(String(sub.price)); return; }
    setSavingPrice(true);
    await onSavePrice(value);
    setSavingPrice(false);
    setEditingPrice(false);
  };

  return (
    <div className="space-y-6">
      {onBack && (
        <button type="button" onClick={onBack} className={cn('-ml-1 inline-flex items-center gap-1 rounded-lg px-1 py-1 text-sm text-neutral-400 hover:text-white', focusRing)}>
          <ChevronLeft className="h-4 w-4" /> Abonnés
        </button>
      )}

      <div className="flex items-start gap-4">
        <div className={cn('flex h-12 w-12 flex-shrink-0 items-center justify-center rounded-xl font-display text-lg font-bold', suspended ? 'bg-red-500/10 text-red-300' : 'bg-emerald-400/15 text-emerald-200')}>
          {initials(sub.clientName)}
        </div>
        <div className="min-w-0 flex-1">
          <h2 className="font-display text-2xl font-bold leading-tight text-white">{sub.clientName}</h2>
          <a href={`tel:${sub.clientPhone}`} className="mt-1 inline-flex items-center gap-1.5 text-sm text-neutral-400 hover:text-white"><Phone className="h-3.5 w-3.5" />{sub.clientPhone}</a>
          {(sub.clientEmail || sub.clientAddress) && (
            <p className="mt-0.5 truncate text-sm text-neutral-500">{[sub.clientEmail, sub.clientAddress].filter(Boolean).join(', ')}</p>
          )}
        </div>
        <p className={cn('flex items-center gap-1.5 text-sm font-medium', suspended ? 'text-red-300' : 'text-emerald-300')}>
          <span className={cn('h-2 w-2 rounded-full', suspended ? 'bg-red-400' : 'bg-emerald-400')} />
          {suspended ? 'Suspendu' : 'Actif'}
        </p>
      </div>

      <div className="grid gap-px overflow-hidden rounded-2xl border border-white/[0.08] bg-white/[0.06] sm:grid-cols-2">
        <div className="bg-neutral-950/80 p-5">
          <p className="text-sm text-neutral-400">Solde restant</p>
          <p className={cn('mt-1 font-display text-3xl font-bold tabular-nums', balance <= 0 ? 'text-red-300' : 'text-white')}>{fcfa(balance)}</p>
          <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-white/10">
            <div className={cn('h-full rounded-full transition-[width] duration-500', balance <= 0 ? 'bg-red-400' : ratio < 0.25 ? 'bg-amber-400' : 'bg-emerald-400')} style={{ width: `${ratio * 100}%` }} />
          </div>
          <p className="mt-2 text-xs text-neutral-500">
            {balance <= 0 ? 'Solde épuisé : rechargez pour que les lavages soient de nouveau débités.' : `${Math.round(ratio * 100)} % du forfait mensuel, débité à chaque lavage.`}
          </p>
        </div>
        <div className="bg-neutral-950/80 p-5">
          <p className="text-sm text-neutral-400">Prix mensuel</p>
          {editingPrice ? (
            <div className="mt-1.5">
              <input
                type="text" inputMode="numeric" autoFocus value={priceDraft}
                onChange={(e) => setPriceDraft(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') savePrice(); if (e.key === 'Escape') { setEditingPrice(false); setPriceDraft(String(sub.price)); } }}
                aria-label="Nouveau prix mensuel en FCFA"
                className={cn(inputCls, 'font-display text-xl tabular-nums')}
              />
              <div className="mt-2 flex gap-2">
                <button type="button" onClick={savePrice} disabled={savingPrice} className={cn(btnPrimary, 'px-3 py-1.5')}>{savingPrice ? 'Enregistrement…' : 'Enregistrer'}</button>
                <button type="button" onClick={() => { setEditingPrice(false); setPriceDraft(String(sub.price)); }} className={cn(btnSecondary, 'px-3 py-1.5')}>Annuler</button>
              </div>
            </div>
          ) : (
            <>
              <p className="mt-1 font-display text-3xl font-bold tabular-nums text-white">{fcfa(sub.price)}</p>
              <button type="button" onClick={() => { setPriceDraft(String(sub.price)); setEditingPrice(true); }} className={cn('mt-3 inline-flex items-center gap-1.5 rounded-lg text-sm text-neutral-400 hover:text-white', focusRing)}>
                <Pencil className="h-3.5 w-3.5" /> Changer le prix
              </button>
              <p className="mt-1 text-xs text-neutral-500">Abonné depuis {startDate.toLocaleDateString('fr-FR', { month: 'long', year: 'numeric' })}.</p>
            </>
          )}
        </div>
      </div>

      <div className="flex flex-wrap gap-2 [&>*]:min-w-[10rem] [&>*]:flex-1 sm:[&>*]:flex-none">
        {current ? (
          current.status === 'a_payer' ? (
            <button type="button" onClick={() => onMarkPaid(current)} className={btnPrimary}><Check className="h-4 w-4" /> Encaisser {monthName(currentKey)} ({fcfa(current.amount)})</button>
          ) : (
            <p className="inline-flex items-center gap-2 rounded-xl border border-emerald-400/30 bg-emerald-400/10 px-4 py-2.5 text-sm font-medium text-emerald-200"><Check className="h-4 w-4" /> {capitalize(monthName(currentKey))} payé</p>
          )
        ) : (
          <button type="button" onClick={() => onInvoice(currentKey)} className={btnPrimary}><FileText className="h-4 w-4" /> Facturer {monthName(currentKey)}</button>
        )}
        <button type="button" onClick={onRecharge} className={btnSecondary}><BatteryCharging className="h-4 w-4" /> Recharger le solde</button>
        {current?.status === 'a_payer' && reminder(current) && (
          <a href={reminder(current)} target="_blank" rel="noopener noreferrer" className={btnSecondary}><MessageCircle className="h-4 w-4" /> Relancer</a>
        )}
      </div>

      <section aria-labelledby="carnet-title">
        <div className="mb-3 flex items-center justify-between">
          <h3 id="carnet-title" className="font-display text-lg font-semibold text-white">Carnet {year}</h3>
          <div className="flex items-center gap-1">
            <button type="button" onClick={() => setYear((y) => y - 1)} disabled={year <= startYear} aria-label="Année précédente" className={cn('rounded-lg p-1.5 text-neutral-400 hover:bg-white/[0.06] hover:text-white disabled:opacity-30', focusRing)}><ChevronLeft className="h-4 w-4" /></button>
            <button type="button" onClick={() => setYear((y) => y + 1)} disabled={year >= currentYear} aria-label="Année suivante" className={cn('rounded-lg p-1.5 text-neutral-400 hover:bg-white/[0.06] hover:text-white disabled:opacity-30', focusRing)}><ChevronRight className="h-4 w-4" /></button>
          </div>
        </div>
        <Carnet invoices={invoices} year={year} startKey={startKey} currentKey={currentKey} onPickMonth={onInvoice} />
        <p className="mt-2.5 flex flex-wrap gap-x-4 gap-y-1 text-xs text-neutral-500">
          <span className="inline-flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-[3px] border border-emerald-400/50 bg-emerald-400/20" /> Payé</span>
          <span className="inline-flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-[3px] border border-amber-400/60 bg-amber-400/10" /> À payer</span>
          <span className="inline-flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-[3px] border border-dashed border-white/25" /> Pas facturé (toucher la case pour facturer)</span>
        </p>
      </section>

      <section aria-labelledby="historique-title">
        <h3 id="historique-title" className="mb-2 font-display text-lg font-semibold text-white">Factures</h3>
        {invoices.length === 0 ? (
          <p className="rounded-xl border border-dashed border-white/10 p-5 text-sm text-neutral-500">Aucune facture pour cet abonné. Facturez le mois en cours ou touchez un mois du carnet.</p>
        ) : (
          <ul className="divide-y divide-white/[0.06] rounded-xl border border-white/[0.08]">
            {invoices.map((inv) => {
              const st = INVOICE_STATE[inv.status] || INVOICE_STATE.a_payer;
              const duplicate = inv.status !== 'annule' && invoices.some((o) => o.id !== inv.id && o.billingMonth === inv.billingMonth && o.status !== 'annule');
              const link = inv.status === 'a_payer' ? reminder(inv) : null;
              return (
                <li key={inv.id} className={cn('grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-4 gap-y-2 px-4 py-3 sm:grid-cols-[minmax(0,1fr)_auto_9.5rem]', inv.status === 'annule' && 'opacity-60')}>
                  <div className="min-w-0">
                    <p className={cn('font-medium capitalize text-white', inv.status === 'annule' && 'line-through')}>{monthLong(inv.billingMonth)}</p>
                    <p className={cn('mt-0.5 flex flex-wrap items-center gap-x-1.5 text-xs', st.text)}>
                      <span className={cn('h-1.5 w-1.5 rounded-full', st.dot)} />{st.label}
                      {inv.paidAt && inv.status === 'paye' && <span className="text-neutral-500">le {new Date(inv.paidAt).toLocaleDateString('fr-FR')}</span>}
                    </p>
                    {duplicate && <p className="mt-0.5 text-xs font-semibold text-amber-300">En double : annulez celle en trop</p>}
                  </div>
                  <p className={cn('self-start text-right font-display font-semibold tabular-nums text-white sm:self-center', inv.status === 'annule' && 'line-through')}>{fcfa(inv.amount)}</p>
                  <div className="col-span-2 flex items-center justify-end gap-1 sm:col-span-1">
                    {link && <a href={link} target="_blank" rel="noopener noreferrer" title="Relancer sur WhatsApp" aria-label={`Relancer ${sub.clientName} sur WhatsApp`} className={cn('rounded-lg p-2 text-neutral-400 hover:bg-white/[0.06] hover:text-emerald-300', focusRing)}><MessageCircle className="h-4 w-4" /></a>}
                    {inv.status === 'a_payer' && <button type="button" onClick={() => onMarkPaid(inv)} className={cn('rounded-lg px-2.5 py-1.5 text-sm font-semibold text-emerald-300 hover:bg-emerald-400/10', focusRing)}>Encaisser</button>}
                    {inv.status !== 'annule' && <button type="button" onClick={() => onCancelInvoice(inv)} title="Annuler la facture" aria-label={`Annuler la facture de ${monthLong(inv.billingMonth)}`} className={cn('rounded-lg p-2 text-neutral-500 hover:bg-white/[0.06] hover:text-red-300', focusRing)}><X className="h-4 w-4" /></button>}
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      <div className="flex flex-wrap gap-x-5 gap-y-2 border-t border-white/[0.06] pt-4 text-sm">
        <button type="button" onClick={onToggleStatus} className={cn('inline-flex items-center gap-1.5 rounded-lg text-neutral-400 hover:text-white', focusRing)}>
          {suspended ? <><PlayCircle className="h-4 w-4" /> Réactiver l’abonnement</> : <><PauseCircle className="h-4 w-4" /> Suspendre l’abonnement</>}
        </button>
        <button type="button" onClick={onDelete} className={cn('inline-flex items-center gap-1.5 rounded-lg text-neutral-500 hover:text-red-300', focusRing)}>
          <Trash2 className="h-4 w-4" /> Supprimer l’abonné
        </button>
      </div>
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────
const FILTERS = [
  { key: 'tous', label: 'Tous' },
  { key: 'a_encaisser', label: 'À encaisser' },
  { key: 'a_facturer', label: 'À facturer' },
  { key: 'suspendus', label: 'Suspendus' },
];

export default function Subscriptions() {
  useDocumentTitle('Abonnements');
  const {
    clientSubscriptions, clientSubscriptionInvoices, stationProfile,
    addClientSubscription, deleteClientSubscription, updateSubscriptionStatus, generateSubscriptionInvoice,
    markSubscriptionInvoicePaid, rechargeSubscription, cancelSubscriptionInvoice, updateSubscriptionPrice,
  } = useAppState();
  const isDesktop = useMediaQuery('(min-width: 1024px)');

  const [tab, setTab] = useState('abonnes');
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState('tous');
  const [ledgerFilter, setLedgerFilter] = useState('toutes');
  const [selectedId, setSelectedId] = useState(null);
  const [showAdd, setShowAdd] = useState(false);
  const [invoiceFor, setInvoiceFor] = useState(null); // { sub, month }
  const [rechargeFor, setRechargeFor] = useState(null);

  const currentKey = monthKeyOf(new Date());
  const subs = clientSubscriptions || [];
  const allInvoices = clientSubscriptionInvoices || [];

  // Factures par abonné, du mois le plus récent au plus ancien.
  const invoicesBySub = useMemo(() => {
    const map = new Map();
    allInvoices.forEach((inv) => {
      if (!map.has(inv.subscriptionId)) map.set(inv.subscriptionId, []);
      map.get(inv.subscriptionId).push(inv);
    });
    map.forEach((list) => list.sort((a, b) => (b.billingMonth || '').localeCompare(a.billingMonth || '') || new Date(b.createdAt) - new Date(a.createdAt)));
    return map;
  }, [allInvoices]);
  const invoicesOf = (sub) => invoicesBySub.get(sub.id) || [];

  // État du mois en cours, par abonné : 'paye' | 'a_payer' | null (pas facturé).
  const monthStateOf = (sub) => liveInvoice(invoicesOf(sub), currentKey)?.status || null;

  const activeSubs = subs.filter((s) => s.status === 'actif');
  const expected = activeSubs.reduce((sum, s) => sum + (liveInvoice(invoicesOf(s), currentKey)?.amount ?? s.price), 0);
  const collected = allInvoices.filter((i) => i.billingMonth === currentKey && i.status === 'paye').reduce((sum, i) => sum + (i.amount || 0), 0);
  const unpaid = allInvoices.filter((i) => i.status === 'a_payer');
  const unpaidTotal = unpaid.reduce((sum, i) => sum + (i.amount || 0), 0);
  const paidCount = activeSubs.filter((s) => monthStateOf(s) === 'paye').length;
  const billedCount = activeSubs.filter((s) => monthStateOf(s) === 'a_payer').length;
  const toBillCount = activeSubs.filter((s) => !monthStateOf(s)).length;

  const q = search.trim().toLowerCase();
  const matchesSearch = (name, phone) => !q || (name || '').toLowerCase().includes(q) || (phone || '').toLowerCase().includes(q);
  const inFilter = (s, key) => {
    if (key === 'a_encaisser') return invoicesOf(s).some((i) => i.status === 'a_payer');
    if (key === 'a_facturer') return s.status === 'actif' && !monthStateOf(s);
    if (key === 'suspendus') return s.status !== 'actif';
    return true;
  };
  const filteredSubs = subs.filter((s) => matchesSearch(s.clientName, s.clientPhone) && inFilter(s, filter));

  // Grand écran : une fiche est toujours ouverte (la première de la liste par
  // défaut). Téléphone : la fiche s'ouvre en plein écran au toucher.
  const selected = subs.find((s) => s.id === selectedId) || (isDesktop ? filteredSubs[0] : null) || null;

  // Journal des factures, regroupé par mois facturé.
  const ledgerInvoices = allInvoices.filter((i) => {
    if (!matchesSearch(i.clientName, i.clientPhone)) return false;
    if (ledgerFilter === 'a_payer') return i.status === 'a_payer';
    if (ledgerFilter === 'payees') return i.status === 'paye';
    return true;
  });
  const ledgerMonths = useMemo(() => {
    const groups = new Map();
    ledgerInvoices.forEach((inv) => {
      const key = inv.billingMonth || 'inconnu';
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key).push(inv);
    });
    return [...groups.entries()].sort((a, b) => b[0].localeCompare(a[0]));
  }, [ledgerInvoices]);
  const isDuplicate = (inv) => inv.status !== 'annule' && allInvoices.some((o) => o.id !== inv.id && o.subscriptionId === inv.subscriptionId && o.billingMonth === inv.billingMonth && o.status !== 'annule');
  // Factures en trop = factures en double moins une par (abonné, mois).
  const duplicateExtra = (() => {
    const dups = allInvoices.filter(isDuplicate);
    return dups.length - new Set(dups.map((i) => `${i.subscriptionId}|${i.billingMonth}`)).size;
  })();

  // ─── Actions ──
  const createInvoice = async (sub, { month, amount, keepAsPrice }) => {
    const err = await generateSubscriptionInvoice(sub, month, amount);
    if (!err && keepAsPrice) await updateSubscriptionPrice(sub.id, amount);
    return err;
  };
  const recharge = async (sub, { amount, keepAsPrice }) => {
    const err = await rechargeSubscription(sub.id, amount);
    if (!err && keepAsPrice) await updateSubscriptionPrice(sub.id, amount);
    return err;
  };
  const cancelInvoice = (inv) => {
    if (window.confirm(`Annuler la facture de ${monthLong(inv.billingMonth)} (${fcfa(inv.amount)}) de ${inv.clientName} ? Elle ne comptera plus dans la comptabilité.`)) cancelSubscriptionInvoice(inv.id);
  };
  const deleteSub = (sub) => {
    if (window.confirm(`Supprimer définitivement l’abonnement de ${sub.clientName} et ses factures ?`)) {
      deleteClientSubscription(sub.id);
      setSelectedId(null);
    }
  };
  const reminderLink = (inv) => whatsappLink(inv.clientPhone, `Bonjour ${inv.clientName}, votre abonnement ${stationProfile?.name ? `chez ${stationProfile.name} ` : ''}de ${monthLong(inv.billingMonth)} (${fcfa(inv.amount)}) est à régler. Merci.`);

  const segmentTone = (state) => (state === 'paye' ? 'bg-emerald-400' : state === 'a_payer' ? 'bg-amber-400' : 'bg-white/[0.15]');
  const chip = (active) => cn('rounded-lg border px-3 py-1.5 text-xs font-semibold transition-colors', active ? 'border-emerald-400/40 bg-emerald-400/10 text-emerald-200' : 'border-white/[0.08] text-neutral-400 hover:text-white', focusRing);

  return (
    <div className="mx-auto max-w-7xl p-4 sm:p-6 lg:p-8">
      <header className="mb-6 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="font-display text-3xl font-bold tracking-tight text-white sm:text-4xl">Abonnements</h1>
          <p className="mt-1.5 max-w-xl text-neutral-400">Les forfaits mensuels de vos clients : qui a payé ce mois-ci, qui reste à encaisser.</p>
        </div>
        <button type="button" onClick={() => setShowAdd(true)} className={btnPrimary}><UserPlus className="h-4 w-4" /> Nouvel abonné</button>
      </header>

      {/* ── Le mois en cours ── */}
      <section aria-labelledby="mois-title" className="mb-8 rounded-2xl border border-white/[0.08] bg-neutral-900/50 p-5 sm:p-6">
        <div className="flex flex-wrap items-baseline justify-between gap-x-6 gap-y-1">
          <h2 id="mois-title" className="font-display text-xl font-semibold capitalize text-white">{monthLong(currentKey)}</h2>
          <p className="text-neutral-400">
            <span className="font-display text-2xl font-bold tabular-nums text-white">{fcfa(collected)}</span>
            <span className="ml-2">encaissés sur {fcfa(expected)} attendus</span>
          </p>
        </div>
        {activeSubs.length > 0 ? (
          <div className="mt-4 flex h-3 gap-1" role="img" aria-label={`${paidCount} payés, ${billedCount} à encaisser, ${toBillCount} à facturer`}>
            {activeSubs.map((s) => (
              <button
                key={s.id}
                type="button"
                onClick={() => { setTab('abonnes'); setSelectedId(s.id); }}
                title={`${s.clientName} : ${monthStateOf(s) === 'paye' ? 'payé' : monthStateOf(s) === 'a_payer' ? 'à encaisser' : 'à facturer'}`}
                aria-label={`Ouvrir la fiche de ${s.clientName}`}
                className={cn('h-full min-w-[6px] rounded-[3px] transition-opacity hover:opacity-80', segmentTone(monthStateOf(s)), focusRing)}
                style={{ flexGrow: Math.max(1, s.price), flexBasis: 0 }}
              />
            ))}
          </div>
        ) : (
          <div className="mt-4 h-3 rounded-[3px] bg-white/[0.06]" />
        )}
        <dl className="mt-4 grid grid-cols-1 gap-3 text-sm sm:grid-cols-3">
          <div className="flex items-center gap-2.5"><span className="h-2.5 w-2.5 rounded-[3px] bg-emerald-400" /><dt className="text-neutral-400">Payés ce mois</dt><dd className="ml-auto font-semibold tabular-nums text-white sm:ml-0">{paidCount}</dd></div>
          <div className="flex items-center gap-2.5"><span className="h-2.5 w-2.5 rounded-[3px] bg-amber-400" /><dt className="text-neutral-400">Factures impayées</dt><dd className="ml-auto font-semibold tabular-nums text-white sm:ml-0">{unpaid.length}{unpaid.length > 0 && <span className="ml-1 font-normal text-neutral-500">({fcfa(unpaidTotal)})</span>}</dd></div>
          <div className="flex items-center gap-2.5"><span className="h-2.5 w-2.5 rounded-[3px] bg-white/[0.15]" /><dt className="text-neutral-400">Pas encore facturés ce mois</dt><dd className="ml-auto font-semibold tabular-nums text-white sm:ml-0">{toBillCount}</dd></div>
        </dl>
        {duplicateExtra > 0 && (
          <p className="mt-4 flex items-start gap-2 rounded-xl border border-amber-400/30 bg-amber-400/10 p-3.5 text-sm text-amber-100">
            <AlertTriangle className="mt-0.5 h-4 w-4 flex-shrink-0 text-amber-300" />
            {duplicateExtra === 1 ? '1 facture en trop' : `${duplicateExtra} factures en trop`} : un même mois a été facturé plusieurs fois au même abonné, ce qui fausse la comptabilité. Ouvrez « Factures » et annulez celles marquées « En double » qui sont de trop.
          </p>
        )}
      </section>

      {/* ── Onglets + recherche ── */}
      <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div role="tablist" aria-label="Affichage" className="inline-flex w-fit rounded-xl border border-white/[0.08] bg-neutral-900/60 p-1">
          {[['abonnes', 'Abonnés', subs.length], ['factures', 'Factures', allInvoices.length]].map(([key, label, count]) => (
            <button
              key={key} type="button" role="tab" aria-selected={tab === key} onClick={() => setTab(key)}
              className={cn('rounded-lg px-4 py-2 text-sm font-semibold transition-colors', tab === key ? 'bg-white/[0.1] text-white' : 'text-neutral-400 hover:text-white', focusRing)}
            >
              {label} <span className="ml-1 tabular-nums text-neutral-500">{count}</span>
            </button>
          ))}
        </div>
        <div className="relative w-full sm:w-72">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-neutral-500" />
          <input type="search" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Nom ou téléphone" aria-label="Rechercher un abonné" className={cn(inputCls, 'py-2 pl-9')} />
        </div>
      </div>

      {tab === 'abonnes' ? (
        subs.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-white/10 p-10 text-center">
            <p className="font-display text-xl font-semibold text-white">Aucun abonné pour l’instant</p>
            <p className="mx-auto mt-2 max-w-md text-neutral-400">Un abonné paie un forfait chaque mois ; ses lavages sont débités de son solde. Ajoutez votre premier client fidèle.</p>
            <button type="button" onClick={() => setShowAdd(true)} className={cn(btnPrimary, 'mt-5')}><UserPlus className="h-4 w-4" /> Nouvel abonné</button>
          </div>
        ) : (
          <div className="grid gap-6 lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)]">
            {/* Liste */}
            <div>
              <div className="mb-3 flex flex-wrap gap-1.5" aria-label="Filtrer les abonnés">
                {FILTERS.map((f) => (
                  <button key={f.key} type="button" onClick={() => setFilter(f.key)} aria-pressed={filter === f.key} className={chip(filter === f.key)}>
                    {f.label} <span className="tabular-nums opacity-60">{subs.filter((s) => inFilter(s, f.key)).length}</span>
                  </button>
                ))}
              </div>
              {filteredSubs.length === 0 ? (
                <p className="rounded-xl border border-dashed border-white/10 p-6 text-center text-sm text-neutral-500">Aucun abonné ne correspond. Changez de filtre ou de recherche.</p>
              ) : (
                <ul className="space-y-1.5">
                  {filteredSubs.map((s) => {
                    const state = monthStateOf(s);
                    const suspended = s.status !== 'actif';
                    const isSel = selected?.id === s.id;
                    const startKey = monthKeyOf(new Date(s.startedAt || s.createdAt || Date.now()));
                    return (
                      <li key={s.id}>
                        <button
                          type="button" onClick={() => setSelectedId(s.id)} aria-current={isSel ? 'true' : undefined}
                          className={cn('flex w-full gap-3 rounded-xl border p-3.5 text-left transition-colors', isSel ? 'border-emerald-400/30 bg-white/[0.06]' : 'border-transparent hover:bg-white/[0.03]', focusRing)}
                        >
                          <span className={cn('flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-lg font-display text-sm font-bold', suspended ? 'bg-red-500/10 text-red-300' : 'bg-emerald-400/10 text-emerald-200')}>{initials(s.clientName)}</span>
                          <span className="min-w-0 flex-1">
                            <span className="flex items-baseline justify-between gap-3">
                              <span className="truncate font-semibold text-white">{s.clientName}</span>
                              <span className="flex-shrink-0 text-sm tabular-nums text-neutral-300">{fcfa(s.price)}</span>
                            </span>
                            <span className="mt-0.5 flex items-baseline justify-between gap-3 text-xs">
                              <span className="truncate text-neutral-500">{s.clientPhone}</span>
                              <span className={cn('flex-shrink-0 font-medium', suspended ? 'text-red-300' : state === 'paye' ? 'text-emerald-300' : state === 'a_payer' ? 'text-amber-300' : 'text-neutral-400')}>
                                {suspended ? 'Suspendu' : state === 'paye' ? `${capitalize(monthName(currentKey))} payé` : state === 'a_payer' ? 'À encaisser' : 'À facturer'}
                              </span>
                            </span>
                            <span className="mt-2.5 block"><Carnet invoices={invoicesOf(s)} year={Number(currentKey.slice(0, 4))} startKey={startKey} currentKey={currentKey} compact /></span>
                          </span>
                        </button>
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>

            {/* Fiche : colonne sur grand écran, plein écran sur téléphone */}
            {selected && (
              <div className={isDesktop ? 'sticky top-24 self-start rounded-2xl border border-white/[0.08] bg-neutral-900/50 p-5 sm:p-6' : 'fixed inset-x-0 bottom-0 top-16 z-40 overflow-y-auto overscroll-contain bg-neutral-950 px-4 pb-10 pt-4'}>
                <SubscriberSheet
                  key={selected.id}
                  sub={selected}
                  invoices={invoicesOf(selected)}
                  currentKey={currentKey}
                  stationName={stationProfile?.name}
                  onBack={isDesktop ? null : () => setSelectedId(null)}
                  onInvoice={(month) => setInvoiceFor({ sub: selected, month })}
                  onRecharge={() => setRechargeFor(selected)}
                  onSavePrice={(price) => updateSubscriptionPrice(selected.id, price)}
                  onToggleStatus={() => updateSubscriptionStatus(selected.id, selected.status === 'actif' ? 'suspendu' : 'actif')}
                  onDelete={() => deleteSub(selected)}
                  onMarkPaid={(inv) => markSubscriptionInvoicePaid(inv.id)}
                  onCancelInvoice={cancelInvoice}
                />
              </div>
            )}
          </div>
        )
      ) : (
        /* ── Journal des factures ── */
        <div>
          <div className="mb-4 flex flex-wrap gap-1.5" aria-label="Filtrer les factures">
            {[['toutes', 'Toutes'], ['a_payer', 'À encaisser'], ['payees', 'Payées']].map(([key, label]) => (
              <button key={key} type="button" onClick={() => setLedgerFilter(key)} aria-pressed={ledgerFilter === key} className={chip(ledgerFilter === key)}>{label}</button>
            ))}
          </div>
          {ledgerMonths.length === 0 ? (
            <p className="rounded-2xl border border-dashed border-white/10 p-10 text-center text-neutral-500">Aucune facture. Ouvrez la fiche d’un abonné pour facturer un mois.</p>
          ) : (
            <div className="space-y-8">
              {ledgerMonths.map(([month, list]) => {
                const live = list.filter((i) => i.status !== 'annule');
                const paid = live.filter((i) => i.status === 'paye').reduce((s, i) => s + (i.amount || 0), 0);
                const total = live.reduce((s, i) => s + (i.amount || 0), 0);
                return (
                  <section key={month} aria-label={month === 'inconnu' ? 'Mois inconnu' : monthLong(month)}>
                    <div className="mb-1 flex flex-wrap items-baseline justify-between gap-x-4 border-b border-white/[0.08] pb-2">
                      <h3 className="font-display text-lg font-semibold capitalize text-white">{month === 'inconnu' ? 'Mois inconnu' : monthLong(month)}</h3>
                      <p className="text-sm text-neutral-400"><span className="font-semibold tabular-nums text-white">{fcfa(paid)}</span> encaissés sur {fcfa(total)}</p>
                    </div>
                    <ul className="divide-y divide-white/[0.05]">
                      {list.map((inv) => {
                        const st = INVOICE_STATE[inv.status] || INVOICE_STATE.a_payer;
                        const link = inv.status === 'a_payer' ? reminderLink(inv) : null;
                        const dup = isDuplicate(inv);
                        const owner = subs.find((x) => x.id === inv.subscriptionId);
                        return (
                          <li key={inv.id} className={cn('grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-4 gap-y-1 py-3 sm:grid-cols-[minmax(0,1fr)_9rem_7rem_11rem]', inv.status === 'annule' && 'opacity-60')}>
                            <button type="button" disabled={!owner} onClick={() => { if (owner) { setTab('abonnes'); setSelectedId(owner.id); } }} className={cn('min-w-0 rounded-lg text-left', focusRing)}>
                              <span className={cn('block truncate font-medium text-white', owner && 'hover:underline')}>{inv.clientName}</span>
                              <span className="block truncate text-xs text-neutral-500">{inv.clientPhone}{dup && <span className="ml-2 font-semibold text-amber-300">En double</span>}</span>
                            </button>
                            <p className={cn('text-right font-display font-semibold tabular-nums text-white', inv.status === 'annule' && 'line-through')}>{fcfa(inv.amount)}</p>
                            <p className={cn('flex items-center gap-1.5 text-sm', st.text)}><span className={cn('h-1.5 w-1.5 rounded-full', st.dot)} />{st.label}</p>
                            <div className="flex items-center justify-end gap-1">
                              {link && <a href={link} target="_blank" rel="noopener noreferrer" title="Relancer sur WhatsApp" aria-label={`Relancer ${inv.clientName} sur WhatsApp`} className={cn('rounded-lg p-2 text-neutral-400 hover:bg-white/[0.06] hover:text-emerald-300', focusRing)}><MessageCircle className="h-4 w-4" /></a>}
                              {inv.status === 'a_payer' && <button type="button" onClick={() => markSubscriptionInvoicePaid(inv.id)} className={cn('rounded-lg px-2.5 py-1.5 text-sm font-semibold text-emerald-300 hover:bg-emerald-400/10', focusRing)}>Encaisser</button>}
                              {inv.status !== 'annule' && <button type="button" onClick={() => cancelInvoice(inv)} title="Annuler la facture" aria-label={`Annuler la facture de ${inv.clientName}`} className={cn('rounded-lg p-2 text-neutral-500 hover:bg-white/[0.06] hover:text-red-300', focusRing)}><X className="h-4 w-4" /></button>}
                            </div>
                          </li>
                        );
                      })}
                    </ul>
                  </section>
                );
              })}
            </div>
          )}
        </div>
      )}

      {showAdd && <AddSubscriberModal onClose={() => setShowAdd(false)} onSubmit={addClientSubscription} />}
      {invoiceFor && (
        <InvoiceModal
          sub={invoiceFor.sub}
          invoices={invoicesOf(invoiceFor.sub)}
          initialMonth={invoiceFor.month}
          onClose={() => setInvoiceFor(null)}
          onSubmit={(data) => createInvoice(invoiceFor.sub, data)}
        />
      )}
      {rechargeFor && <RechargeModal sub={rechargeFor} onClose={() => setRechargeFor(null)} onSubmit={(data) => recharge(rechargeFor, data)} />}
    </div>
  );
}
