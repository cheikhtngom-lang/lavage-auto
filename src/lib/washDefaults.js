// Grille tarifaire et durées par défaut d'une nouvelle station — partagées entre
// useAppState (session admin de sa propre station) et stationData (lecture de
// n'importe quelle station depuis l'espace automobiliste), pour que les deux
// affichent les mêmes valeurs tant que l'admin n'a pas encore personnalisé les
// siennes dans Paramètres > Grille tarifaire / Temps estimés.
export const DEFAULT_PRICING = {
  "Moto": { "Lavage Simple": 1000, "Lavage Complet": 2000, "Lavage Moteur": 1500 },
  "Particulier": { "Lavage Simple": 2500, "Lavage Complet": 5000, "Lavage Moteur": 4000 },
  "Transport": { "Lavage Simple": 3000, "Lavage Complet": 6000, "Lavage Moteur": 5000 },
  "Camion": { "Lavage Simple": 10000, "Lavage Complet": 20000, "Lavage Moteur": 15000 },
};

export const DEFAULT_DURATION = {
  "Moto": { "Lavage Simple": 10, "Lavage Complet": 20, "Lavage Moteur": 15 },
  "Particulier": { "Lavage Simple": 15, "Lavage Complet": 30, "Lavage Moteur": 25 },
  "Transport": { "Lavage Simple": 20, "Lavage Complet": 40, "Lavage Moteur": 35 },
  "Camion": { "Lavage Simple": 30, "Lavage Complet": 45, "Lavage Moteur": 40 },
};
