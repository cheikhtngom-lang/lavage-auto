import React, { Suspense } from 'react';
import { Loader2 } from 'lucide-react';

// Les pages sont chargées à la demande (React.lazy, voir App.jsx) : avant, tout
// l'espace station/groupe/Super Admin/automobiliste tenait dans un seul fichier
// de 1,7 Mo à télécharger avant le moindre affichage — très lent sur mobile.
// Placé autour de <Outlet /> dans chaque layout, pour que le menu reste affiché
// pendant le chargement d'une rubrique.
export default function PageSuspense({ children }) {
  return (
    <Suspense
      fallback={(
        <div className="flex items-center justify-center py-24 text-neutral-500">
          <Loader2 className="w-6 h-6 animate-spin" />
        </div>
      )}
    >
      {children}
    </Suspense>
  );
}
