import React from 'react';
import { motion } from 'framer-motion';
import { Button } from '../../components/ui/Button';
import { MapPin, Clock, CreditCard, ChevronRight } from 'lucide-react';
import { useNavigate } from 'react-router-dom';

export default function Home() {
  const navigate = useNavigate();

  return (
    <div className="w-full flex flex-col items-center">
      {/* Hero Section */}
      <section className="w-full min-h-[80vh] flex flex-col items-center justify-center text-center px-4 relative">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8, ease: "easeOut" }}
          className="max-w-4xl mx-auto flex flex-col items-center"
        >
          <div className="inline-flex items-center rounded-full border border-white/10 bg-white/5 px-3 py-1 text-sm text-neutral-300 mb-6 backdrop-blur-sm">
            <span className="flex h-2 w-2 rounded-full bg-blue-500 mr-2 animate-pulse"></span>
            Le futur du lavage auto au Sénégal
          </div>
          
          <h1 className="text-5xl md:text-7xl font-bold tracking-tight mb-6">
            Lavez votre voiture.<br />
            <span className="text-transparent bg-clip-text bg-gradient-to-r from-blue-400 to-emerald-400">
              Sans jamais attendre.
            </span>
          </h1>
          
          <p className="text-lg md:text-xl text-neutral-400 mb-10 max-w-2xl">
            Prenez votre ticket en ligne, payez via Wave ou OM, et suivez votre position dans la file d'attente en temps réel.
          </p>
          
          <div className="flex flex-col sm:flex-row gap-4">
            <Button size="lg" className="bg-blue-600 hover:bg-blue-700 rounded-full px-8 text-md font-semibold" onClick={() => navigate('/stations')}>
              Trouver une station <ChevronRight className="ml-2 w-4 h-4" />
            </Button>
            <Button size="lg" variant="outline" className="rounded-full px-8 text-md font-semibold bg-white/5 backdrop-blur-sm hover:bg-white/10" onClick={() => navigate('/admin/queue')}>
              Espace Partenaire
            </Button>
          </div>
        </motion.div>
      </section>

      {/* Features Grid */}
      <section className="w-full max-w-6xl mx-auto px-4 py-24">
        <div className="grid md:grid-cols-3 gap-6">
          {[
            {
              icon: MapPin,
              title: "Stations à proximité",
              desc: "Trouvez les meilleures stations de lavage autour de vous en un clic."
            },
            {
              icon: Clock,
              title: "File d'attente en direct",
              desc: "Visualisez votre position et le temps d'attente estimé avant de vous déplacer."
            },
            {
              icon: CreditCard,
              title: "Paiement Mobile",
              desc: "Réglez directement via Wave, Orange Money ou Carte Bancaire."
            }
          ].map((feature, i) => (
            <motion.div
              key={i}
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ delay: i * 0.2, duration: 0.5 }}
              className="p-6 rounded-2xl border border-white/5 bg-white/5 backdrop-blur-sm hover:bg-white/10 transition-colors"
            >
              <div className="w-12 h-12 rounded-xl bg-blue-500/20 flex items-center justify-center mb-6 text-blue-400">
                <feature.icon className="w-6 h-6" />
              </div>
              <h3 className="text-xl font-semibold mb-3">{feature.title}</h3>
              <p className="text-neutral-400 leading-relaxed">{feature.desc}</p>
            </motion.div>
          ))}
        </div>
      </section>
    </div>
  );
}
