import React, { useEffect, useRef, useState } from 'react';
import { Globe, ChevronDown, Check } from 'lucide-react';
import { COUNTRIES, countryName, getCountry } from '../../lib/countries';

// Lien discret « Pays : Sénégal ▾ » : corrige une détection automatique erronée
// (VPN, ville frontalière…) ou change de pays. `source === 'manual'` = le pays a
// été choisi à la main ; « Détection automatique » efface ce choix.
export function CountryPicker({ code, detected, openCodes, source, onChoose }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);

  useEffect(() => {
    if (!open) return undefined;
    const close = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    const esc = (e) => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('mousedown', close);
    document.addEventListener('keydown', esc);
    return () => { document.removeEventListener('mousedown', close); document.removeEventListener('keydown', esc); };
  }, [open]);

  const choices = COUNTRIES.filter((c) => openCodes.includes(c.code));
  const autoLabel = detected && getCountry(detected) ? `Détection automatique (${countryName(detected)})` : 'Détection automatique';

  return (
    <div ref={ref} className="relative inline-block text-left" data-country-picker>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-haspopup="listbox"
        aria-expanded={open}
        className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-3.5 py-1.5 text-sm text-neutral-300 hover:text-white hover:border-white/25 transition-colors"
      >
        <Globe className="w-4 h-4 text-blue-400" />
        <span>Pays : <strong className="text-white font-semibold">{code ? countryName(code) : 'non disponible'}</strong></span>
        <ChevronDown className={`w-4 h-4 transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>
      {open && (
        <ul role="listbox" className="absolute z-30 mt-2 min-w-[15rem] rounded-xl border border-white/10 bg-neutral-900 shadow-2xl overflow-hidden text-sm">
          <li>
            <button type="button" role="option" aria-selected={source !== 'manual'}
              onClick={() => { onChoose(null); setOpen(false); }}
              className="w-full flex items-center justify-between gap-3 px-4 py-2.5 text-left text-neutral-200 hover:bg-white/5 transition-colors">
              <span>{autoLabel}</span>
              {source !== 'manual' && <Check className="w-4 h-4 text-emerald-400" />}
            </button>
          </li>
          {choices.map((c) => (
            <li key={c.code} className="border-t border-white/5">
              <button type="button" role="option" aria-selected={source === 'manual' && code === c.code}
                onClick={() => { onChoose(c.code); setOpen(false); }}
                className="w-full flex items-center justify-between gap-3 px-4 py-2.5 text-left text-neutral-200 hover:bg-white/5 transition-colors">
                <span>{c.name}</span>
                {source === 'manual' && code === c.code && <Check className="w-4 h-4 text-emerald-400" />}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

// Écran affiché à la place de la recherche quand le pays du visiteur n'est pas (encore)
// ouvert : on le lui dit clairement, sans le rabattre sur un autre pays.
export function CountryUnavailable({ detected, openCodes, onChoose }) {
  const known = detected && getCountry(detected);
  const label = known ? countryName(detected) : 'votre pays';
  const openNames = COUNTRIES.filter((c) => openCodes.includes(c.code));
  return (
    <div className="glass-card rounded-2xl p-10 md:p-14 text-center border-dashed border-2 border-white/10" data-country-unavailable>
      <Globe className="w-14 h-14 text-neutral-600 mx-auto mb-4" />
      <h3 className="text-xl font-bold text-white mb-2">Clean Car Galsen n&apos;est pas encore disponible dans {known ? `le pays détecté (${label})` : label}</h3>
      <p className="text-neutral-400 mb-6 max-w-xl mx-auto">
        Nous ouvrons le service pays par pays. Vous pouvez consulter les stations d&apos;un pays déjà disponible, ou nous écrire pour être prévenu de l&apos;ouverture dans votre pays.
      </p>
      <div className="flex flex-wrap items-center justify-center gap-3">
        {openNames.map((c) => (
          <button key={c.code} type="button" onClick={() => onChoose(c.code)}
            className="bg-blue-600 hover:bg-blue-500 text-white px-5 py-2.5 rounded-xl font-medium transition-colors">
            Voir les stations : {c.name}
          </button>
        ))}
        <button type="button" data-open-contact
          className="border border-white/15 hover:bg-white/5 text-neutral-200 px-5 py-2.5 rounded-xl font-medium transition-colors">
          Nous écrire
        </button>
      </div>
    </div>
  );
}
