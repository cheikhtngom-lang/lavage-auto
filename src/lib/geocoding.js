// Localise une station à partir de son quartier/région, pour les cas où le gérant
// inscrit sa station depuis un autre endroit (donc "ma position actuelle" ne
// correspond pas à la station) — voir aussi captureStationLocation() dans login.html
// et handleLocateStation() dans src/pages/Admin/Settings.jsx, qui utilisent GPS réel.
//
// Module sans dépendance React : importable aussi bien depuis login.html (script
// type="module") que depuis les composants React.

import { regionLabel, regionCentroid } from './regions.js';

const GEOCODE_TIMEOUT_MS = 6000;

// Tente une géolocalisation précise du quartier via Nominatim (OpenStreetMap).
// En cas d'échec (réseau, quartier introuvable...), retombe sur le centre
// approximatif de la région choisie — moins précis, mais toujours dans la bonne zone.
export async function geocodeQuartierRegion(quartier, regionValue) {
  const region = regionLabel(regionValue);
  const trimmedQuartier = (quartier || '').trim();

  if (trimmedQuartier) {
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), GEOCODE_TIMEOUT_MS);
      const query = [trimmedQuartier, region, 'Sénégal'].filter(Boolean).join(', ');
      const url = `https://nominatim.openstreetmap.org/search?format=json&limit=1&countrycodes=sn&q=${encodeURIComponent(query)}`;
      const res = await fetch(url, { signal: controller.signal, headers: { Accept: 'application/json' } });
      clearTimeout(timeout);
      if (res.ok) {
        const results = await res.json();
        if (results.length > 0) {
          return { lat: parseFloat(results[0].lat), lng: parseFloat(results[0].lon), precision: 'quartier' };
        }
      }
    } catch {
      // Réseau indisponible, requête bloquée, timeout... on retombe sur la région.
    }
  }

  const centroid = regionCentroid(regionValue);
  if (centroid) {
    return { ...centroid, precision: 'region' };
  }

  throw new Error("Impossible de localiser ce quartier ou cette région. Vérifiez l'orthographe ou choisissez une région.");
}
