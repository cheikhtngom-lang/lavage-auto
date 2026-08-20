import React, { useState } from 'react';
import { Card, CardContent } from '../../components/ui/Card';
import { Badge } from '../../components/ui/Badge';
import { Sparkles, Search, UserPlus, CheckCircle2, XCircle, Send, MessageCircle, FileText, AlertCircle } from 'lucide-react';
import { useAppState } from '../../hooks/useAppState';
import { supabase } from '../../lib/supabaseClient';

export default function Subscriptions() {
  const { clientSubscriptions, clientSubscriptionInvoices, addClientSubscription, updateSubscriptionStatus, generateSubscriptionInvoice, markSubscriptionInvoicePaid } = useAppState();
  
  const [showAddModal, setShowAddModal] = useState(false);
  const [searchPhone, setSearchPhone] = useState('');
  const [searchResult, setSearchResult] = useState(null);
  const [subPrice, setSubPrice] = useState(15000);
  const [searchLoading, setSearchLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');

  const handleSearchClient = async (e) => {
    e.preventDefault();
    if (!searchPhone) return;
    setSearchLoading(true);
    setErrorMsg('');
    
    // On cherche un client avec ce téléphone
    const { data } = await supabase.from('profiles').select('id, name, phone, email').eq('phone', searchPhone).single();
    if (data) {
      setSearchResult(data);
    } else {
      setSearchResult(null);
      setErrorMsg('Aucun client trouvé avec ce numéro. Il doit d\'abord s\'inscrire sur l\'application.');
    }
    setSearchLoading(false);
  };

  const handleCreateSub = async () => {
    if (!searchResult) return;
    await addClientSubscription(searchResult.id, subPrice);
    setShowAddModal(false);
    setSearchPhone('');
    setSearchResult(null);
  };

  const currentMonthStr = new Date().toISOString().slice(0, 7); // ex: 2026-08

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-6">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <h1 className="text-3xl font-bold text-white flex items-center gap-3">
            <Sparkles className="w-8 h-8 text-emerald-400" />
            Abonnements Clients
          </h1>
          <p className="text-neutral-400 mt-2">Gérez les abonnements mensuels de vos clients VIP.</p>
        </div>
        <button onClick={() => setShowAddModal(true)} className="bg-emerald-600 hover:bg-emerald-500 text-white font-bold py-2.5 px-5 rounded-xl transition-all shadow-lg flex items-center gap-2">
          <UserPlus className="w-5 h-5" /> Ajouter un abonné
        </button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Liste des abonnements */}
        <Card>
          <CardContent className="p-6">
            <h2 className="text-xl font-bold text-white mb-6">Abonnés Actuels</h2>
            {clientSubscriptions.length === 0 ? (
              <p className="text-neutral-500 text-center py-8">Aucun abonnement actif.</p>
            ) : (
              <div className="space-y-3">
                {clientSubscriptions.map(sub => (
                  <div key={sub.id} className="p-4 rounded-xl bg-neutral-900 border border-white/5 flex flex-wrap items-center justify-between gap-4">
                    <div>
                      <p className="font-bold text-white">{sub.clientName}</p>
                      <p className="text-sm text-neutral-400">{sub.clientPhone}</p>
                      <div className="flex items-center gap-2 mt-2">
                        <Badge variant="outline" className={sub.status === 'actif' ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20' : 'bg-red-500/10 text-red-400 border-red-500/20'}>
                          {sub.status === 'actif' ? 'Actif' : 'Suspendu'}
                        </Badge>
                        <span className="text-xs font-bold text-white bg-white/10 px-2 py-0.5 rounded-md">{sub.price.toLocaleString()} FCFA/mois</span>
                      </div>
                    </div>
                    <div className="flex gap-2">
                      <button 
                        onClick={() => updateSubscriptionStatus(sub.id, sub.status === 'actif' ? 'suspendu' : 'actif')} 
                        className={`p-2 rounded-lg transition-colors ${sub.status === 'actif' ? 'bg-red-500/10 text-red-400 hover:bg-red-500/20' : 'bg-emerald-500/10 text-emerald-400 hover:bg-emerald-500/20'}`}
                      >
                        {sub.status === 'actif' ? <XCircle className="w-5 h-5" /> : <CheckCircle2 className="w-5 h-5" />}
                      </button>
                      <button 
                        onClick={() => generateSubscriptionInvoice(sub, currentMonthStr)}
                        className="p-2 rounded-lg bg-blue-500/10 text-blue-400 hover:bg-blue-500/20 transition-colors flex items-center gap-1.5"
                      >
                        <FileText className="w-5 h-5" /> <span className="text-sm font-bold">Facturer {currentMonthStr}</span>
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Factures (Recettes à recouvrer) */}
        <Card>
          <CardContent className="p-6">
            <h2 className="text-xl font-bold text-white mb-6">Factures d'Abonnement</h2>
            {clientSubscriptionInvoices.length === 0 ? (
              <p className="text-neutral-500 text-center py-8">Aucune facture générée.</p>
            ) : (
              <div className="space-y-3">
                {clientSubscriptionInvoices.map(inv => {
                  const isPaid = inv.status === 'paye';
                  const waMsg = `Bonjour ${inv.clientName}, votre abonnement AutoClean de ce mois (${inv.amount.toLocaleString()} FCFA) est à renouveler. Merci de procéder au paiement.`;
                  const waLink = `https://wa.me/${inv.clientPhone.replace(/\D/g, '')}?text=${encodeURIComponent(waMsg)}`;
                  
                  return (
                    <div key={inv.id} className="p-4 rounded-xl bg-neutral-900 border border-white/5 flex flex-wrap items-center justify-between gap-4">
                      <div>
                        <p className="font-bold text-white">{inv.clientName}</p>
                        <p className="text-sm text-neutral-400">Facture: {inv.billingMonth}</p>
                        <div className="flex items-center gap-2 mt-2">
                          <Badge variant="outline" className={isPaid ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20' : 'bg-orange-500/10 text-orange-400 border-orange-500/20'}>
                            {isPaid ? 'Payée' : 'À payer'}
                          </Badge>
                          <span className="text-xs font-bold text-white bg-white/10 px-2 py-0.5 rounded-md">{inv.amount.toLocaleString()} FCFA</span>
                        </div>
                      </div>
                      
                      {!isPaid && (
                        <div className="flex gap-2">
                          <a href={waLink} target="_blank" rel="noopener noreferrer" className="p-2 rounded-lg bg-green-500/10 text-green-400 hover:bg-green-500/20 transition-colors" title="Envoyer rappel WhatsApp">
                            <MessageCircle className="w-5 h-5" />
                          </a>
                          <button 
                            onClick={() => markSubscriptionInvoicePaid(inv.id)}
                            className="bg-emerald-600 hover:bg-emerald-500 text-white font-bold px-3 py-1.5 rounded-lg transition-colors text-sm"
                          >
                            Marquer Payé
                          </button>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Modal d'ajout d'abonné */}
      {showAddModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
          <div className="bg-neutral-900 border border-white/10 rounded-2xl p-6 w-full max-w-md shadow-2xl relative">
            <h2 className="text-xl font-bold text-white mb-6">Nouvel Abonnement</h2>
            
            <form onSubmit={handleSearchClient} className="mb-4">
              <label className="block text-sm font-medium text-neutral-400 mb-1.5">Téléphone du client existant</label>
              <div className="flex gap-2">
                <input 
                  type="text" 
                  value={searchPhone} 
                  onChange={e => setSearchPhone(e.target.value)} 
                  placeholder="+221 77 000 00 00" 
                  className="flex-1 bg-neutral-950 border border-white/10 rounded-xl px-4 py-2.5 text-white focus:border-emerald-500 outline-none" 
                  required 
                />
                <button type="submit" className="bg-white/10 hover:bg-white/20 text-white px-4 py-2.5 rounded-xl font-bold transition-colors">
                  <Search className="w-5 h-5" />
                </button>
              </div>
              {errorMsg && <p className="text-red-400 text-sm mt-2 flex items-center gap-1"><AlertCircle className="w-4 h-4"/> {errorMsg}</p>}
            </form>

            {searchResult && (
              <div className="p-4 bg-emerald-500/10 border border-emerald-500/20 rounded-xl mb-4">
                <p className="text-sm text-emerald-400 font-bold mb-1">Client trouvé :</p>
                <p className="text-white font-bold text-lg">{searchResult.name}</p>
                <p className="text-neutral-400 text-sm">{searchResult.phone}</p>
                
                <div className="mt-4">
                  <label className="block text-sm font-medium text-neutral-400 mb-1.5">Prix mensuel convenu (FCFA)</label>
                  <input 
                    type="number" 
                    value={subPrice} 
                    onChange={e => setSubPrice(parseInt(e.target.value) || 0)} 
                    className="w-full bg-neutral-950 border border-white/10 rounded-xl px-4 py-2.5 text-white focus:border-emerald-500 outline-none" 
                  />
                </div>
              </div>
            )}

            <div className="flex justify-end gap-3 mt-6">
              <button onClick={() => {setShowAddModal(false); setSearchResult(null); setSearchPhone(''); setErrorMsg('');}} className="px-4 py-2 rounded-xl text-neutral-400 hover:text-white font-bold transition-colors">
                Annuler
              </button>
              <button 
                onClick={handleCreateSub} 
                disabled={!searchResult}
                className="bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white px-6 py-2 rounded-xl font-bold transition-colors"
              >
                Activer l'abonnement
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
