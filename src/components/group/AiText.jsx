import React from 'react';

// Rendu du texte de l'IA (Markdown minimal : titres « ## », puces « - », gras
// « ** »). Fabriqué en éléments React — jamais de dangerouslySetInnerHTML :
// le texte vient d'un modèle, il ne doit pas pouvoir injecter de balises.
function inline(text, keyPrefix) {
  return String(text).split(/(\*\*[^*]+\*\*)/g).map((part, i) => (
    /^\*\*[^*]+\*\*$/.test(part)
      ? <strong key={`${keyPrefix}-${i}`} className="text-white font-semibold">{part.slice(2, -2)}</strong>
      : <React.Fragment key={`${keyPrefix}-${i}`}>{part}</React.Fragment>
  ));
}

export default function AiText({ text, className = '' }) {
  const blocks = [];
  let list = null;
  String(text || '').split(/\r?\n/).forEach((raw, idx) => {
    const line = raw.trim();
    const li = /^[-*]\s+(.*)$/.exec(line);
    if (li) {
      if (!list) { list = []; blocks.push({ type: 'ul', items: list, key: idx }); }
      list.push(li[1]);
      return;
    }
    list = null;
    const h = /^#{1,4}\s+(.*)$/.exec(line);
    if (h) blocks.push({ type: 'h', text: h[1], key: idx });
    else if (line) blocks.push({ type: 'p', text: line, key: idx });
  });

  return (
    <div className={`text-sm text-neutral-300 leading-relaxed ${className}`}>
      {blocks.map((b) => {
        if (b.type === 'h') return <h4 key={b.key} className="text-emerald-400 font-bold text-base mt-5 mb-2 first:mt-0">{inline(b.text, b.key)}</h4>;
        if (b.type === 'ul') {
          return (
            <ul key={b.key} className="list-disc pl-5 space-y-1.5 my-2 marker:text-emerald-500">
              {b.items.map((it, i) => <li key={i}>{inline(it, `${b.key}-${i}`)}</li>)}
            </ul>
          );
        }
        return <p key={b.key} className="my-2">{inline(b.text, b.key)}</p>;
      })}
    </div>
  );
}
