import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Plus, X, Car, Trash2, Check } from 'lucide-react';
import { useClientAccount } from '../../hooks/useClientAccount';
import { CategoryPicker, BrandDropdown, categoryIcon } from '../../components/client/VehicleFormFields';
import SuperUserUpsellModal from '../../components/client/SuperUserUpsellModal';
import { vehicleCapFor } from '../../lib/superUser';
import { useDocumentTitle } from '../../lib/useDocumentTitle';

const emptyForm = { category: '', brand: '', plate: '' };

export default function Garage() {
  useDocumentTitle('Mon garage');
  const { account, addVehicle, removeVehicle, superUserSub } = useClientAccount();
  const [showAddModal, setShowAddModal] = useState(false);
  const [showUpsellModal, setShowUpsellModal] = useState(false);
  const [form, setForm] = useState(emptyForm);

  const vehicles = account?.vehicles || [];
  const vehicleCap = vehicleCapFor(superUserSub);
  const isUnlimited = !Number.isFinite(vehicleCap);
  const atVehicleLimit = vehicles.length >= vehicleCap;

  const setCategory = (category) => setForm({ category, brand: '', plate: form.plate });

  const openAddModal = () => {
    if (atVehicleLimit) { setShowUpsellModal(true); return; }
    setShowAddModal(true);
  };

  const handleAdd = (e) => {
    e.preventDefault();
    if (!form.category || !form.brand || !form.plate.trim()) return;
    if (atVehicleLimit) { setShowAddModal(false); setShowUpsellModal(true); return; }
    addVehicle({ category: form.category, brand: form.brand, plate: form.plate.trim() });
    setForm(emptyForm);
    setShowAddModal(false);
  };

  const closeModal = () => { setShowAddModal(false); setForm(emptyForm); };

  return (
    <div className="container mx-auto px-4 py-12 max-w-5xl relative z-10">
      <div className="flex flex-col md:flex-row md:items-center justify-between mb-10 gap-4">
        <div>
          <h1 className="text-4xl font-bold mb-2 tracking-tight">Mon <span className="text-blue-400">Parking</span></h1>
          <p className="text-neutral-400 text-lg">Retrouvez vos véhicules pour réserver plus vite.</p>
        </div>
        <button
          onClick={openAddModal}
          className="bg-blue-600 hover:bg-blue-500 text-white px-6 py-3 rounded-xl font-bold transition-all shadow-lg shadow-blue-500/20 flex items-center gap-2 flex-shrink-0"
        >
          <Plus className="w-5 h-5" /> Ajouter un véhicule
        </button>
      </div>

      {!isUnlimited && (
        <p className="text-neutral-500 text-sm mb-6 -mt-6">
          {vehicles.length}/{vehicleCap} véhicules utilisés.
        </p>
      )}

      {vehicles.length === 0 ? (
        <div className="glass-card rounded-2xl p-12 text-center border-dashed border-2 border-white/10">
          <Car className="w-14 h-14 text-neutral-600 mx-auto mb-4" />
          <h3 className="text-xl font-bold text-white mb-2">Votre parking est vide</h3>
          <p className="text-neutral-400">Ajoutez un véhicule pour le retrouver rapidement lors de votre prochaine réservation.</p>
        </div>
      ) : (
        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
          {vehicles.map((v, index) => (
            <motion.div
              key={v.id}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: index * 0.05 }}
              className="glass-card rounded-2xl p-6 border border-white/5 bg-white/[0.02] flex flex-col"
            >
              <div className="flex items-start justify-between mb-4">
                <div className="w-12 h-12 rounded-xl bg-blue-500/20 flex items-center justify-center text-2xl">
                  {categoryIcon(v.category) || v.type?.split(' ')[0]}
                </div>
                <button
                  onClick={() => removeVehicle(v.id)}
                  className="p-2 bg-white/5 hover:bg-red-500/20 hover:text-red-400 text-neutral-400 rounded-lg transition-colors"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
              <h3 className="text-lg font-bold text-white">{v.brand || v.type?.replace(/^\S+\s/, '') || 'Véhicule'}</h3>
              <p className="text-neutral-500 text-sm mt-1">{v.category || 'Type non renseigné'}</p>
              <p className="text-neutral-500 text-sm">{v.plate || 'Immatriculation non renseignée'}</p>
            </motion.div>
          ))}
        </div>
      )}

      {/* Modal Ajout Véhicule */}
      <AnimatePresence>
        {showAddModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="bg-neutral-900 border border-white/10 rounded-2xl p-6 w-full max-w-md shadow-2xl relative"
            >
              <button onClick={closeModal} className="absolute top-4 right-4 text-neutral-400 hover:text-white">
                <X className="w-6 h-6" />
              </button>
              <h2 className="text-2xl font-bold text-white mb-6">🚗 Ajouter un véhicule</h2>
              <form onSubmit={handleAdd} className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-neutral-400 mb-1.5">Type de véhicule <span className="text-red-400">*</span></label>
                  <CategoryPicker value={form.category} onChange={setCategory} />
                </div>

                <AnimatePresence>
                  {form.category && (
                    <motion.div
                      initial={{ opacity: 0, height: 0 }}
                      animate={{ opacity: 1, height: 'auto' }}
                      exit={{ opacity: 0, height: 0 }}
                    >
                      <label className="block text-sm font-medium text-neutral-400 mb-1.5">Marque <span className="text-red-400">*</span></label>
                      <BrandDropdown category={form.category} value={form.brand} onChange={(brand) => setForm({ ...form, brand })} />
                      {form.brand && (
                        <p className="text-xs text-emerald-400 mt-1.5 flex items-center gap-1">
                          <Check className="w-3.5 h-3.5" /> {form.brand} sélectionné
                        </p>
                      )}
                    </motion.div>
                  )}
                </AnimatePresence>

                <div>
                  <label className="block text-sm font-medium text-neutral-400 mb-1.5">Immatriculation <span className="text-red-400">*</span></label>
                  <input type="text" placeholder="Ex: DK-1234-AB" value={form.plate}
                    onChange={(e) => setForm({ ...form, plate: e.target.value })}
                    className="w-full bg-neutral-950 border border-white/10 rounded-xl px-4 py-3 text-white placeholder-neutral-600 focus:outline-none focus:border-blue-500 transition-colors" />
                </div>
                <div className="pt-4 mt-2 border-t border-white/10">
                  <button type="submit" disabled={!form.category || !form.brand || !form.plate.trim()}
                    className="w-full bg-blue-600 hover:bg-blue-500 disabled:bg-neutral-800 disabled:text-neutral-500 disabled:cursor-not-allowed text-white font-bold py-3 px-4 rounded-xl transition-colors flex items-center justify-center">
                    <Plus className="w-5 h-5 mr-2" /> Ajouter au parking
                  </button>
                </div>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      <SuperUserUpsellModal open={showUpsellModal} onClose={() => setShowUpsellModal(false)} />
    </div>
  );
}
