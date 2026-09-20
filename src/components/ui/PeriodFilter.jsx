import React from 'react';

// Sélecteur de période « Tous / Par Jour / Par Mois / Par Année » — le même que
// celui de la page Transactions d'une station (Admin/Transactions.jsx) : le
// segment actif s'accole à son sélecteur (calendrier, mois, année).
//
// Contrôlé : le parent garde l'état. `month` est un index 0-11 ; `day` une date
// 'AAAA-MM-JJ'. Le sélecteur d'année de « Par Mois » n'apparaît que s'il existe
// plusieurs années à choisir (aujourd'hui une seule : il serait du bruit).
export const PERIOD_SEGMENTS = [
  { key: 'tous', label: 'Tous' },
  { key: 'jour', label: 'Par Jour' },
  { key: 'mois', label: 'Par Mois' },
  { key: 'annee', label: 'Par Année' },
];

const ACCENTS = {
  blue: { active: 'bg-blue-600 shadow-blue-500/30', picker: 'bg-blue-700 border-blue-500 shadow-blue-500/30' },
  purple: { active: 'bg-purple-600 shadow-purple-500/30', picker: 'bg-purple-700 border-purple-500 shadow-purple-500/30' },
};

const MONTHS = ['Janvier', 'Février', 'Mars', 'Avril', 'Mai', 'Juin', 'Juillet', 'Août', 'Septembre', 'Octobre', 'Novembre', 'Décembre'];

export default function PeriodFilter({
  segment, onSegmentChange, day, onDayChange, month, onMonthChange, year, onYearChange, yearOptions, accent = 'blue',
}) {
  const colors = ACCENTS[accent] || ACCENTS.blue;
  const pickerBase = `${colors.picker} text-white outline-none py-2 px-2 text-sm cursor-pointer rounded-r-xl border-l shadow-lg font-bold`;
  const yearSelect = (
    <select value={year} onChange={(e) => onYearChange(Number(e.target.value))} className={`${pickerBase} appearance-none`}>
      {yearOptions.map((y) => <option key={y} value={y}>{y}</option>)}
    </select>
  );

  return (
    <div className="flex overflow-x-auto gap-2 pb-1 scrollbar-hide">
      {PERIOD_SEGMENTS.map(({ key, label }) => {
        const active = segment === key;
        const hasPicker = active && key !== 'tous';
        return (
          <div key={key} className="flex items-center">
            <button
              type="button"
              onClick={() => onSegmentChange(key)}
              className={`px-4 py-2 rounded-xl text-sm font-medium transition-all whitespace-nowrap ${
                active ? `${colors.active} text-white shadow-lg` : 'bg-white/5 text-neutral-400 hover:text-white hover:bg-white/10'
              } ${hasPicker ? 'rounded-r-none pr-3' : ''}`}
            >
              {label}
            </button>

            {key === 'jour' && active && (
              <input
                type="date"
                value={day}
                onChange={(e) => onDayChange(e.target.value)}
                className={`${pickerBase} py-[7px]`}
              />
            )}

            {key === 'mois' && active && (
              <>
                <select value={month} onChange={(e) => onMonthChange(Number(e.target.value))} className={`${pickerBase} appearance-none ${yearOptions.length > 1 ? 'rounded-r-none' : ''}`}>
                  {MONTHS.map((m, i) => <option key={m} value={i}>{m}</option>)}
                </select>
                {yearOptions.length > 1 && yearSelect}
              </>
            )}

            {key === 'annee' && active && yearSelect}
          </div>
        );
      })}
    </div>
  );
}
