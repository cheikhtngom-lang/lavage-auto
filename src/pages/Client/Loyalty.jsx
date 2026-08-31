import React from 'react';
import { Gift } from 'lucide-react';
import { useDocumentTitle } from '../../lib/useDocumentTitle';
import { useClientAccount } from '../../hooks/useClientAccount';
import { useSuperAdminState } from '../../hooks/useSuperAdminState';
import LoyaltyGrid from '../../components/client/LoyaltyGrid';
import { buildLoyaltyEntries } from '../../lib/loyalty';

// Page dédiée — extraite du tableau de bord principal (Client/Dashboard.jsx)
// pour l'alléger. Même calcul de progression que l'ancien bloc "Fidélité" du
// dashboard (compte de lavages payés par station, cycle qui se réinitialise
// après chaque lavage gratuit obtenu) — voir lib/loyalty.js.
export default function ClientLoyalty() {
  useDocumentTitle('Fidélité');
  const { myTransactions } = useClientAccount();
  const { stations: registry } = useSuperAdminState();

  const activeStations = (registry || []).filter((s) => s.status !== 'suspendue');
  const loyaltyEntries = buildLoyaltyEntries(myTransactions, activeStations);

  return (
    <div className="container mx-auto px-4 py-12 max-w-5xl relative z-10">
      <div className="mb-10">
        <h1 className="text-4xl font-bold mb-2 tracking-tight flex items-center gap-3">
          <Gift className="w-8 h-8 text-blue-400" /> Ma <span className="text-blue-400">Fidélité</span>
        </h1>
        <p className="text-neutral-400 text-lg">Votre progression vers un lavage gratuit, station par station.</p>
      </div>

      <LoyaltyGrid entries={loyaltyEntries} />
    </div>
  );
}
