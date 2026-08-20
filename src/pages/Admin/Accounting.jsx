import React from 'react';
import { motion } from 'framer-motion';
import { Card, CardContent } from '../../components/ui/Card';
import { Badge } from '../../components/ui/Badge';
import { Calculator, TrendingUp, TrendingDown, DollarSign, CreditCard, Wallet, Calendar, ArrowRight, Sparkles } from 'lucide-react';
import { useAppState } from '../../hooks/useAppState';

export default function Accounting() {
  const { transactions, stationProfile, clientSubscriptionInvoices } = useAppState();

  const totalRevenue = transactions.reduce((acc, curr) => acc + (parseInt(curr.amount) || 0), 0);
  const totalSubRevenue = (clientSubscriptionInvoices || []).filter(inv => inv.status === 'paye').reduce((acc, curr) => acc + (parseInt(curr.amount) || 0), 0);
  // Configurable par l'admin dans Paramètres > Objectif de revenus (voir
  // Admin/Settings.jsx) — plus une valeur figée dans le code.
  const dailyTarget = stationProfile?.dailyRevenueTarget || 50000;
  const progress = Math.min((totalRevenue / dailyTarget) * 100, 100);

  return (
    <div className="p-8 max-w-7xl mx-auto relative z-10">
      <div className="flex flex-col md:flex-row md:items-center justify-between mb-8 gap-4">
        <div>
          <h1 className="text-4xl font-bold text-white mb-2 tracking-tight">Comptabilité & <span className="text-blue-400">Finances</span></h1>
          <p className="text-neutral-400 text-lg">Suivez vos revenus, dépenses et objectifs.</p>
        </div>
        <button className="bg-blue-600 hover:bg-blue-500 text-white px-6 py-3 rounded-xl font-bold transition-all shadow-lg shadow-blue-500/20 flex items-center gap-2">
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
              <Badge variant="success" className="bg-emerald-500/20 text-emerald-400 border border-emerald-500/30">
                +12% <TrendingUp className="w-3 h-3 inline ml-1" />
              </Badge>
            </div>
            <p className="text-neutral-400 text-sm font-medium mb-1">Revenus d'aujourd'hui</p>
            <h3 className="text-3xl font-bold text-white">{totalRevenue.toLocaleString('fr-FR')} FCFA</h3>
          </CardContent>
        </Card>

        <Card className="border-white/5 bg-gradient-to-br from-emerald-900/20 to-black relative overflow-hidden group">
          <div className="absolute top-0 right-0 w-32 h-32 bg-emerald-500/10 rounded-full blur-3xl group-hover:bg-emerald-500/20 transition-colors"></div>
          <CardContent className="p-6 relative z-10">
            <div className="flex justify-between items-start mb-4">
              <div className="p-3 bg-emerald-500/20 rounded-xl">
                <Wallet className="w-6 h-6 text-emerald-400" />
              </div>
              <Badge variant="success" className="bg-emerald-500/20 text-emerald-400 border border-emerald-500/30">
                +5% <TrendingUp className="w-3 h-3 inline ml-1" />
              </Badge>
            </div>
            <p className="text-neutral-400 text-sm font-medium mb-1">Revenus de la semaine</p>
            <h3 className="text-3xl font-bold text-white">142 500 FCFA</h3>
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
              <Badge variant="warning" className="bg-red-500/20 text-red-400 border border-red-500/30">
                -2% <TrendingDown className="w-3 h-3 inline ml-1" />
              </Badge>
            </div>
            <p className="text-neutral-400 text-sm font-medium mb-1">Dépenses (Savon, Eau)</p>
            <h3 className="text-3xl font-bold text-white">15 000 FCFA</h3>
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
                
                {/* Area fill */}
                <motion.path
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  transition={{ duration: 1 }}
                  d={`M 0 ${100 - 45} L ${100/6 * 1} ${100 - 60} L ${100/6 * 2} ${100 - 30} L ${100/6 * 3} ${100 - 80} L ${100/6 * 4} ${100 - 50} L ${100/6 * 5} ${100 - 95} L 100 ${100 - 70} L 100 100 L 0 100 Z`}
                  fill="url(#lineGradient)"
                />
                
                {/* Line stroke */}
                <motion.path
                  initial={{ pathLength: 0 }}
                  animate={{ pathLength: 1 }}
                  transition={{ duration: 1.5, ease: "easeInOut" }}
                  d={`M 0 ${100 - 45} L ${100/6 * 1} ${100 - 60} L ${100/6 * 2} ${100 - 30} L ${100/6 * 3} ${100 - 80} L ${100/6 * 4} ${100 - 50} L ${100/6 * 5} ${100 - 95} L 100 ${100 - 70}`}
                  fill="none"
                  stroke="#3b82f6"
                  strokeWidth="3"
                  vectorEffect="non-scaling-stroke"
                  filter="url(#glow)"
                />
                
                {/* Data points */}
                {[45, 60, 30, 80, 50, 95, 70].map((val, i) => (
                  <motion.circle
                    key={i}
                    initial={{ opacity: 0, scale: 0 }}
                    animate={{ opacity: 1, scale: 1 }}
                    transition={{ duration: 0.5, delay: 1 + i * 0.1 }}
                    cx={`${(100/6) * i}`}
                    cy={`${100 - val}`}
                    r="5"
                    fill="#0f172a"
                    stroke="#60a5fa"
                    strokeWidth="2.5"
                    vectorEffect="non-scaling-stroke"
                    className="cursor-pointer hover:fill-blue-500 transition-colors"
                  >
                    <title>{val * 1000} FCFA</title>
                  </motion.circle>
                ))}
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
                <span className="text-white font-bold">{totalRevenue.toLocaleString('fr-FR')} FCFA</span>
              </div>
              <div className="flex justify-between items-center text-sm">
                <span className="text-neutral-400">Restant</span>
                <span className="text-emerald-400 font-bold">{Math.max(0, dailyTarget - totalRevenue).toLocaleString('fr-FR')} FCFA</span>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
