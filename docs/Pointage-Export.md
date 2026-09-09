# Export du pointage mensuel (Excel)

**Où :** Admin → Laveurs → sélecteur de mois + bouton « Extraire le pointage (Excel) ».

Produit un classeur `.xlsx` (SheetJS) à partir des **vraies données** de la
table `attendance_records` (`loadAttendanceForMonth` dans `useAppState.jsx`) —
jamais un forfait. Le temps travaillé vient des horodatages réels
`clock_in_at` / `clock_out_at` (ou `total_time` figé au moment de la
descente). Pour le mois en cours : le jour même utilise l'état live de
l'employé, les jours passés l'instantané enregistré ce jour-là.

## 3 feuilles

| Feuille | Contenu |
|---|---|
| **Synthèse** | 1 ligne / employé : jours travaillés, total heures (`8h 05m`) **+ total en heures décimales** (pour la paie), moyenne/jour, jours repos / congé / maladie / absence. Ligne **TOTAL** en bas. |
| **Détail par jour** | Grille employé × jours du mois. Cellule = heures travaillées, ou lettre de statut (`R` repos, `C` congé, `M` maladie, `A` absence), ou vide si aucun pointage. |
| **Pointages** | Format long normalisé : 1 ligne par (employé, jour) pointé — Date, Jour, Employé, Rôle, Statut, Arrivée, Départ, Heures, Minutes. Idéal pour un **tableau croisé dynamique**. |

## Détails

- **Employés inclus** : les laveurs actuels + tout employé (même **supprimé
  depuis**) ayant au moins un pointage dans le mois — nom/rôle relus depuis
  `attendance_records` (colonnes figées). Triés par nom.
- **Mois** : n'importe quel mois passé ou en cours (sélecteur `<input type="month">`,
  borné à aujourd'hui).
- Largeurs de colonnes définies (`!cols`). Pas de style de cellule (gras,
  couleurs) : la version communautaire de SheetJS n'écrit pas les styles —
  passer à `xlsx-js-style` si un jour c'est requis.
- Nom du fichier : `Pointage_AAAA-MM_NomStation.xlsx`.
