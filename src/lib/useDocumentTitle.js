import { useEffect } from 'react';

// L'app est une SPA à un seul point d'entrée HTML par grand espace
// (dashboard.html sert /dashboard/*, /admin/*, /superadmin/* — voir
// dashboard.html <title>), donc sans ça toutes les pages d'un même espace
// partagent le même titre d'onglet ("Clean Car Galsen - Dashboards").
// Restaure le titre précédent au démontage pour ne pas laisser un titre
// périmé affiché pendant une transition de route.
const SUFFIX = ' · Clean Car Galsen';
export function useDocumentTitle(title) {
  useEffect(() => {
    const previous = document.title;
    document.title = title ? `${title}${SUFFIX}` : 'Clean Car Galsen';
    return () => { document.title = previous; };
  }, [title]);
}
