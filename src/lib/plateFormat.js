// Format d'affichage/stockage des plaques d'immatriculation : lettres en
// majuscules, un tiret à chaque passage lettres <-> chiffres, comme les plaques
// sénégalaises (AA-900-DK, DK-9875-PM). "aa189ds", "AA 189 DS" et "AA-189-DS"
// donnent tous "AA-189-DS".
//
// Miroir de public.format_plate() (add_plate_format.sql), qui applique la même
// règle côté base via un trigger sur `vehicles` — garder les deux alignés.

const MAX_PLATE_CHARS = 14;

export function formatPlate(raw) {
  const clean = String(raw ?? '').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, MAX_PLATE_CHARS);
  return (clean.match(/[A-Z]+|[0-9]+/g) || []).join('-');
}
