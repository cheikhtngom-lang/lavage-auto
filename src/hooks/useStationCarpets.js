// Dépôts de tapis de la station connectée, tenus à jour en temps réel
// (un autre poste de la station fait avancer un dépôt : l'écran suit).
import { useCallback, useEffect, useState } from 'react';
import { supabase } from '../lib/supabaseClient';
import { getCurrentStationId } from '../lib/accounts';
import { rowToCarpet } from '../lib/carpets';

export function useStationCarpets() {
  const stationId = getCurrentStationId();
  const [orders, setOrders] = useState([]);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState(null);

  const load = useCallback(async () => {
    if (!stationId || stationId === 'default') { setOrders([]); setLoaded(true); return; }
    const { data, error: err } = await supabase.from('carpet_orders').select('*').eq('station_id', stationId).order('created_at', { ascending: false }).limit(500);
    if (err) setError(err.message);
    else { setError(null); setOrders((data || []).map(rowToCarpet)); }
    setLoaded(true);
  }, [stationId]);

  useEffect(() => {
    load();
    if (!stationId || stationId === 'default') return undefined;
    const channel = supabase
      .channel(`carpets-${stationId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'carpet_orders', filter: `station_id=eq.${stationId}` }, () => load())
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [load, stationId]);

  // Remplace une ligne tout de suite après une action, sans attendre le temps réel.
  const upsertLocal = useCallback((order) => {
    setOrders((prev) => (prev.some((o) => o.id === order.id) ? prev.map((o) => (o.id === order.id ? order : o)) : [order, ...prev]));
  }, []);

  return { stationId, orders, loaded, error, reload: load, upsertLocal };
}
