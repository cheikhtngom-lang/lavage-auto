// Types de véhicules proposés à la réservation et dans le garage automobiliste.
// `category` doit correspondre aux clés de pricingConfig/durationConfig (useAppState).
export const VEHICLE_TYPES = [
  { label: '🏍️ Moto / Scooter', value: 'Moto / Scooter', category: 'Moto' },
  { label: '🚗 Berline / Citadine', value: 'Berline / Citadine', category: 'Particulier' },
  { label: '🚗 Renault Logan', value: 'Renault Logan', category: 'Particulier' },
  { label: '🚗 Toyota Corolla', value: 'Toyota Corolla', category: 'Particulier' },
  { label: '🚗 Peugeot 205/206/207', value: 'Peugeot 205/206/207', category: 'Particulier' },
  { label: '🚙 4x4 / SUV', value: '4x4 / SUV', category: 'Particulier' },
  { label: '🚙 Hyundai Tucson/Santa Fe', value: 'Hyundai Tucson/Santa Fe', category: 'Particulier' },
  { label: '🚐 Minibus / Clando', value: 'Minibus / Clando', category: 'Transport' },
  { label: '🚌 Car rapide / Bus', value: 'Car rapide / Bus', category: 'Transport' },
  { label: '🚛 Camion leger', value: 'Camion leger', category: 'Camion' },
  { label: '🚛 Camion lourd / Remorque', value: 'Camion lourd', category: 'Camion' },
];
