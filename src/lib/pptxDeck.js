// Socle commun des exports PowerPoint du Bilan (station : lib/bilanPptx.js,
// plateforme : lib/platformBilanPptx.js). Généré 100 % dans le navigateur avec
// pptxgenjs, chargé à la demande pour ne pas alourdir la page. Thème Clean Car
// Galsen, trois mises en page (couverture, contenu, clôture), cartes de
// chiffres, tableaux et graphiques natifs — tout reste modifiable dans
// PowerPoint. Le fichier est ensuite retouché avec JSZip pour écrire les
// couleurs de la marque dans le thème (pptxgenjs y laisse la palette Office).
import JSZip from 'jszip';

export const SLIDE_W = 13.333;
export const MX = 0.6;
export const CONTENT_W = SLIDE_W - MX * 2;
export const TOP = 1.85; // début de la zone de contenu, sous le titre et le sous-titre
export const BOTTOM = 6.65; // fin de la zone de contenu, au-dessus du pied de page

// Couleurs en hexadécimal (sans #) — les graphiques et quelques options de
// pptxgenjs n'acceptent que ce format.
export const HEX = {
  navy: '0B1F3A', text: '0F172A', white: 'FFFFFF', pale: 'EEF3FB', line: 'DCE3EE',
  muted: '64748B', mutedOnDark: 'B6C2D9', good: '059669', bad: 'DC2626',
  sky: '38BDF8', amber: 'F59E0B', green: '10B981', cyan: '06B6D4', violet: '8B5CF6', gray: 'CBD5E1',
};

const PPTX_MIME = 'application/vnd.openxmlformats-officedocument.presentationml.presentation';
const THEME_SLOTS = ['dk1', 'lt1', 'dk2', 'lt2', 'accent1', 'accent2', 'accent3', 'accent4', 'accent5', 'accent6', 'hlink', 'folHlink'];

// Espaces insécables dans les montants : « 26 » et « FCFA » ne sont jamais
// coupés sur deux lignes.
export const nb = (s) => String(s ?? '').replace(/ /g, ' ');

export const deltaText = (d) => (d == null ? '—' : nb(`${d >= 0 ? '+' : ''}${(d * 100).toFixed(0)} %`));
export function deltaTone(d, invert = false) {
  if (d == null || Math.abs(d) < 0.005) return 'flat';
  const good = invert ? d < 0 : d > 0;
  return good ? 'good' : 'bad';
}

export const dateFr = (d = new Date()) => d.toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' });

export const fileSlug = (s) => String(s || '')
  .normalize('NFD').replace(/[̀-ͯ]/g, '')
  .toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');

// Image (data URL ou URL publique) → PNG en base64 pour PowerPoint, qui ne lit
// pas toujours le WebP. Renvoie null si l'image est absente ou illisible : le
// bilan reste exportable sans logo ni cachet.
export async function loadImage(src) {
  if (!src) return null;
  try {
    const img = await new Promise((resolve, reject) => {
      const i = new Image();
      i.crossOrigin = 'anonymous';
      i.onload = () => resolve(i);
      i.onerror = reject;
      i.src = src;
    });
    const w = img.naturalWidth, h = img.naturalHeight;
    if (!w || !h) return null;
    const scale = Math.min(1, 700 / Math.max(w, h));
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(w * scale);
    canvas.height = Math.round(h * scale);
    canvas.getContext('2d').drawImage(img, 0, 0, canvas.width, canvas.height);
    return { data: canvas.toDataURL('image/png').replace(/^data:/, ''), ratio: w / h };
  } catch {
    return null;
  }
}

// Place une image dans une boîte en gardant ses proportions, centrée.
function fitBox(img, x, y, w, h) {
  let iw = w, ih = w / img.ratio;
  if (ih > h) { ih = h; iw = h * img.ratio; }
  return { x: x + (w - iw) / 2, y: y + (h - ih) / 2, w: iw, h: ih };
}

function themeXml(xml, name, colors) {
  const scheme = `<a:clrScheme name="${name}">`
    + THEME_SLOTS.map((k) => `<a:${k}><a:srgbClr val="${colors[k]}"/></a:${k}>`).join('')
    + '</a:clrScheme>';
  return xml
    .replace(/<a:clrScheme\b[\s\S]*?<\/a:clrScheme>/, () => scheme)
    .replace(/(<a:(?:theme|fontScheme)\b[^>]*?\bname=")[^"]*"/g, (_, head) => `${head}${name}"`);
}

export async function createDeck({ accent, title, footer }) {
  const { default: PptxGenJS } = await import('pptxgenjs');
  const pres = new PptxGenJS();
  pres.layout = 'LAYOUT_WIDE';
  pres.title = title;
  pres.author = 'Clean Car Galsen';
  pres.company = 'Clean Car Galsen';
  pres.theme = { headFontFace: 'Calibri', bodyFontFace: 'Calibri' };
  const C = pres.SchemeColor;
  const colors = {
    dk1: HEX.text, lt1: HEX.white, dk2: HEX.navy, lt2: HEX.pale,
    accent1: accent, accent2: HEX.sky, accent3: HEX.good, accent4: HEX.amber, accent5: HEX.bad, accent6: HEX.muted,
    hlink: accent, folHlink: HEX.muted,
  };
  const tone = { good: C.accent3, bad: C.accent5, flat: C.accent6 };
  const brand = await loadImage('/icons/icon-192.png');

  // ─── Mises en page ────────────────────────────────────────────────
  pres.defineSlideMaster({
    title: 'COUVERTURE',
    background: { color: C.text2 },
    objects: [
      { placeholder: { options: { name: 'title', type: 'title', x: MX, y: 2.75, w: 8.1, h: 1.5, fontSize: 40, bold: true, color: C.background1, align: 'left', valign: 'bottom', margin: 0 }, text: '' } },
      { placeholder: { options: { name: 'subtitle', type: 'body', x: MX, y: 4.4, w: 8.1, h: 0.6, fontSize: 22, color: C.background2, align: 'left', valign: 'top', margin: 0 }, text: '' } },
    ],
  });
  pres.defineSlideMaster({
    title: 'CONTENU',
    background: { color: C.background1 },
    objects: [
      { placeholder: { options: { name: 'title', type: 'title', x: MX, y: 0.42, w: CONTENT_W, h: 0.7, fontSize: 30, bold: true, color: C.text1, align: 'left', valign: 'top', margin: 0 }, text: '' } },
      { placeholder: { options: { name: 'subtitle', type: 'body', x: MX, y: 1.12, w: CONTENT_W, h: 0.45, fontSize: 15, color: C.accent6, align: 'left', valign: 'top', margin: 0 }, text: '' } },
      ...(brand ? [{ image: { x: MX, y: 6.93, w: 0.34, h: 0.34, data: brand.data } }] : []),
      { text: { text: footer, options: { x: MX + (brand ? 0.45 : 0), y: 6.95, w: 9.5, h: 0.3, fontSize: 10, color: C.accent6, margin: 0, valign: 'middle' } } },
    ],
    slideNumber: { x: SLIDE_W - MX - 0.8, y: 6.95, w: 0.8, h: 0.3, fontSize: 10, color: C.accent6, align: 'right', margin: 0, valign: 'middle' },
  });
  pres.defineSlideMaster({
    title: 'CLOTURE',
    background: { color: C.text2 },
    objects: [],
  });

  let section = null;
  let n = 0;
  const id = (s) => `${s} ${++n}`;

  const text = (slide, value, opts) => slide.addText(value, { isTextBox: true, margin: 0, objectName: id('Texte'), ...opts });
  const card = (slide, { x, y, w, h, fill = C.background2, name = 'Carte' }) => slide.addShape(pres.shapes.ROUNDED_RECTANGLE, {
    x, y, w, h, rectRadius: 0.12, fill: { color: fill }, line: { type: 'none' }, objectName: id(name),
  });

  const deck = {
    pres, C, brand, accent,

    section(name) { section = name; pres.addSection({ title: name }); },

    // Diapo de contenu : titre et sous-titre dans les zones de la mise en page.
    slide(titleText, subtitle) {
      const slide = pres.addSlide({ masterName: 'CONTENU', sectionTitle: section });
      slide.addText(titleText, { placeholder: 'title' });
      if (subtitle) slide.addText(subtitle, { placeholder: 'subtitle' });
      return slide;
    },

    cover({ kicker, name, period, lines = [], logo }) {
      const slide = pres.addSlide({ masterName: 'COUVERTURE', sectionTitle: section });
      if (brand) {
        card(slide, { x: MX, y: 0.6, w: 0.62, h: 0.62, fill: C.background1, name: 'Fond logo marque' });
        slide.addImage({ data: brand.data, ...fitBox(brand, MX + 0.06, 0.66, 0.5, 0.5), objectName: id('Logo marque') });
      }
      text(slide, 'CLEAN CAR GALSEN', { x: MX + (brand ? 0.82 : 0), y: 0.6, w: 5, h: 0.62, fontSize: 14, bold: true, color: C.accent2, charSpacing: 3, valign: 'middle' });
      text(slide, kicker, { x: MX, y: 2.2, w: 8.1, h: 0.45, fontSize: 18, bold: true, color: C.accent2, charSpacing: 2 });
      slide.addText(name, { placeholder: 'title' });
      slide.addText(period, { placeholder: 'subtitle' });
      if (lines.length) {
        text(slide, lines.filter(Boolean).map((l, i, arr) => ({ text: l, options: { breakLine: i < arr.length - 1 } })), {
          x: MX, y: 5.15, w: 8.1, h: 0.9, fontSize: 14, color: HEX.mutedOnDark, valign: 'top', paraSpaceAfter: 4,
        });
      }
      text(slide, `Édité le ${dateFr()}`, { x: MX, y: 6.55, w: 6, h: 0.35, fontSize: 12, color: HEX.mutedOnDark });
      const art = logo || brand;
      if (art) {
        card(slide, { x: 9.15, y: 1.75, w: 3.55, h: 3.55, fill: C.background1, name: 'Fond logo' });
        slide.addImage({ data: art.data, ...fitBox(art, 9.5, 2.1, 2.85, 2.85), objectName: id('Logo') });
      }
      return slide;
    },

    closing({ headline, lines = [], stamp, stampCaption }) {
      const slide = pres.addSlide({ masterName: 'CLOTURE', sectionTitle: section });
      text(slide, headline, { x: MX, y: 2.35, w: 7.9, h: 1.0, fontSize: 32, bold: true, color: C.background1, valign: 'bottom' });
      text(slide, lines.filter(Boolean).map((l, i, arr) => ({ text: l, options: { breakLine: i < arr.length - 1 } })), {
        x: MX, y: 3.5, w: 7.9, h: 1.6, fontSize: 16, color: HEX.mutedOnDark, valign: 'top', paraSpaceAfter: 6,
      });
      const art = stamp || brand;
      if (art) {
        card(slide, { x: 9.15, y: 1.85, w: 3.55, h: 3.55, fill: C.background1, name: 'Fond cachet' });
        slide.addImage({ data: art.data, ...fitBox(art, 9.5, 2.2, 2.85, 2.85), objectName: id(stamp ? 'Cachet' : 'Logo') });
        if (stamp && stampCaption) text(slide, stampCaption, { x: 9.15, y: 5.55, w: 3.55, h: 0.35, fontSize: 12, color: HEX.mutedOnDark, align: 'center' });
      }
      return slide;
    },

    // Carte de chiffre : libellé, valeur, unité, évolution vs période précédente.
    stat(slide, { x, y, w, h, label, value, unit, delta, invert = false, vs, size = 'lg', sub }) {
      card(slide, { x, y, w, h, name: `Carte ${label}` });
      const pad = 0.25;
      const big = size === 'lg';
      text(slide, label, { x: x + pad, y: y + 0.2, w: w - pad * 2, h: 0.36, fontSize: big ? 15 : 14, color: C.accent6, valign: 'top' });
      text(slide, nb(value), { x: x + pad, y: y + (big ? 0.6 : 0.55), w: w - pad * 2, h: big ? 0.7 : 0.55, fontSize: big ? 30 : 24, bold: true, color: C.text1, valign: 'middle', fit: 'shrink' });
      let next = y + (big ? 1.32 : 1.12);
      if (unit) {
        text(slide, unit, { x: x + pad, y: next, w: w - pad * 2, h: 0.3, fontSize: 12, color: C.accent6, valign: 'top' });
        next += 0.32;
      }
      if (sub) text(slide, sub, { x: x + pad, y: next, w: w - pad * 2, h: 0.3, fontSize: 12, color: C.accent6, valign: 'top' });
      if (delta != null) {
        const t = deltaTone(delta, invert);
        const py = y + h - 0.52;
        slide.addShape(pres.shapes.ROUNDED_RECTANGLE, {
          x: x + pad, y: py, w: 0.95, h: 0.32, rectRadius: 0.16,
          fill: { color: tone[t], transparency: 85 }, line: { type: 'none' }, objectName: id('Pastille évolution'),
        });
        text(slide, deltaText(delta), { x: x + pad, y: py, w: 0.95, h: 0.32, fontSize: 12, bold: true, color: tone[t], align: 'center', valign: 'middle' });
        if (vs) text(slide, `vs ${vs}`, { x: x + pad + 1.05, y: py - 0.06, w: w - pad * 2 - 1.05, h: 0.44, fontSize: 10, color: C.accent6, valign: 'middle' });
      }
    },

    // Encadré latéral : quelques chiffres empilés qui commentent le graphique.
    panel(slide, { x, y, w, h, items }) {
      card(slide, { x, y, w, h, name: 'Encadré' });
      const pad = 0.3;
      const slot = (h - pad * 2) / items.length;
      items.forEach((it, i) => {
        const iy = y + pad + i * slot;
        text(slide, it.label, { x: x + pad, y: iy, w: w - pad * 2, h: 0.32, fontSize: 13, color: C.accent6, valign: 'top' });
        text(slide, nb(it.value), { x: x + pad, y: iy + 0.32, w: w - pad * 2, h: 0.5, fontSize: 22, bold: true, color: it.tone ? tone[it.tone] : C.text1, valign: 'middle', fit: 'shrink' });
        if (it.sub) text(slide, it.sub, { x: x + pad, y: iy + 0.84, w: w - pad * 2, h: 0.3, fontSize: 12, color: C.accent6, valign: 'top' });
      });
    },

    empty(slide, { x = MX, y = TOP, w = CONTENT_W, h = BOTTOM - TOP, label = 'Aucune donnée sur cette période.' } = {}) {
      card(slide, { x, y, w, h, name: 'Aucune donnée' });
      text(slide, label, { x, y, w, h, fontSize: 18, italic: true, color: C.accent6, align: 'center', valign: 'middle' });
    },

    note(slide, value, { x = MX, y, w = CONTENT_W, h = 0.6 }) {
      text(slide, value, { x, y, w, h, fontSize: 12, italic: true, color: C.accent6, valign: 'top' });
    },

    // Tableau : en-tête à la couleur du thème, lignes alternées.
    table(slide, { x = MX, y = TOP, w, colW, header, rows, fontSize = 14, rowH = 0.46, align = [] }) {
      const border = () => [{ type: 'none' }, { type: 'none' }, { type: 'solid', pt: 0.75, color: HEX.line }, { type: 'none' }];
      const cell = (v, opts) => (v && typeof v === 'object' && !Array.isArray(v) ? { text: v.text, options: { ...opts, ...v.options } } : { text: nb(v), options: opts });
      const head = header.map((v, c) => ({
        text: v,
        options: { bold: true, color: C.background1, fill: { color: C.accent1 }, align: align[c] || 'left', fontSize: fontSize - 1, valign: 'middle', border: border() },
      }));
      const body = rows.map((r, i) => r.map((v, c) => cell(v, {
        color: C.text1, fill: { color: i % 2 ? C.background2 : C.background1 }, align: align[c] || 'left', valign: 'middle', border: border(),
      })));
      slide.addTable([head, ...body], {
        x, y, w, colW, rowH, fontSize, margin: [0.04, 0.12, 0.04, 0.12], autoPage: false, objectName: id('Tableau'),
      });
    },

    // Graphiques natifs (modifiables dans PowerPoint). Les couleurs y sont en hex.
    chart(slide, type, data, opts) {
      slide.addChart(pres.charts[type], data, {
        catAxisLabelColor: HEX.muted, valAxisLabelColor: HEX.muted,
        catAxisLabelFontSize: 12, valAxisLabelFontSize: 11,
        catAxisLabelFontFace: '+mn-lt', valAxisLabelFontFace: '+mn-lt',
        dataLabelFontFace: '+mn-lt', dataLabelFontSize: 11, dataLabelColor: HEX.text,
        legendFontFace: '+mn-lt', legendFontSize: 12, legendColor: HEX.text,
        valGridLine: { color: HEX.line, size: 0.75 }, catGridLine: { style: 'none' },
        catAxisLineShow: false, valAxisLineShow: false,
        objectName: id('Graphique'),
        ...opts,
      });
    },

    // Barres d'une seule série, triées, valeurs affichées au bout.
    bars(slide, { x, y, w, h, items, color, horizontal = true, format = '#,##0', labelSize = 12 }) {
      deck.chart(slide, 'BAR', [{ name: 'Valeur', labels: items.map((i) => i.label), values: items.map((i) => i.value) }], {
        x, y, w, h, barDir: horizontal ? 'bar' : 'col', chartColors: [color],
        catAxisOrientation: horizontal ? 'maxMin' : 'minMax',
        valAxisHidden: true, valGridLine: { style: 'none' },
        showValue: true, dataLabelPosition: 'outEnd', dataLabelFormatCode: `${format};-${format};;`, dataLabelFontSize: labelSize,
        catAxisLabelFontSize: labelSize, barGapWidthPct: 60, showLegend: false,
      });
    },

    // Anneau + total au centre.
    donut(slide, { x, y, w, h, items, centerValue, centerLabel }) {
      deck.chart(slide, 'DOUGHNUT', [{ name: 'Répartition', labels: items.map((i) => i.label), values: items.map((i) => i.value) }], {
        x, y, w, h, holeSize: 62, chartColors: items.map((i) => i.color),
        showPercent: true, showValue: false, showLabel: false, showLegend: false,
        dataLabelColor: HEX.white, dataLabelFontSize: 12, dataBorder: { pt: 1.5, color: HEX.white },
      });
      if (centerValue != null) {
        const cw = Math.min(w, h) * 0.5;
        text(slide, [
          { text: nb(centerValue), options: { fontSize: 20, bold: true, color: C.text1, breakLine: true } },
          { text: centerLabel || '', options: { fontSize: 12, color: C.accent6 } },
        ], { x: x + (w - cw) / 2, y: y + h / 2 - 0.45, w: cw, h: 0.9, align: 'center', valign: 'middle', fit: 'shrink' });
      }
    },

    // Légende d'un anneau sous forme de tableau : pastille de couleur, libellé, montant, part.
    legendTable(slide, { x, y, w, items, total, labelHeader = '', valueHeader = 'Montant', format }) {
      const fmt = format || ((v) => v);
      deck.table(slide, {
        x, y, w,
        colW: [0.4, w - 0.4 - 2.0 - 1.0, 2.0, 1.0],
        header: ['', labelHeader, valueHeader, 'Part'],
        align: ['center', 'left', 'right', 'right'],
        rows: items.map((i) => [
          { text: '●', options: { color: i.color, fontSize: 16 } },
          i.label,
          fmt(i.value),
          total > 0 ? `${Math.round((i.value / total) * 100)} %` : '—',
        ]),
        rowH: 0.44,
      });
    },

    async save(fileName) {
      const buf = await pres.write({ outputType: 'arraybuffer' });
      const zip = await JSZip.loadAsync(buf);
      const part = 'ppt/theme/theme1.xml';
      const file = zip.file(part);
      if (file) zip.file(part, themeXml(await file.async('string'), 'Clean Car Galsen', colors));
      const blob = await zip.generateAsync({ type: 'blob', mimeType: PPTX_MIME, compression: 'DEFLATE' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = fileName;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 10000);
    },
  };
  return deck;
}
