import React from 'react';

// Couleur d'un carburant, partagée par la configuration des pompes et la page Pompistes.
export const FUEL_CLS = {
  essence: 'bg-amber-500/15 text-amber-300 border-amber-500/30',
  gasoil: 'bg-sky-500/15 text-sky-300 border-sky-500/30',
};
export const FUEL_CLS_OFF = 'bg-white/5 text-neutral-500 border-white/10';

// Pastille « Essence 1 » / « Gasoil 3 ». Avec `onClick`, c'est une case à cocher :
// `active` = pistolet tenu, sinon grisé.
export default function NozzleChip({ label, fuel, active = true, onClick, title, disabled }) {
  const cls = `inline-flex items-center gap-1 px-2.5 py-1 rounded-lg border text-xs font-bold transition-colors ${active ? FUEL_CLS[fuel] || FUEL_CLS.essence : FUEL_CLS_OFF}`;
  if (!onClick) return <span className={cls} title={title}>{label}</span>;
  return (
    <button type="button" role="checkbox" aria-checked={active} disabled={disabled} onClick={onClick} title={title} className={`${cls} ${disabled ? 'opacity-50 cursor-not-allowed' : 'hover:brightness-125'}`}>
      <span aria-hidden="true" className={`inline-block w-3 h-3 rounded-sm border ${active ? 'bg-current border-current' : 'border-neutral-600'}`} />
      {label}
    </button>
  );
}
