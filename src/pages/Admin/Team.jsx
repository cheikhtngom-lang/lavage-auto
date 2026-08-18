import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Card, CardContent } from '../../components/ui/Card';
import { Badge } from '../../components/ui/Badge';
import { UserPlus, MoreVertical, CheckCircle2, Clock, XCircle, Search, Edit2, Trash2, X } from 'lucide-react';
import { useAppState } from '../../hooks/useAppState';

export default function Team() {
  const { employees, addEmployee, deleteEmployee } = useAppState();
  
  const [searchTerm, setSearchTerm] = useState('');
  const [showAddModal, setShowAddModal] = useState(false);
  const [newMember, setNewMember] = useState({ name: '', role: 'Caisse', access: 'Limité (Encaissements)' });
  
  const handleAddMember = (e) => {
    e.preventDefault();
    if (!newMember.name) return;
    
    addEmployee({
      name: newMember.name,
      role: newMember.role,
      access: newMember.access,
    });
    
    setShowAddModal(false);
    setNewMember({ name: '', role: 'Caisse', access: 'Limité (Encaissements)' });
  };

  const getStatusIcon = (status) => {
    switch(status) {
      case 'Actif': return <CheckCircle2 className="w-4 h-4 text-emerald-400" />;
      case 'Hors ligne': return <Clock className="w-4 h-4 text-amber-400" />;
      default: return null;
    }
  };

  const getStatusColor = (status) => {
    switch(status) {
      case 'Actif': return "bg-emerald-500/20 text-emerald-400 border-emerald-500/30";
      case 'Hors ligne': return "bg-amber-500/20 text-amber-400 border-amber-500/30";
      default: return "bg-neutral-500/20 text-neutral-400 border-neutral-500/30";
    }
  };

  const managementTeam = (employees || []).filter(emp => emp?.role !== 'Laveur');
  const filteredTeam = managementTeam.filter(m => m?.name?.toLowerCase().includes(searchTerm.toLowerCase()));

  return (
    <div className="p-8 max-w-7xl mx-auto relative z-10">
      <div className="flex flex-col md:flex-row md:items-center justify-between mb-8 gap-4">
        <div>
          <h1 className="text-4xl font-bold text-white mb-2 tracking-tight">Équipe de <span className="text-blue-400">Gestion</span></h1>
          <p className="text-neutral-400 text-lg">Gérez les accès administrateurs et les rôles de direction.</p>
        </div>
        <button 
          onClick={() => setShowAddModal(true)}
          className="bg-blue-600 hover:bg-blue-500 text-white px-6 py-3 rounded-xl font-bold transition-all shadow-lg shadow-blue-500/20 flex items-center gap-2"
        >
          <UserPlus className="w-5 h-5" />
          Ajouter un membre
        </button>
      </div>

      <Card className="border-white/5 bg-white/[0.02]">
        <CardContent className="p-6">
          <div className="flex flex-col md:flex-row justify-between items-center mb-6 gap-4">
            <div className="relative w-full md:w-1/3">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-neutral-500" />
              <input 
                type="text" 
                placeholder="Rechercher un employé..." 
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full bg-neutral-900 border border-white/10 rounded-xl pl-10 pr-4 py-3 text-white focus:outline-none focus:border-blue-500 transition-colors"
              />
            </div>
            
            <div className="flex gap-2">
              <Badge variant="outline" className="bg-neutral-900 border-white/10 px-4 py-2 cursor-pointer hover:bg-white/5">Tous</Badge>
              <Badge variant="outline" className="bg-neutral-900 border-white/10 px-4 py-2 cursor-pointer hover:bg-white/5">Caisse</Badge>
              <Badge variant="outline" className="bg-neutral-900 border-white/10 px-4 py-2 cursor-pointer hover:bg-white/5">Superviseurs</Badge>
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-white/10">
                  <th className="p-5 font-semibold text-neutral-400">Membre</th>
                  <th className="p-5 font-semibold text-neutral-400">Rôle</th>
                  <th className="p-5 font-semibold text-neutral-400">Statut du Compte</th>
                  <th className="p-5 font-semibold text-neutral-400">Droits d'Accès</th>
                  <th className="p-5 font-semibold text-neutral-400 text-center">Dernière Connexion</th>
                  <th className="p-5 font-semibold text-neutral-400 text-right">Actions</th>
                </tr>
              </thead>
              <tbody>
                <AnimatePresence>
                  {filteredTeam.map((member, index) => (
                    <motion.tr 
                      key={member.id}
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: index * 0.05 }}
                      className="border-b border-white/5 hover:bg-white/[0.02] transition-colors"
                    >
                      <td className="p-5">
                        <div className="flex items-center gap-4">
                          <div className="w-10 h-10 rounded-full bg-gradient-to-tr from-blue-600 to-purple-600 flex items-center justify-center font-bold text-white shadow-lg">
                            {member.avatar}
                          </div>
                          <div>
                            <p className="font-bold text-white">{member.name}</p>
                            <p className="text-xs text-neutral-500">ID: #EMP-{member.id.toString().slice(0, 8).toUpperCase()}</p>
                          </div>
                        </div>
                      </td>
                      <td className="p-5">
                        <span className="text-neutral-300">{member.role}</span>
                      </td>
                      <td className="p-5">
                        <Badge variant="outline" className={`flex items-center gap-1.5 w-fit ${getStatusColor(member.status)}`}>
                          {getStatusIcon(member.status)} {member.status}
                        </Badge>
                      </td>
                      <td className="p-5">
                        <span className="font-bold text-blue-400 bg-blue-500/10 px-3 py-1 rounded-lg text-sm">{member.access}</span>
                      </td>
                      <td className="p-5 text-center text-neutral-400">
                        {member.lastLogin}
                      </td>
                      <td className="p-5 text-right">
                        <div className="flex justify-end gap-2">
                          <button className="p-2 bg-white/5 hover:bg-blue-500/20 hover:text-blue-400 text-neutral-400 rounded-lg transition-colors">
                            <Edit2 className="w-4 h-4" />
                          </button>
                          <button 
                            onClick={() => {
                              if(window.confirm('Voulez-vous vraiment supprimer cet employé ?')) {
                                deleteEmployee(member.id);
                              }
                            }}
                            className="p-2 bg-white/5 hover:bg-red-500/20 hover:text-red-400 text-neutral-400 rounded-lg transition-colors"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      </td>
                    </motion.tr>
                  ))}
                </AnimatePresence>
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
      {/* Modal Ajout Membre */}
      <AnimatePresence>
        {showAddModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
            <motion.div 
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="bg-neutral-900 border border-white/10 rounded-2xl p-6 w-full max-w-md shadow-2xl relative"
            >
              <button 
                onClick={() => setShowAddModal(false)}
                className="absolute top-4 right-4 text-neutral-400 hover:text-white"
              >
                <X className="w-6 h-6" />
              </button>
              
              <h2 className="text-2xl font-bold text-white mb-6">Ajouter un employé</h2>
              
              <form onSubmit={handleAddMember} className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-neutral-400 mb-1">Prénom et Nom</label>
                  <input 
                    type="text" 
                    required
                    placeholder="Ex: Amadou Diop"
                    className="w-full bg-neutral-950 border border-white/10 rounded-xl px-4 py-3 text-white focus:outline-none focus:border-blue-500"
                    value={newMember.name}
                    onChange={(e) => setNewMember({...newMember, name: e.target.value})}
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-neutral-400 mb-1">Rôle</label>
                  <select 
                    className="w-full bg-neutral-950 border border-white/10 rounded-xl px-4 py-3 text-white focus:outline-none focus:border-blue-500"
                    value={newMember.role}
                    onChange={(e) => setNewMember({...newMember, role: e.target.value})}
                  >
                    <option value="Caisse">Caisse</option>
                    <option value="Superviseur">Superviseur</option>
                    <option value="Laveur">Laveur</option>
                    <option value="Administrateur">Administrateur</option>
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-neutral-400 mb-1">Droits d'accès</label>
                  <select 
                    className="w-full bg-neutral-950 border border-white/10 rounded-xl px-4 py-3 text-white focus:outline-none focus:border-blue-500"
                    value={newMember.access}
                    onChange={(e) => setNewMember({...newMember, access: e.target.value})}
                  >
                    <option value="Limité (Encaissements)">Limité (Encaissements)</option>
                    <option value="Standard (Gestion Quotidienne)">Standard (Gestion Quotidienne)</option>
                    <option value="Complet">Complet</option>
                    <option value="Super Admin">Super Admin</option>
                  </select>
                </div>
                
                <div className="pt-4 mt-2 border-t border-white/10">
                  <button 
                    type="submit"
                    className="w-full bg-blue-600 hover:bg-blue-500 text-white font-bold py-3 px-4 rounded-xl transition-colors flex items-center justify-center"
                  >
                    <UserPlus className="w-5 h-5 mr-2" />
                    Créer le profil
                  </button>
                </div>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
