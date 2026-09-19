// Pays de la connexion du visiteur, pour choisir automatiquement les régions à
// afficher (voir src/lib/userCountry.js). Vercel renseigne l'en-tête
// x-vercel-ip-country (code ISO 3166-1 alpha-2) sur chaque requête : aucun
// service tiers, aucune fenêtre d'autorisation, aucune donnée stockée — l'IP
// n'est ni lue ni conservée ici.
//
// Première fonction serveur du projet : le site reste statique partout ailleurs.
// Hors Vercel (npm run dev), /api/country n'existe pas : le front retombe alors
// sur le pays du compte, sinon sur le Sénégal.
export default function handler(req, res) {
  const raw = String(req.headers['x-vercel-ip-country'] || '').toUpperCase();
  res.setHeader('Cache-Control', 'private, no-store');
  res.status(200).json({ country: /^[A-Z]{2}$/.test(raw) ? raw : null });
}
