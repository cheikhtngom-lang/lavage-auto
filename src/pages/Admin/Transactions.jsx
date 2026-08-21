import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Card, CardContent } from '../../components/ui/Card';
import { Badge } from '../../components/ui/Badge';
import { Activity, Search, Filter, Calendar, Download, Printer, MessageCircle, Eye, X } from 'lucide-react';
import { useAppState } from '../../hooks/useAppState';
import Pagination from '../../components/ui/Pagination';

export default function AdminTransactions() {
  const { transactions, stationProfile } = useAppState();
  const [searchTerm, setSearchTerm] = useState('');
  const [filterService, setFilterService] = useState('Tous');
  const [timeSegment, setTimeSegment] = useState('Tous');
  const [selectedReceipt, setSelectedReceipt] = useState(null);
  const today = new Date();
  const [filterYear, setFilterYear] = useState(String(today.getFullYear()));
  const [filterMonth, setFilterMonth] = useState(String(today.getMonth() + 1).padStart(2, '0'));
  const [filterDay, setFilterDay] = useState(new Date().toISOString().split('T')[0]);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);

  const segments = ['Tous', 'Par Jour', 'Par Mois', 'Par Année'];

  // Extraction des services uniques pour le filtre
  const uniqueServices = ['Tous', ...new Set((transactions || []).map(t => t.service))];

  // Logique de filtrage
  const filteredTransactions = (transactions || []).filter(t => {
    const matchSearch = t.client.toLowerCase().includes(searchTerm.toLowerCase());
    const matchService = filterService === 'Tous' || t.service === filterService;
    
    let matchDate = true;
    if (t.createdAt) {
      const d = new Date(t.createdAt);
      if (timeSegment === "Par Jour") {
        const yyyy = d.getFullYear();
        const mm = String(d.getMonth() + 1).padStart(2, '0');
        const dd = String(d.getDate()).padStart(2, '0');
        matchDate = `${yyyy}-${mm}-${dd}` === filterDay;
      } else if (timeSegment === "Par Mois") {
        const mm = String(d.getMonth() + 1).padStart(2, '0');
        matchDate = mm === filterMonth;
      } else if (timeSegment === "Par Année") {
        matchDate = String(d.getFullYear()) === filterYear;
      }
    } else {
      if (timeSegment === "Par Jour") {
        // Pour la démo, on vérifie si la date du jour correspond grossièrement (Aujourd'hui) ou on force le match si c'est la date du jour
        const today = new Date().toISOString().split('T')[0];
        if (filterDay === today) {
          matchDate = t.date.includes("Aujourd'hui") || t.date.includes("15:30"); // Mock
        } else {
          matchDate = false; // Normalement, on vérifierait t.date === filterDay formaté
        }
      } else if (timeSegment === "Par Mois") {
        // Simulation pour mock data
        const monthNames = ["Janvier", "Février", "Mars", "Avril", "Mai", "Juin", "Juillet", "Août", "Septembre", "Octobre", "Novembre", "Décembre"];
        const selectedMonthName = monthNames[parseInt(filterMonth) - 1];
        matchDate = t.date.includes(selectedMonthName) || (selectedMonthName === "Août" && t.date.includes("Aujourd'hui"));
      } else if (timeSegment === "Par Année") {
        matchDate = t.date.includes(filterYear) || (filterYear === "2024" && t.date.includes("Aujourd'hui"));
      }
    }

    return matchSearch && matchService && matchDate;
  });

  const totalAmount = filteredTransactions.reduce((acc, curr) => acc + (parseInt(curr.amount) || 0), 0);

  // Revenir à la page 1 dès qu'un filtre change la liste sous-jacente.
  useEffect(() => { setPage(1); }, [searchTerm, filterService, timeSegment, filterYear, filterMonth, filterDay]);
  const totalPages = Math.max(1, Math.ceil(filteredTransactions.length / pageSize));
  const currentPage = Math.min(page, totalPages);
  const paginatedTransactions = filteredTransactions.slice((currentPage - 1) * pageSize, currentPage * pageSize);

  return (
    <div className="p-8 max-w-7xl mx-auto relative z-10">
      <div className="flex flex-col md:flex-row md:items-center justify-between mb-8 gap-4">
        <div>
          <h1 className="text-4xl font-bold text-white mb-2 tracking-tight">Historique des <span className="text-blue-400">Transactions</span></h1>
          <p className="text-neutral-400 text-lg">Consultez, filtrez et exportez vos revenus.</p>
        </div>
        <div className="flex items-center gap-4 bg-blue-950/30 border border-blue-500/20 rounded-2xl px-6 py-4 shadow-[0_0_15px_rgba(59,130,246,0.15)]">
          <div>
            <p className="text-sm text-neutral-400 uppercase tracking-widest font-bold">Total Filtré</p>
            <p className="text-2xl font-bold text-blue-400">{totalAmount.toLocaleString('fr-FR')} FCFA</p>
          </div>
        </div>
      </div>

      {/* Segmented Control for Time */}
      <div className="flex overflow-x-auto gap-2 mb-6 pb-2 scrollbar-hide">
        {segments.map(segment => (
          <div key={segment} className="flex items-center">
            <button
              onClick={() => setTimeSegment(segment)}
              className={`px-4 py-2 rounded-xl text-sm font-medium transition-all whitespace-nowrap ${
                timeSegment === segment 
                  ? 'bg-blue-600 text-white shadow-lg shadow-blue-500/30' 
                  : 'bg-white/5 text-neutral-400 hover:text-white hover:bg-white/10'
              } ${['Par Année', 'Par Mois', 'Par Jour'].includes(segment) && timeSegment === segment ? 'rounded-r-none pr-3' : ''}`}
            >
              {segment}
            </button>
            
            {/* Dropdown Année */}
            {segment === 'Par Année' && timeSegment === 'Par Année' && (
              <select 
                value={filterYear}
                onChange={(e) => setFilterYear(e.target.value)}
                className="bg-blue-700 text-white outline-none py-2 px-2 text-sm appearance-none cursor-pointer rounded-r-xl border-l border-blue-500 shadow-lg shadow-blue-500/30 font-bold"
              >
                <option value="2023">2023</option>
                <option value="2024">2024</option>
                <option value="2025">2025</option>
                <option value="2026">2026</option>
                <option value="2027">2027</option>
              </select>
            )}

            {/* Dropdown Mois */}
            {segment === 'Par Mois' && timeSegment === 'Par Mois' && (
              <select 
                value={filterMonth}
                onChange={(e) => setFilterMonth(e.target.value)}
                className="bg-blue-700 text-white outline-none py-2 px-2 text-sm appearance-none cursor-pointer rounded-r-xl border-l border-blue-500 shadow-lg shadow-blue-500/30 font-bold"
              >
                <option value="01">Janvier</option>
                <option value="02">Février</option>
                <option value="03">Mars</option>
                <option value="04">Avril</option>
                <option value="05">Mai</option>
                <option value="06">Juin</option>
                <option value="07">Juillet</option>
                <option value="08">Août</option>
                <option value="09">Septembre</option>
                <option value="10">Octobre</option>
                <option value="11">Novembre</option>
                <option value="12">Décembre</option>
              </select>
            )}

            {/* Input Jour */}
            {segment === 'Par Jour' && timeSegment === 'Par Jour' && (
              <input 
                type="date"
                value={filterDay}
                onChange={(e) => setFilterDay(e.target.value)}
                className="bg-blue-700 text-white outline-none py-[7px] px-2 text-sm cursor-pointer rounded-r-xl border-l border-blue-500 shadow-lg shadow-blue-500/30 font-bold"
              />
            )}
          </div>
        ))}
      </div>

      {/* Filters Section */}
      <Card className="mb-8 border-white/5 bg-white/[0.02]">
        <CardContent className="p-6 flex flex-col md:flex-row gap-4 items-center justify-between">
          
          {/* Recherche */}
          <div className="relative w-full md:w-1/3">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-neutral-500" />
            <input 
              type="text" 
              placeholder="Rechercher un client..." 
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full bg-neutral-900 border border-white/10 rounded-xl pl-10 pr-4 py-3 text-white focus:outline-none focus:border-blue-500 transition-colors"
            />
          </div>

          <div className="flex flex-wrap w-full md:w-auto gap-4">
            {/* Filtre Service */}
            <div className="relative flex items-center bg-neutral-900 border border-white/10 rounded-xl px-4 py-1">
              <Filter className="w-4 h-4 text-neutral-400 mr-2" />
              <select 
                value={filterService}
                onChange={(e) => setFilterService(e.target.value)}
                className="bg-transparent text-white outline-none py-2 appearance-none cursor-pointer pr-4"
              >
                {uniqueServices.map(service => (
                  <option key={service} value={service} className="bg-neutral-900">{service}</option>
                ))}
              </select>
            </div>

            <button className="flex items-center px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl transition-colors font-medium text-sm shadow-lg shadow-emerald-500/20">
              <Download className="w-4 h-4 mr-2" />
              Exporter Excel
            </button>
          </div>
        </CardContent>
      </Card>

      {/* Table */}
      <div className="glass-card rounded-2xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left">
            <thead>
              <tr className="border-b border-white/5 bg-white/[0.02]">
                <th className="p-5 font-semibold text-neutral-400">Date & Heure</th>
                <th className="p-5 font-semibold text-neutral-400">Client</th>
                <th className="p-5 font-semibold text-neutral-400">Service</th>
                <th className="p-5 font-semibold text-neutral-400">Méthode</th>
                <th className="p-5 font-semibold text-neutral-400 text-right">Montant</th>
                <th className="p-5 font-semibold text-neutral-400 text-right">Reçu</th>
              </tr>
            </thead>
            <tbody>
              <AnimatePresence>
                {filteredTransactions.length === 0 ? (
                  <tr>
                    <td colSpan="6" className="p-12 text-center text-neutral-500">
                      Aucune transaction ne correspond à vos filtres.
                    </td>
                  </tr>
                ) : (
                  paginatedTransactions.map((t, index) => (
                    <motion.tr 
                      layout
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, scale: 0.95 }}
                      transition={{ duration: 0.2 }}
                      key={index} 
                      className="border-b border-white/5 hover:bg-white/5 transition-colors group"
                    >
                      <td className="p-5 text-sm text-neutral-400">{t.date}</td>
                      <td className="p-5 font-bold text-white">{t.client}</td>
                      <td className="p-5 text-neutral-300">{t.service}</td>
                      <td className="p-5">
                        <Badge className="bg-neutral-800 text-neutral-300 border-neutral-700">
                          {t.method}
                        </Badge>
                      </td>
                      <td className="p-5 text-right font-bold text-blue-400">
                        {t.amount} FCFA
                      </td>
                      <td className="p-5 text-right">
                        <div className="flex items-center justify-end gap-2">
                          <button onClick={() => setSelectedReceipt(t)} className="p-2 bg-white/5 hover:bg-white/10 text-neutral-300 rounded-lg transition-colors" title="Aperçu du reçu">
                            <Eye className="w-4 h-4" />
                          </button>
                          <button className="p-2 bg-blue-500/10 hover:bg-blue-500 hover:text-white text-blue-400 rounded-lg transition-colors" title="Imprimer">
                            <Printer className="w-4 h-4" />
                          </button>
                          <button className="p-2 bg-emerald-500/10 hover:bg-emerald-500 hover:text-white text-emerald-400 rounded-lg transition-colors" title="Envoyer par WhatsApp">
                            <MessageCircle className="w-4 h-4" />
                          </button>
                        </div>
                      </td>
                    </motion.tr>
                  ))
                )}
              </AnimatePresence>
            </tbody>
          </table>
        </div>
        <Pagination
          page={currentPage}
          pageSize={pageSize}
          totalItems={filteredTransactions.length}
          onPageChange={setPage}
          onPageSizeChange={(n) => { setPageSize(n); setPage(1); }}
        />
      </div>

      {/* Modal Aperçu Reçu */}
      <AnimatePresence>
        {selectedReceipt && (
          <motion.div 
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm"
            onClick={() => setSelectedReceipt(null)}
          >
            <motion.div 
              initial={{ scale: 0.9, y: 20 }} animate={{ scale: 1, y: 0 }} exit={{ scale: 0.9, y: 20 }}
              onClick={(e) => e.stopPropagation()}
              className="bg-neutral-900 border border-white/10 rounded-2xl w-full max-w-md overflow-hidden shadow-2xl"
            >
              <div className="p-4 border-b border-white/10 flex justify-between items-center bg-white/5">
                <h3 className="font-bold text-white">Aperçu du Reçu</h3>
                <button onClick={() => setSelectedReceipt(null)} className="text-neutral-400 hover:text-white">
                  <X className="w-5 h-5" />
                </button>
              </div>
              
              <div className="p-8 bg-white text-black receipt-preview">
                <div className="text-center mb-6">
                  {stationProfile?.logo && (
                    <img src={stationProfile.logo} alt="Logo" className="w-14 h-14 object-contain mx-auto mb-2" />
                  )}
                  <h2 className="text-2xl font-bold font-mono">{stationProfile?.name || 'Ma Station'}</h2>
                  {stationProfile?.quartier && (
                    <p className="text-sm text-gray-500">{stationProfile.quartier}{stationProfile.region ? `, ${stationProfile.region}` : ''}</p>
                  )}
                  {stationProfile?.phone && (
                    <p className="text-sm text-gray-500">Tel: {stationProfile.phone}</p>
                  )}
                </div>
                
                <div className="border-t border-b border-dashed border-gray-300 py-4 mb-4">
                  <div className="flex justify-between mb-2">
                    <span className="text-gray-600">Date:</span>
                    <span className="font-medium">{selectedReceipt.date}</span>
                  </div>
                  <div className="flex justify-between mb-2">
                    <span className="text-gray-600">Client:</span>
                    <span className="font-medium">{selectedReceipt.client}</span>
                  </div>
                  <div className="flex justify-between mb-2">
                    <span className="text-gray-600">Paiement:</span>
                    <span className="font-medium">{selectedReceipt.method}</span>
                  </div>
                </div>
                
                <div className="mb-6">
                  <div className="flex justify-between font-bold text-lg mb-2">
                    <span>{selectedReceipt.service}</span>
                    <span>{selectedReceipt.amount} FCFA</span>
                  </div>
                </div>
                
                <div className="border-t border-gray-800 pt-4 text-center">
                  <p className="font-bold text-xl mb-1">TOTAL: {selectedReceipt.amount} FCFA</p>
                  {stationProfile?.cachet && (
                    <img src={stationProfile.cachet} alt="Cachet" className="w-20 h-20 object-contain mx-auto mt-4 opacity-90" />
                  )}
                  <p className="text-xs text-gray-500 mt-4">Merci de votre visite !</p>
                  <p className="text-xs text-gray-400">Reçu généré électroniquement</p>
                </div>
              </div>
              
              <div className="p-4 bg-neutral-900 flex gap-3">
                <button className="flex-1 bg-blue-600 hover:bg-blue-500 text-white py-3 rounded-xl font-bold flex items-center justify-center transition-colors">
                  <Printer className="w-4 h-4 mr-2" /> Imprimer
                </button>
                <button className="flex-1 bg-emerald-600 hover:bg-emerald-500 text-white py-3 rounded-xl font-bold flex items-center justify-center transition-colors">
                  <MessageCircle className="w-4 h-4 mr-2" /> WhatsApp
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
