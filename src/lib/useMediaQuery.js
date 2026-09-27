import { useEffect, useState } from 'react';

// Suit une media query CSS en direct (rotation d'une tablette, fenêtre
// redimensionnée) — contrairement à un simple `window.innerWidth` lu au rendu,
// qui figeait la mise en page tant qu'aucun autre état ne changeait.
export function useMediaQuery(query) {
  const get = () => (typeof window !== 'undefined' && window.matchMedia ? window.matchMedia(query).matches : false);
  const [matches, setMatches] = useState(get);
  useEffect(() => {
    if (!window.matchMedia) return undefined;
    const mql = window.matchMedia(query);
    const onChange = () => setMatches(mql.matches);
    onChange();
    mql.addEventListener ? mql.addEventListener('change', onChange) : mql.addListener(onChange);
    return () => { mql.removeEventListener ? mql.removeEventListener('change', onChange) : mql.removeListener(onChange); };
  }, [query]);
  return matches;
}

// Trois dispositions pour les espaces connectés (voir AppShell.jsx), calées
// sur les points de rupture Tailwind lg (1024 px) et xl (1280 px) :
//   'drawer' : téléphone et tablette en portrait — menu escamotable ;
//   'rail'   : tablette en paysage, petit portable — barre d'icônes ;
//   'full'   : ordinateur — menu complet avec libellés.
export function useShellMode() {
  const isLg = useMediaQuery('(min-width: 1024px)');
  const isXl = useMediaQuery('(min-width: 1280px)');
  if (!isLg) return 'drawer';
  return isXl ? 'full' : 'rail';
}
