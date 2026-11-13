// Administration > Modules (côté station) : les activités en plus (Tapis,
// Chaussures, Salon, Pressing) et les options, avec leur prix. La station voit
// ce qu'elle a et demande le reste sur WhatsApp ; c'est le Super Admin qui
// active (Super Admin > Modules), comme pour les autres options payantes.
import React from 'react';
import { Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import { Boxes, Check, MessageCircle, ArrowRight } from 'lucide-react';
import { useAppState } from '../../hooks/useAppState';
import { useDocumentTitle } from '../../lib/useDocumentTitle';
import { MODULE_GROUPS, modulesOfGroup, hasModule, ACTIVITY_MODULES } from '../../lib/stationModules';
import { SITE } from '../../lib/siteFooter';
import { cn } from '../../lib/utils';

// Rubrique ouverte par un module d'activité (lien « Ouvrir »).
const HREF_BY_MODULE = Object.fromEntries(Object.entries(ACTIVITY_MODULES).map(([activity, mod]) => [mod, `/admin/${activity}`]));
// Modules inclus d'office dans l'offre Station de service (clé Business).
const INCLUDED_IN_SERVICE_STATION = ['mod_vidange', 'mod_bilan', 'mod_boutique'];

function requestLink(stationName, mod) {
  const text = `Bonjour, la station ${stationName || ''} souhaite activer le module « ${mod.name} » (${mod.price}).`.replace(/\s+/g, ' ');
  return `${SITE.whatsapp}?text=${encodeURIComponent(text)}`;
}

export default function AdminModules() {
  useDocumentTitle('Modules');
  const { stationBilling, stationProfile } = useAppState();
  const active = stationBilling?.activeModules || [];
  const isServiceStation = stationBilling?.plan === 'Business';
  const has = (mod) => hasModule(active, mod.id) || (isServiceStation && INCLUDED_IN_SERVICE_STATION.includes(mod.id));

  return (
    <div className="p-4 sm:p-6 lg:p-8 max-w-6xl mx-auto relative z-10">
      <div className="mb-8">
        <h1 className="text-3xl sm:text-4xl font-bold text-white mb-2 tracking-tight flex items-center gap-3">
          <Boxes className="w-8 h-8 text-blue-400" /> Modules
        </h1>
        <p className="text-neutral-400 text-base sm:text-lg max-w-2xl">
          Ajoutez un métier ou une option à votre station. Chaque module a son prix, en plus de votre offre. Demandez-le sur WhatsApp : nous l'activons pour votre station.
        </p>
      </div>

      {MODULE_GROUPS.map((group) => (
        <section key={group.id} className="mb-10" aria-labelledby={`grp-${group.id}`}>
          <h2 id={`grp-${group.id}`} className="text-xl font-bold text-white mb-1">{group.title}</h2>
          <p className="text-neutral-400 text-sm mb-4 max-w-2xl">{group.sub}</p>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {modulesOfGroup(group.id).map((mod, i) => {
              const on = has(mod);
              const href = HREF_BY_MODULE[mod.id];
              return (
                <motion.article
                  key={mod.id}
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: i * 0.04, duration: 0.2 }}
                  className={cn('rounded-2xl p-5 border flex flex-col gap-3', on ? 'border-emerald-500/30 bg-emerald-500/[0.04]' : 'border-white/10 bg-white/[0.02]')}
                >
                  <div className="flex items-start gap-3">
                    <div className={cn('w-11 h-11 rounded-xl flex items-center justify-center shrink-0', on ? 'bg-emerald-500/10' : 'bg-blue-500/10')}>
                      <mod.icon className={cn('w-5 h-5', on ? 'text-emerald-400' : 'text-blue-400')} />
                    </div>
                    <div className="min-w-0 flex-1">
                      <h3 className="text-white font-bold flex items-center gap-2 flex-wrap">
                        {mod.name}
                        {on && <span className="inline-flex items-center gap-1 text-xs font-medium text-emerald-300"><Check className="w-3.5 h-3.5" /> Actif</span>}
                        {!on && mod.comingSoon && <span className="text-xs font-medium text-amber-300">Bientôt</span>}
                      </h3>
                      <p className="text-neutral-400 text-sm mt-1">{mod.desc}</p>
                    </div>
                  </div>
                  <div className="flex items-center justify-between gap-3 pt-3 border-t border-white/5 mt-auto">
                    <span className="text-white font-bold tabular-nums">{isServiceStation && INCLUDED_IN_SERVICE_STATION.includes(mod.id) ? 'Inclus dans votre offre' : mod.price}</span>
                    {on ? (
                      href ? (
                        <Link to={href} className="inline-flex items-center gap-1.5 text-sm font-bold text-blue-300 hover:text-white">
                          Ouvrir <ArrowRight className="w-4 h-4" />
                        </Link>
                      ) : null
                    ) : mod.comingSoon ? null : (
                      <a href={requestLink(stationProfile?.name, mod)} target="_blank" rel="noopener noreferrer"
                        className="inline-flex items-center gap-1.5 bg-blue-600 hover:bg-blue-500 text-white text-sm font-bold px-3.5 py-2 rounded-lg transition-colors">
                        <MessageCircle className="w-4 h-4" /> Demander
                      </a>
                    )}
                  </div>
                </motion.article>
              );
            })}
          </div>
        </section>
      ))}
    </div>
  );
}
