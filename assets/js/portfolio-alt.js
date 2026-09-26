export const STYLES = [
  ['blackwork', 'blackwork'], ['fine-line', 'linework / fine line'],
  ['illustrative', 'ilustracyjny'], ['lettering', 'napis / tekst'],
  ['art-nouveau', 'art nouveau / secesja'], ['abstract', 'abstrakcja'],
  ['ornamental', 'ornamentalny'], ['geometric', 'geometryczny'],
  ['dotwork', 'dotwork'], ['minimalist', 'minimalistyczny'], ['realism', 'realizm'],
];
export const BODY_PARTS = [
  ['hand', 'Dłoń', 'na dłoni'], ['forearm', 'Przedramię', 'na przedramieniu'],
  ['upper-arm', 'Ramię', 'na ramieniu'], ['shoulder', 'Bark', 'na barku'],
  ['chest', 'Klatka piersiowa', 'na klatce piersiowej'], ['back', 'Plecy', 'na plecach'],
  ['ribs', 'Żebra', 'na żebrach'], ['abdomen', 'Brzuch', 'na brzuchu'],
  ['thigh', 'Udo', 'na udzie'], ['knee', 'Kolano', 'na kolanie'],
  ['calf', 'Łydka', 'na łydce'], ['foot', 'Stopa', 'na stopie'], ['neck', 'Szyja', 'na szyi'],
];
export function buildAlt(details, kind = details.kind) {
  const motif = String(details.motif || '').trim().replace(/[.,;\s]+$/, '');
  if (!motif) return '';
  const style = STYLES.find(([id]) => id === details.style)?.[1];
  const placement = kind === 'done' ? BODY_PARTS.find(([id]) => id === details.bodyPart)?.[2] : null;
  const parts = [kind === 'free' ? `Projekt tatuażu: ${motif}` : `Tatuaż: ${motif}`];
  if (style) parts.push(`styl ${style}`);
  if (placement) parts.push(placement);
  return `${parts.join(', ')} – ${kind === 'free' ? 'wolny wzór' : 'realizacja'} Lexie Tattoo Warszawa Mokotów`;
}
export function syncGeneratedAlt(item, kind) {
  if (item.altDetails?.mode !== 'generated') return;
  if (kind) item.altDetails.kind = kind;
  item.alt = buildAlt(item.altDetails);
}
export function validateAltDetails(details) {
  if (details == null) return;
  if (!details || !['manual', 'generated'].includes(details.mode) ||
      !['free', 'done'].includes(details.kind) || typeof details.motif !== 'string' ||
      typeof details.style !== 'string' || typeof details.bodyPart !== 'string' ||
      (details.style && !STYLES.some(([id]) => id === details.style)) ||
      (details.bodyPart && !BODY_PARTS.some(([id]) => id === details.bodyPart))) {
    throw new Error('Nieprawidłowe ustawienia kreatora opisu.');
  }
}
export function initialAltDetails(item, kind) {
  if (item.altDetails) return { ...item.altDetails, kind: kind || item.altDetails.kind };
  // Preserve existing descriptions verbatim in manual mode. The suggested motif
  // only removes the old signature, and is used after explicitly choosing the builder.
  const motif = (item.alt || '').replace(/(?:[,\s–—-]*(?:wolny wzór|realizacja))?\s*Lexie Tattoo Warszawa Mokotów\s*$/i, '').replace(/^(?:Projekt tatuażu|Tatuaż)[:\s]*/i, '').trim();
  return { mode: item.alt?.trim() ? 'manual' : 'generated', kind: kind || 'done', motif, style: '', bodyPart: '' };
}
