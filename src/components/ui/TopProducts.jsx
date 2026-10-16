import React from 'react';
import { motion } from 'framer-motion';
import { Trophy, Store } from 'lucide-react';
import { Card, CardContent } from './Card';

// « Top 5 des produits les plus vendus » (Comptabilité et Analytique) :
// `products` vient de topProducts (lib/shopStats.js) — quantité vendue et
// chiffre d'affaires sur la période affichée, ventes sur place + en ligne.

const RANK_STYLES = [
  'bg-amber-400/15 text-amber-300 ring-amber-400/30',
  'bg-neutral-300/10 text-neutral-200 ring-neutral-300/25',
  'bg-orange-500/15 text-orange-300 ring-orange-500/30',
];

export default function TopProducts({ products, periodLabel, className = '' }) {
  const max = Math.max(1, ...products.map((p) => p.quantity));
  return (
    <Card className={`border-white/5 bg-white/[0.02] ${className}`}>
      <CardContent className="p-6">
        <div className="flex items-start justify-between gap-3 mb-5">
          <div>
            <h2 className="text-xl font-bold text-white flex items-center gap-2"><Trophy className="w-5 h-5 text-amber-400" /> Top 5 des produits</h2>
            <p className="text-neutral-500 text-xs mt-1">Les plus vendus · sur place et en ligne</p>
          </div>
          {periodLabel && <span className="text-xs bg-white/5 text-neutral-300 px-2 py-1 rounded-md whitespace-nowrap">{periodLabel.charAt(0).toUpperCase() + periodLabel.slice(1)}</span>}
        </div>

        {products.length === 0 ? (
          <div className="py-8 text-center">
            <Store className="w-8 h-8 text-neutral-700 mx-auto mb-3" />
            <p className="text-neutral-500 text-sm">Aucune vente boutique sur cette période.</p>
          </div>
        ) : (
          <ol className="space-y-4">
            {products.map((p, idx) => (
              <li key={p.key} className="flex items-center gap-3">
                <span className={`w-7 h-7 rounded-lg ring-1 ring-inset flex items-center justify-center text-xs font-bold flex-shrink-0 ${RANK_STYLES[idx] || 'bg-white/5 text-neutral-400 ring-white/10'}`}>{idx + 1}</span>
                <div className="flex-1 min-w-0">
                  <div className="flex items-baseline justify-between gap-3 mb-1.5">
                    <span className="text-sm font-medium text-white truncate">{p.name}</span>
                    <span className="text-xs text-neutral-400 whitespace-nowrap"><span className="text-white font-bold">{p.quantity.toLocaleString('fr-FR')}</span> vendu{p.quantity > 1 ? 's' : ''}</span>
                  </div>
                  <div className="flex items-center gap-3">
                    <div className="flex-1 h-1.5 bg-neutral-900 rounded-full overflow-hidden">
                      <motion.div
                        initial={{ width: 0 }}
                        animate={{ width: `${(p.quantity / max) * 100}%` }}
                        transition={{ duration: 0.8, delay: 0.1 + idx * 0.08 }}
                        className="h-full rounded-full bg-gradient-to-r from-emerald-500 to-teal-300"
                      />
                    </div>
                    <span className="text-xs text-emerald-400 font-bold whitespace-nowrap w-24 text-right">{p.amount.toLocaleString('fr-FR')} F</span>
                  </div>
                </div>
              </li>
            ))}
          </ol>
        )}
      </CardContent>
    </Card>
  );
}
