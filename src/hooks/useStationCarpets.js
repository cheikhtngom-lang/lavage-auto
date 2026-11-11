// Dépôts de tapis de la station connectée, tenus à jour en temps réel
// (un autre poste de la station fait avancer un dépôt : l'écran suit).
import { useCallback, useEffect, useState } from 'react';
import { supabase } from '../lib/supabaseClient';
import { getCurrentStationId } from '../lib/accounts';
import { rowToCarpet, STATION_CARPET_SELECT, SENT_CARPET_SELECT, rowToSentCarpet } from '../lib/carpets';

export function useStationCarpets() {
  const stationId = getCurrentStationId();
  const [orders, setOrders] = useState([]);
  // Dépôts de la station confiés à des stations partenaires (add_carpet_partner_stations.sql).
  const [sent, setSent] = useState([]);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState(null);

  const load = useCallback(async () => {
    if (!stationId || stationId === 'default') { setOrders([]); setSent([]); setLoaded(true); return; }
    const [mine, out] = await Promise.all([
      supabase.from('carpet_orders').select(STATION_CARPET_SELECT).eq('station_id', stationId).order('created_at', { ascending: false }).limit(500),
      supabase.from('carpet_orders').select(SENT_CARPET_SELECT).eq('from_station_id', stationId).order('created_at', { ascending: false }).limit(200),
    ]);
    if (mine.error) setError(mine.error.message);
    else { setError(null); setOrders((mine.data || []).map(rowToCarpet)); }
    if (!out.error) setSent((out.data || []).map(rowToSentCarpet));
    setLoaded(true);
  }, [stationId]);

  useEffect(() => {
    load();
    if (!stationId || stationId === 'default') return undefined;
    const channel = supabase
      .channel(`carpets-${stationId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'carpet_orders', filter: `station_id=eq.${stationId}` }, () => load())
      // Notes internes (add_carpet_piece_notes.sql), modifiées depuis un autre poste.
      .on('postgres_changes', { event: '*', schema: 'public', table: 'carpet_order_notes', filter: `station_id=eq.${stationId}` }, () => load())
      // Avancement chez une station partenaire.
      .on('postgres_changes', { event: '*', schema: 'public', table: 'carpet_orders', filter: `from_station_id=eq.${stationId}` }, () => load())
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [load, stationId]);

  // Remplace une ligne tout de suite après une action, sans attendre le temps réel.
  const upsertLocal = useCallback((order) => {
    setOrders((prev) => (prev.some((o) => o.id === order.id) ? prev.map((o) => (o.id === order.id ? order : o)) : [order, ...prev]));
  }, []);

  return { stationId, orders, sent, loaded, error, reload: load, upsertLocal };
}
