import { useEffect, useState } from 'react';
import { loadShopSales } from '../lib/shop';
import { getCurrentStationId } from '../lib/accounts';

// Ventes sur place de la station (shop_sales) pour la Comptabilité et
// l'Analytique. `enabled` : la station a une boutique. `refreshKey` : change
// quand une vente arrive (ex. nombre de transactions, rafraîchi en Realtime).
export function useShopSales(enabled, refreshKey) {
  const [sales, setSales] = useState([]);
  useEffect(() => {
    const stationId = getCurrentStationId();
    if (!enabled || !stationId || stationId === 'default') { setSales([]); return undefined; }
    let cancelled = false;
    loadShopSales(stationId)
      .then((rows) => { if (!cancelled) setSales(rows); })
      .catch(() => { if (!cancelled) setSales([]); });
    return () => { cancelled = true; };
  }, [enabled, refreshKey]);
  return sales;
}
