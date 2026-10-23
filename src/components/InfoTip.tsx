import { Info } from 'lucide-react';
import type { MouseEvent } from 'react';

// An ⓘ that explains the thing next to it on hover or focus. It often sits inside clickable cards,
// so clicking it must not also pick the card.
export function InfoTip({ text, size = 13 }: { text?: string; size?: number }) {
  if (!text) return null;
  const swallow = (event: MouseEvent) => { event.preventDefault(); event.stopPropagation(); };
  return <span className="info-tip" tabIndex={0} role="img" aria-label={text} data-tip={text} onClick={swallow} onMouseDown={swallow}>
    <Info size={size} strokeWidth={1.8} />
  </span>;
}
