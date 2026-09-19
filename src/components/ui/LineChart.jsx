import React, { useMemo } from 'react';
import { AreaChart } from './charts';

// Graphique en courbe pour UNE série de points { label, value }. Depuis la refonte
// (inspirée de Bklit UI) il s'appuie sur AreaChart de charts.jsx : courbe lissée avec
// dégradé et halo, réticule et infobulle animée au survol, échelle graduée. Même
// appel qu'avant : <LineChart points color height formatValue />.
export default function LineChart({ points, color = '#a855f7', height = 240, formatValue = (v) => String(v) }) {
  const data = useMemo(() => (points || []).map((p) => ({ label: p.label, value: p.value })), [points]);
  const integer = data.every((d) => Number.isInteger(d.value));
  return (
    <AreaChart
      data={data} series={[{ key: 'value', label: '', color }]} height={height}
      formatValue={formatValue} integer={integer}
    />
  );
}
