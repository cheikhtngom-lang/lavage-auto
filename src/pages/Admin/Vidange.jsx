import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { Card, CardContent } from '../../components/ui/Card';
import { Wrench, Calendar, CheckCircle2, XCircle, Settings as SettingsIcon, Gauge } from 'lucide-react';
import { useAppState } from '../../hooks/useAppState';
import { useDocumentTitle } from '../../lib/useDocumentTitle';

const STATUS_BADGE = {
  confirmee: { label: 'À venir', className: 'bg-blue-500/10 text-blue-400 border-blue-500/20' },
  terminee: { label: 'Terminée', className: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20' },
  annulee: { label: 'Annulée', className: 'bg-red-500/10 text-red-400 border-red-500/20' },
};

export default function Vidange() {
  useDocumentTitle('Vidange');
  const { vidangeBookings, updateVidangeBookingStatus, stationProfile } = useAppState();
  const [updating, setUpdating] = useState({});

  const upcoming = (vidangeBookings || []).filter((b) => b.status === 'confirmee');
  const history = (vidangeBookings || []).filter((b) => b.status !== 'confirmee');

  const todayKey = new Date().toISOString().slice(0, 10);
  const todayCount = upcoming.filter((b) => (b.scheduledAt || '').slice(0, 10) === todayKey).length;
  const totalDue = upcoming.reduce((sum, b) => sum + (b.amount || 0), 0);

  const handleStatus = async (id, status) => {
    setUpdating((prev) => ({ ...prev, [id]: true }));
    await updateVidangeBookingStatus(id, status);
    setUpdating((prev) => ({ ...prev, [id]: false }));
  };

  const formatWhen = (iso) => new Date(iso).toLocaleString('fr-FR', { weekday: 'short', day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' });

  const renderRow = (b) => {
    const badge = STATUS_BADGE[b.status] || STATUS_BADGE.confirmee;
    return (
      <div key={b.id} className="p-5 flex flex-wrap items-center justify-between gap-4 border-b border-white/5 last:border-0">
        <div className="min-w-[180px]">
          <p className="font-bold text-white flex items-center gap-2">
            <Calendar className="w-4 h-4 text-blue-400" /> {formatWhen(b.scheduledAt)}
          </p>
          <p className="text-neutral-400 text-sm mt-1">{b.vehicleLabel} · {b.category}</p>
        </div>
        <div className="min-w-[160px]">
          <p className="text-white text-sm font-medium">Vidange {b.oilType}</p>
          <p className="text-neutral-500 text-xs mt-1">
            {[b.filtreHuile && 'Filtre à huile', b.filtreAir && 'Filtre à air'].filter(Boolean).join(' · ') || 'Sans supplément'}
            {b.mileage ? ` · ${b.mileage.toLocaleString('fr-FR')} km` : ''}
          </p>
        </div>
        <div className="text-right min-w-[110px]">
          <p className="text-white font-bold">{(b.amount || 0).toLocaleString('fr-FR')} FCFA</p>
          <p className="text-neutral-500 text-xs mt-1">{b.paid ? `Payé (${b.paymentMethod || 'en ligne'})` : 'À régler sur place'}</p>
        </div>
        <span className={`text-xs font-medium px-3 py-1 rounded-full border ${badge.className}`}>{badge.label}</span>
        {b.status === 'confirmee' && (
          <div className="flex gap-2">
            <button
              onClick={() => handleStatus(b.id, 'terminee')}
              disabled={updating[b.id]}
              className="flex items-center gap-1.5 px-3 py-2 bg-emerald-500/10 hover:bg-emerald-500/20 disabled:opacity-60 text-emerald-400 rounded-lg transition-colors text-xs font-bold"
            >
              <CheckCircle2 className="w-4 h-4" /> Terminée
            </button>
            <button
              onClick={() => { if (window.confirm('Annuler ce rendez-vous vidange ?')) handleStatus(b.id, 'annulee'); }}
              disabled={updating[b.id]}
              className="flex items-center gap-1.5 px-3 py-2 bg-red-500/10 hover:bg-red-500/20 disabled:opacity-60 text-red-400 rounded-lg transition-colors text-xs font-bold"
            >
              <XCircle className="w-4 h-4" /> Annuler
            </button>
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="p-8 max-w-7xl mx-auto relative z-10">
      <div className="flex flex-col md:flex-row md:items-center justify-between mb-8 gap-4">
        <div>
          <h1 className="text-4xl font-bold text-white mb-2 tracking-tight">
            <Wrench className="w-8 h-8 text-blue-400 inline-block mr-2 -mt-1" /> Vidange
          </h1>
          <p className="text-neutral-400 text-lg">Rendez-vous de vidange réservés et payés en ligne par vos clients.</p>
        </div>
        <Link
          to="/admin/settings"
          className="flex items-center gap-2 bg-white/5 hover:bg-white/10 text-white px-5 py-3 rounded-xl font-medium transition-colors border border-white/10"
        >
          <SettingsIcon className="w-4 h-4" /> Tarifs & réglages vidange
        </Link>
      </div>

      {!stationProfile?.vidangeEnabled && (
        <div className="glass-card rounded-2xl p-6 mb-8 border border-amber-500/20 bg-amber-500/[0.03] flex items-center gap-4">
          <Gauge className="w-8 h-8 text-amber-400 flex-shrink-0" />
          <div>
            <p className="text-white font-bold">La vidange n'est pas encore activée</p>
            <p className="text-neutral-400 text-sm mt-1">
              Activez-la et configurez vos tarifs dans <Link to="/admin/settings" className="text-amber-400 underline">Paramètres &gt; Vidange</Link> pour que vos clients puissent réserver.
            </p>
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
        <Card className="border-white/5 bg-white/[0.02]">
          <CardContent className="p-6">
            <p className="text-neutral-400 text-sm font-medium mb-1">Rendez-vous aujourd'hui</p>
            <h3 className="text-3xl font-bold text-white">{todayCount}</h3>
          </CardContent>
        </Card>
        <Card className="border-white/5 bg-white/[0.02]">
          <CardContent className="p-6">
            <p className="text-neutral-400 text-sm font-medium mb-1">Rendez-vous à venir</p>
            <h3 className="text-3xl font-bold text-white">{upcoming.length}</h3>
          </CardContent>
        </Card>
        <Card className="border-white/5 bg-white/[0.02]">
          <CardContent className="p-6">
            <p className="text-neutral-400 text-sm font-medium mb-1">Montant à venir (dont non encaissé)</p>
            <h3 className="text-3xl font-bold text-white">{totalDue.toLocaleString('fr-FR')} FCFA</h3>
          </CardContent>
        </Card>
      </div>

      <h2 className="text-xl font-bold text-white mb-4">À venir</h2>
      {upcoming.length === 0 ? (
        <div className="glass-card rounded-2xl p-10 text-center border-dashed border-2 border-white/10 mb-10">
          <Wrench className="w-12 h-12 text-neutral-600 mx-auto mb-3" />
          <p className="text-neutral-400">Aucun rendez-vous de vidange à venir.</p>
        </div>
      ) : (
        <div className="glass-card rounded-2xl overflow-hidden border border-white/5 bg-white/[0.02] mb-10">
          {upcoming.map(renderRow)}
        </div>
      )}

      {history.length > 0 && (
        <>
          <h2 className="text-xl font-bold text-white mb-4">Historique</h2>
          <div className="glass-card rounded-2xl overflow-hidden border border-white/5 bg-white/[0.02]">
            {history.map(renderRow)}
          </div>
        </>
      )}
    </div>
  );
}
