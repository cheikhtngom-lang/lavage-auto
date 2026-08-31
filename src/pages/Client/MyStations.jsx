import React from 'react';
import { motion } from 'framer-motion';
import { Link } from 'react-router-dom';
import { MapPin, Clock, Trash2, Building2, ArrowRight } from 'lucide-react';
import { useSuperAdminState } from '../../hooks/useSuperAdminState';
import { useClientAccount } from '../../hooks/useClientAccount';
import { getStationOperationalProfile, isStationOpenNow, getStationRatingSummary } from '../../lib/stationData';
import { regionLabel } from '../../lib/regions';
import { StarRatingDisplay } from '../../components/ui/StarRating';
import { useDocumentTitle } from '../../lib/useDocumentTitle';

export default function MyStations() {
  useDocumentTitle('Mes stations');
  const { stations: registry } = useSuperAdminState();
  const { account, hideStation, reservations, myTransactions } = useClientAccount();

  const activeStations = (registry || []).filter(s => s.status !== 'suspendue');
  const hiddenIds = account?.hiddenStationIds || [];
  // "Visitée" = au moins une réservation active ou un paiement enregistré dans
  // cette station — RLS ne rend visibles que MES propres lignes (reservations/
  // transactions), donc pas besoin de parcourir tout le registre comme avant.
  const visitedIds = new Set([...reservations.map(r => r.station_id), ...myTransactions.map(tx => tx.station_id)]);
  const stations = activeStations.filter(s => visitedIds.has(s.id) && !hiddenIds.includes(s.id));

  return (
    <div className="container mx-auto px-4 py-12 max-w-5xl relative z-10">
      <div className="mb-10">
        <h1 className="text-4xl font-bold mb-2 tracking-tight">Mes <span className="text-blue-400">Stations</span></h1>
        <p className="text-neutral-400 text-lg">Les stations où vous avez déjà réservé une place.</p>
      </div>

      {stations.length === 0 ? (
        <div className="glass-card rounded-2xl p-12 text-center border-dashed border-2 border-white/10">
          <Building2 className="w-14 h-14 text-neutral-600 mx-auto mb-4" />
          <h3 className="text-xl font-bold text-white mb-2">Aucune station pour l'instant</h3>
          <p className="text-neutral-400 mb-6">Réservez votre première place pour la voir apparaître ici.</p>
          <Link to="/dashboard/stations" className="inline-flex items-center gap-2 bg-blue-600 hover:bg-blue-500 text-white px-6 py-3 rounded-xl font-bold transition-colors">
            Trouver une station <ArrowRight className="w-4 h-4" />
          </Link>
        </div>
      ) : (
        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
          {stations.map((station, index) => {
            const profile = getStationOperationalProfile(station.id);
            const open = isStationOpenNow(profile);
            const rating = getStationRatingSummary(station.id);
            const location = station.quartier ? `${station.quartier}, ${regionLabel(station.region)}` : (station.city || station.address || 'Sénégal');
            return (
              <motion.div
                key={station.id}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: index * 0.05 }}
                className="glass-card rounded-2xl p-6 border border-white/5 bg-white/[0.02] flex flex-col"
              >
                <div className="flex items-start justify-between mb-3 gap-2">
                  <h3 className="text-lg font-bold text-white flex-1">{station.name}</h3>
                  <button
                    onClick={() => hideStation(station.id)}
                    title="Retirer de mes stations"
                    className="p-2 bg-white/5 hover:bg-red-500/20 hover:text-red-400 text-neutral-400 rounded-lg transition-colors flex-shrink-0"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
                <div className="mb-3"><StarRatingDisplay average={rating.average} count={rating.count} /></div>
                <div className="flex items-center text-neutral-400 text-sm mb-4 flex-1">
                  <MapPin className="w-4 h-4 mr-2 text-blue-400 flex-shrink-0" /> {location}
                </div>
                <div className="mb-4">
                  {open
                    ? <span className="text-emerald-400 bg-emerald-500/10 px-3 py-1 rounded-md text-xs font-medium inline-flex items-center border border-emerald-500/20"><Clock className="w-3.5 h-3.5 mr-1" /> Ouvert</span>
                    : <span className="text-red-400 bg-red-500/10 px-3 py-1 rounded-md text-xs font-medium inline-flex items-center border border-red-500/20"><Clock className="w-3.5 h-3.5 mr-1" /> Fermé</span>}
                </div>
                <Link
                  to={`/dashboard/stations?stationId=${station.id}`}
                  className="w-full bg-blue-600 hover:bg-blue-500 text-white font-bold py-3 rounded-xl transition-all flex items-center justify-center gap-2"
                >
                  Réserver à nouveau <ArrowRight className="w-4 h-4" />
                </Link>
              </motion.div>
            );
          })}
        </div>
      )}
    </div>
  );
}
