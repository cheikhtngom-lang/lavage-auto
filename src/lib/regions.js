// Compatibilité : la liste des régions vit maintenant dans le registre des pays
// (countries.js), qui gère plusieurs pays. Ce fichier garde les anciens noms
// exportés pour les modules qui n'ont pas besoin de connaître le pays.
//
// SENEGAL_REGIONS = régions du Sénégal seulement. Pour tout écran qui doit
// suivre le pays de la station ou du client, utiliser regionsOf(country).

import { regionsOf, regionLabel, regionCentroid } from './countries.js';

export const SENEGAL_REGIONS = regionsOf('SN').map(({ value, label }) => ({ value, label }));

export { regionLabel, regionCentroid };
