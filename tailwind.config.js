/** @type {import('tailwindcss').Config} */

// Palettes neutral, blue et violets (purple, violet, indigo, fuchsia) branchées sur des variables CSS (voir src/index.css) :
// par défaut elles valent les couleurs Tailwind d'origine (site public inchangé) ; dans les
// espaces connectés, AppShell pose la classe « theme-lagon » sur <html> et elles prennent
// les couleurs du tableau de bord de référence (bleu pétrole, cyan, bleu cobalt).
const STEPS = [50, 100, 200, 300, 400, 500, 600, 700, 800, 900, 950];
const scale = (name) => Object.fromEntries(STEPS.map((s) => [s, `rgb(var(--tw-${name}-${s}) / <alpha-value>)`]));

export default {
  content: [
    "./index.html",
    "./login.html",
    "./reset-password.html",
    "./forgot-password.html",
    "./dashboard.html",
    "./sur-mesure.html",
    "./404.html",
    "./merci.html",
    "./confidentialite.html",
    "./conditions-generales.html",
    "./mentions-legales.html",
    "./reglement.html",
    "./accord-traitement-donnees.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        neutral: scale('neutral'),
        blue: scale('blue'),
        purple: scale('purple'),
        violet: scale('violet'),
        indigo: scale('indigo'),
        fuchsia: scale('fuchsia'),
      },
      fontFamily: {
        sans: ['Inter', 'ui-sans-serif', 'system-ui', 'sans-serif'],
        display: ['Bricolage Grotesque', 'Inter', 'ui-sans-serif', 'system-ui', 'sans-serif'],
      },
    },
  },
  plugins: [],
}
