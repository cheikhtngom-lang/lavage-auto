import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Card, CardContent } from '../../components/ui/Card';
import { Badge } from '../../components/ui/Badge';
import { Calculator, TrendingUp, TrendingDown, DollarSign, CreditCard, Wallet, Calendar, ArrowRight, Sparkles, X, Receipt } from 'lucide-react';
import { useAppState } from '../../hooks/useAppState';
import { useDocumentTitle } from '../../lib/useDocumentTitle';

const EXPENSE_CATEGORIES = ['Savon', 'Eau', 'Électricité', 'Matériel', 'Autre'];

// Mêmes helpers de découpage temporel que Washers.jsx/dateBuckets.js (lundi =
// début de semaine), dupliqués localement par cohérence avec ces fichiers.
function startOfDay(d) { const x = new Date(d); x.setHours(0, 0, 0, 0); return x; }
function startOfWeek(d) {
  const x = startOfDay(d);
  const day = (x.getDay() + 6) % 7; // lundi = 0
  x.setDate(x.getDate() - day);
  return x;
}
function addDays(d, n) { const x = new Date(d); x.setDate(x.getDate() + n); return x; }

// `tx.createdAt` est l'horodatage réel (ISO) — voir le même commentaire dans
// Analytics.jsx. `tx.date` est un texte d'affichage, non filtrable.
function sumInRange(transactions, start, end) {
  return (transactions || []).reduce((sum, tx) => {
    const d = new Date(tx.createdAt);
    return d >= start && d < end ? sum + (parseInt(tx.amount) || 0) : sum;
  }, 0);
}

function statsInRange(transactions, start, end) {
  return (transactions || []).reduce((acc, tx) => {
    const d = new Date(tx.createdAt);
    if (d >= start && d < end) { acc.revenue += parseInt(tx.amount) || 0; acc.count += 1; }
    return acc;
  }, { revenue: 0, count: 0 });
}

function percentChange(current, previous) {
  if (previous === 0) return current > 0 ? 100 : 0;
  return Math.round(((current - previous) / previous) * 100);
}

// `invert` : pour une métrique où une hausse est un mauvais signe (les
// dépenses), affiche la couleur/l'icône inversées tout en gardant le vrai
// pourcentage — jamais un chiffre falsifié pour "faire joli".
function TrendBadge({ pct, invert = false }) {
  const isRise = pct >= 0; // vrai signe du chiffre affiché — jamais altéré
  const isGood = invert ? !isRise : isRise; // seulement la couleur dépend du sens "souhaitable"
  return (
    <Badge
      variant={isGood ? 'success' : 'warning'}
      className={isGood
        ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30'
        : 'bg-red-500/20 text-red-400 border border-red-500/30'}
    >
      {isRise ? '+' : ''}{pct}% {isRise ? <TrendingUp className="w-3 h-3 inline ml-1" /> : <TrendingDown className="w-3 h-3 inline ml-1" />}
    </Badge>
  );
}

export default function Accounting() {
  useDocumentTitle('Comptabilité');
  const { transactions, expenses, addExpense, stationProfile, clientSubscriptionInvoices } = useAppState();

  const [showExpenseModal, setShowExpenseModal] = useState(false);
  const [newExpense, setNewExpense] = useState({ label: '', amount: '', category: 'Savon' });

  const handleAddExpense = (e) => {
    e.preventDefault();
    if (!newExpense.label || !newExpense.amount) return;
    addExpense(newExpense);
    setShowExpenseModal(false);
    setNewExpense({ label: '', amount: '', category: 'Savon' });
  };

  const now = new Date();
  const todayStart = startOfDay(now);
  const yesterdayStart = addDays(todayStart, -1);
  const weekStart = startOfWeek(now);
  const lastWeekStart = addDays(weekStart, -7);
  // Point équivalent la semaine dernière (même heure, même jour écoulé) pour
  // comparer "semaine en cours" à une base juste, pas semaine pleine vs partielle.
  const lastWeekComparablePoint = new Date(lastWeekStart.getTime() + (now.getTime() - weekStart.getTime()));

  const todayRevenue = sumInRange(transactions, todayStart, addDays(todayStart, 1));
  const yesterdayRevenue = sumInRange(transactions, yesterdayStart, todayStart);
  const todayChangePct = percentChange(todayRevenue, yesterdayRevenue);

  const weekRevenue = sumInRange(transactions, weekStart, addDays(weekStart, 7));
  const lastWeekComparableRevenue = sumInRange(transactions, lastWeekStart, lastWeekComparablePoint);
  const weekChangePct = percentChange(weekRevenue, lastWeekComparableRevenue);

  const weekDays = Array.from({ length: 7 }).map((_, i) => {
    const dayStart = addDays(weekStart, i);
    return statsInRange(transactions, dayStart, addDays(dayStart, 1));
  });
  const maxDayRevenue = Math.max(1, ...weekDays.map((d) => d.revenue));

  const todayExpenses = sumInRange(expenses, todayStart, addDays(todayStart, 1));
  const yesterdayExpenses = sumInRange(expenses, yesterdayStart, todayStart);
  const expensesChangePct = percentChange(todayExpenses, yesterdayExpenses);
  const recentExpenses = (expenses || []).slice(0, 5);

  const totalSubRevenue = (clientSubscriptionInvoices || []).filter(inv => inv.status === 'paye').reduce((acc, curr) => acc + (parseInt(curr.amount) || 0), 0);
  // Configurable par l'admin dans Paramètres > Objectif de revenus (voir
  // Admin/Settings.jsx) — plus une valeur figée dans le code.
  const dailyTarget = stationProfile?.dailyRevenueTarget || 50000;
  const progress = Math.min((todayRevenue / dailyTarget) * 100, 100);

  return (
    <div className="p-8 max-w-7xl mx-auto relative z-10">
      <div className="flex flex-col md:flex-row md:items-center justify-between mb-8 gap-4">
        <div>
          <h1 className="text-4xl font-bold text-white mb-2 tracking-tight">Comptabilité & <span className="text-blue-400">Finances</span></h1>
          <p className="text-neutral-400 text-lg">Suivez vos revenus, dépenses et objectifs.</p>
        </div>
        <button
          onClick={() => setShowExpenseModal(true)}
          className="bg-blue-600 hover:bg-blue-500 text-white px-6 py-3 rounded-xl font-bold transition-all shadow-lg shadow-blue-500/20 flex items-center gap-2"
        >
          <Calculator className="w-5 h-5" />
          Ajouter une dépense
        </button>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-6 mb-8">
        <Card className="border-white/5 bg-gradient-to-br from-blue-900/20 to-black relative overflow-hidden group">
          <div className="absolute top-0 right-0 w-32 h-32 bg-blue-500/10 rounded-full blur-3xl group-hover:bg-blue-500/20 transition-colors"></div>
          <CardContent className="p-6 relative z-10">
            <div className="flex justify-between items-start mb-4">
              <div className="p-3 bg-blue-500/20 rounded-xl">
                <DollarSign className="w-6 h-6 text-blue-400" />
              </div>
              <TrendBadge pct={todayChangePct} />
            </div>
            <p className="text-neutral-400 text-sm font-medium mb-1">Revenus d'aujourd'hui</p>
            <h3 className="text-3xl font-bold text-white">{todayRevenue.toLocaleString('fr-FR')} FCFA</h3>
          </CardContent>
        </Card>

        <Card className="border-white/5 bg-gradient-to-br from-emerald-900/20 to-black relative overflow-hidden group">
          <div className="absolute top-0 right-0 w-32 h-32 bg-emerald-500/10 rounded-full blur-3xl group-hover:bg-emerald-500/20 transition-colors"></div>
          <CardContent className="p-6 relative z-10">
            <div className="flex justify-between items-start mb-4">
              <div className="p-3 bg-emerald-500/20 rounded-xl">
                <Wallet className="w-6 h-6 text-emerald-400" />
              </div>
              <TrendBadge pct={weekChangePct} />
            </div>
            <p className="text-neutral-400 text-sm font-medium mb-1">Revenus de la semaine</p>
            <h3 className="text-3xl font-bold text-white">{weekRevenue.toLocaleString('fr-FR')} FCFA</h3>
          </CardContent>
        </Card>

        <Card className="border-white/5 bg-gradient-to-br from-purple-900/20 to-black relative overflow-hidden group">
          <div className="absolute top-0 right-0 w-32 h-32 bg-purple-500/10 rounded-full blur-3xl group-hover:bg-purple-500/20 transition-colors"></div>
          <CardContent className="p-6 relative z-10">
            <div className="flex justify-between items-start mb-4">
              <div className="p-3 bg-purple-500/20 rounded-xl">
                <Sparkles className="w-6 h-6 text-purple-400" />
              </div>
            </div>
            <p className="text-neutral-400 text-sm font-medium mb-1">Recettes Abonnements</p>
            <h3 className="text-3xl font-bold text-white">{totalSubRevenue.toLocaleString('fr-FR')} FCFA</h3>
          </CardContent>
        </Card>

        <Card className="border-white/5 bg-gradient-to-br from-red-900/20 to-black relative overflow-hidden group">
          <div className="absolute top-0 right-0 w-32 h-32 bg-red-500/10 rounded-full blur-3xl group-hover:bg-red-500/20 transition-colors"></div>
          <CardContent className="p-6 relative z-10">
            <div className="flex justify-between items-start mb-4">
              <div className="p-3 bg-red-500/20 rounded-xl">
                <CreditCard className="w-6 h-6 text-red-400" />
              </div>
              <TrendBadge pct={expensesChangePct} invert />
            </div>
            <p className="text-neutral-400 text-sm font-medium mb-1">Dépenses du jour</p>
            <h3 className="text-3xl font-bold text-white">{todayExpenses.toLocaleString('fr-FR')} FCFA</h3>
          </CardContent>
        </Card>
      </div>

      {/* Charts & Goals */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <Card className="lg:col-span-2 border-white/5 bg-white/[0.02]">
          <CardContent className="p-6">
            <div className="flex justify-between items-center mb-6">
              <div>
                <h2 className="text-xl font-bold text-white">Évolution des Revenus</h2>
                <p className="text-sm text-neutral-400">7 derniers jours</p>
              </div>
              <div className="flex gap-2">
                <select className="bg-neutral-900 border border-white/10 rounded-lg px-3 py-1.5 text-sm text-white focus:outline-none">
                  <option>Cette Semaine</option>
                  <option>Ce Mois</option>
                </select>
              </div>
            </div>
            
            {/* SVG Line Chart */}
            <div className="h-64 mt-8 pb-4 border-b border-white/10 relative w-full">
              {/* Lignes horizontales pour donner l'effet de grille */}
              <div className="absolute w-full top-0 border-t border-white/5 border-dashed pointer-events-none"></div>
              <div className="absolute w-full top-1/4 border-t border-white/5 border-dashed pointer-events-none"></div>
              <div className="absolute w-full top-2/4 border-t border-white/5 border-dashed pointer-events-none"></div>
              <div className="absolute w-full top-3/4 border-t border-white/5 border-dashed pointer-events-none"></div>
              
              <svg viewBox="0 0 100 100" preserveAspectRatio="none" className="w-full h-full overflow-visible">
                <defs>
                  <linearGradient id="lineGradient" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="rgba(59,130,246,0.3)" />
                    <stop offset="100%" stopColor="rgba(59,130,246,0.0)" />
                  </linearGradient>
                  <filter id="glow" x="-20%" y="-20%" width="140%" height="140%">
                    <feGaussianBlur stdDeviation="2" result="blur" />
                    <feComposite in="SourceGraphic" in2="blur" operator="over" />
                  </filter>
                </defs>
                
                {/* Points calculés à partir des vraies transactions de la semaine
                    en cours (lundi→dimanche), mis à l'échelle du max de la semaine. */}
                {(() => {
                  const points = weekDays.map((d, i) => ({ x: (100 / 6) * i, y: 100 - (d.revenue / maxDayRevenue) * 90 }));
                  const line = points.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x} ${p.y}`).join(' ');
                  const area = `${line} L 100 100 L 0 100 Z`;
                  return (
                    <>
                      <motion.path
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        transition={{ duration: 1 }}
                        d={area}
                        fill="url(#lineGradient)"
                      />
                      <motion.path
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        transition={{ duration: 0.6 }}
                        d={line}
                        fill="none"
                        stroke="#3b82f6"
                        strokeWidth="3"
                        vectorEffect="non-scaling-stroke"
                        filter="url(#glow)"
                      />
                      {weekDays.map((d, i) => (
                        <motion.circle
                          key={i}
                          initial={{ opacity: 0, scale: 0 }}
                          animate={{ opacity: 1, scale: 1 }}
                          transition={{ duration: 0.4, delay: 0.2 + i * 0.05 }}
                          cx={points[i].x}
                          cy={points[i].y}
                          r="3"
                          fill="#0f172a"
                          stroke="#60a5fa"
                          strokeWidth="2"
                          vectorEffect="non-scaling-stroke"
                          className="cursor-pointer hover:fill-blue-500 transition-colors"
                        >
                          <title>{d.revenue.toLocaleString('fr-FR')} FCFA · {d.count} lavage{d.count > 1 ? 's' : ''}</title>
                        </motion.circle>
                      ))}
                    </>
                  );
                })()}
              </svg>
            </div>
            <div className="flex justify-between mt-2 text-xs text-neutral-500 font-medium">
              <span>Lun</span>
              <span>Mar</span>
              <span>Mer</span>
              <span>Jeu</span>
              <span>Ven</span>
              <span>Sam</span>
              <span>Dim</span>
            </div>
          </CardContent>
        </Card>

        <Card className="border-white/5 bg-white/[0.02]">
          <CardContent className="p-6">
            <h2 className="text-xl font-bold text-white mb-2">Objectif du Jour</h2>
            <p className="text-sm text-neutral-400 mb-6">Atteignez {dailyTarget.toLocaleString('fr-FR')} FCFA pour une journée optimale.</p>
            
            <div className="relative w-48 h-48 mx-auto mb-6">
              {/* Circle background */}
              <svg className="w-full h-full transform -rotate-90" viewBox="0 0 100 100">
                <circle cx="50" cy="50" r="45" fill="none" stroke="currentColor" strokeWidth="8" className="text-white/5" />
                <motion.circle 
                  initial={{ strokeDasharray: "0 100" }}
                  animate={{ strokeDasharray: `${progress} 100` }}
                  transition={{ duration: 1.5, ease: "easeOut" }}
                  cx="50" cy="50" r="45" fill="none" stroke="currentColor" strokeWidth="8" 
                  strokeLinecap="round"
                  className="text-emerald-500"
                  pathLength="100"
                />
              </svg>
              <div className="absolute inset-0 flex flex-col items-center justify-center">
                <span className="text-3xl font-bold text-white">{Math.round(progress)}%</span>
              </div>
            </div>
            
            <div className="space-y-4">
              <div className="flex justify-between items-center text-sm">
                <span className="text-neutral-400">Réalisé</span>
                <span className="text-white font-bold">{todayRevenue.toLocaleString('fr-FR')} FCFA</span>
              </div>
              <div className="flex justify-between items-center text-sm">
                <span className="text-neutral-400">Restant</span>
                <span className="text-emerald-400 font-bold">{Math.max(0, dailyTarget - todayRevenue).toLocaleString('fr-FR')} FCFA</span>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Dernières dépenses — retour visible pour le bouton "Ajouter une dépense" ci-dessus */}
      <Card className="border-white/5 bg-white/[0.02] mt-6">
        <CardContent className="p-6">
          <h2 className="text-xl font-bold text-white mb-4">Dernières dépenses</h2>
          {recentExpenses.length === 0 ? (
            <p className="text-neutral-500 text-sm">Aucune dépense enregistrée pour l'instant.</p>
          ) : (
            <div className="space-y-3">
              {recentExpenses.map((exp) => (
                <div key={exp.id} className="flex items-center justify-between border-b border-white/5 pb-3 last:border-0 last:pb-0">
                  <div className="flex items-center gap-3">
                    <div className="p-2 bg-red-500/10 rounded-lg">
                      <Receipt className="w-4 h-4 text-red-400" />
                    </div>
                    <div>
                      <p className="text-white text-sm font-medium">{exp.label}</p>
                      <p className="text-neutral-500 text-xs">{exp.category} · {new Date(exp.createdAt).toLocaleDateString('fr-FR', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })}</p>
                    </div>
                  </div>
                  <span className="text-red-400 font-bold text-sm">-{(parseInt(exp.amount) || 0).toLocaleString('fr-FR')} FCFA</span>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Modal Ajout Dépense */}
      <AnimatePresence>
        {showExpenseModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="bg-neutral-900 border border-white/10 rounded-2xl p-6 w-full max-w-md shadow-2xl relative"
            >
              <button
                onClick={() => setShowExpenseModal(false)}
                className="absolute top-4 right-4 text-neutral-400 hover:text-white"
              >
                <X className="w-6 h-6" />
              </button>

              <h2 className="text-2xl font-bold text-white mb-6">Ajouter une dépense</h2>

              <form onSubmit={handleAddExpense} className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-neutral-400 mb-1">Libellé</label>
                  <input
                    type="text"
                    required
                    placeholder="Ex: Bidon de savon"
                    className="w-full bg-neutral-950 border border-white/10 rounded-xl px-4 py-3 text-white focus:outline-none focus:border-blue-500"
                    value={newExpense.label}
                    onChange={(e) => setNewExpense({ ...newExpense, label: e.target.value })}
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-neutral-400 mb-1">Montant (FCFA)</label>
                  <input
                    type="number"
                    required
                    min="0"
                    placeholder="Ex: 5000"
                    className="w-full bg-neutral-950 border border-white/10 rounded-xl px-4 py-3 text-white focus:outline-none focus:border-blue-500"
                    value={newExpense.amount}
                    onChange={(e) => setNewExpense({ ...newExpense, amount: e.target.value })}
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-neutral-400 mb-1">Catégorie</label>
                  <select
                    className="w-full bg-neutral-950 border border-white/10 rounded-xl px-4 py-3 text-white focus:outline-none focus:border-blue-500"
                    value={newExpense.category}
                    onChange={(e) => setNewExpense({ ...newExpense, category: e.target.value })}
                  >
                    {EXPENSE_CATEGORIES.map((cat) => <option key={cat} value={cat}>{cat}</option>)}
                  </select>
                </div>

                <div className="pt-4 mt-2 border-t border-white/10">
                  <button
                    type="submit"
                    className="w-full bg-blue-600 hover:bg-blue-500 text-white font-bold py-3 px-4 rounded-xl transition-colors flex items-center justify-center"
                  >
                    <Calculator className="w-5 h-5 mr-2" />
                    Enregistrer la dépense
                  </button>
                </div>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
