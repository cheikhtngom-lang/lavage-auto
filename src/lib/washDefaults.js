// Grille tarifaire et durées par défaut d'une nouvelle station — partagées entre
// useAppState (session admin de sa propre station) et stationData (lecture de
// n'importe quelle station depuis l'espace automobiliste), pour que les deux
// affichent les mêmes valeurs tant que l'admin n'a pas encore personnalisé les
// siennes dans Paramètres > Grille tarifaire / Temps estimés.
// Moto (deux-roues et tricycles) n'a qu'une seule prestation proposée :
// "Lavage Complet" — pas de Simple/Moteur pour cette catégorie.
export const DEFAULT_PRICING = {
  "Moto": { "Lavage Complet": 2000 },
  "Particulier": { "Lavage Simple": 2500, "Lavage Complet": 5000, "Lavage Moteur": 4000 },
  "Transport": { "Lavage Simple": 3000, "Lavage Complet": 6000, "Lavage Moteur": 5000 },
  "Camion": { "Lavage Simple": 10000, "Lavage Complet": 20000, "Lavage Moteur": 15000 },
};

export const DEFAULT_DURATION = {
  "Moto": { "Lavage Complet": 20 },
  "Particulier": { "Lavage Simple": 15, "Lavage Complet": 30, "Lavage Moteur": 25 },
  "Transport": { "Lavage Simple": 20, "Lavage Complet": 40, "Lavage Moteur": 35 },
  "Camion": { "Lavage Simple": 30, "Lavage Complet": 45, "Lavage Moteur": 40 },
};
