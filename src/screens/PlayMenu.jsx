// The menu that unfolds out of the arrow next to «Играть»: memory for the next launch and the
// places a player reaches for right before playing. It grows from the arrow's corner and folds
// back into it on close.
import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { Icon } from '../ds/index.js';
import { systemInfo } from '../native.js';

const CLOSE_MS = 170;
const RAM_CHOICES = [4, 6, 8];

/**
 * open · onClose · ram: GB for this realm, 0 = auto · onRam(gb) ·
 * actions: [{ id, icon, label, hint, run }] — the menu closes after one runs.
 */
export function PlayMenu({ open, onClose, ram, onRam, actions }) {
  const [shown, setShown] = useState(open);
  const [total, setTotal] = useState(null);
  const [up, setUp] = useState(false);
  const ref = useRef(null);

  // Opens upward when a short window has no room below — decided before the first frame.
  useLayoutEffect(() => {
    if (!open || !shown || !ref.current) return;
    const anchor = ref.current.parentElement.getBoundingClientRect();
    setUp(anchor.bottom + 14 + ref.current.offsetHeight > window.innerHeight - 8);
  }, [open, shown]);

  // Stay mounted for the closing animation.
  useEffect(() => {
    if (open) { setShown(true); return undefined; }
    const t = setTimeout(() => setShown(false), CLOSE_MS);
    return () => clearTimeout(t);
  }, [open]);

  useEffect(() => {
    if (!open || !shown) return undefined;
    if (total === null) systemInfo().then((s) => setTotal(s ? Math.floor(s.memory_gb) : 0)).catch(() => setTotal(0));
    // Keyboard users start on the chosen memory; a mouse click doesn't show a focus ring for it.
    const first = ref.current && (ref.current.querySelector('[aria-checked=true]') || ref.current.querySelector('[role=menuitem]'));
    if (first) first.focus({ preventScroll: true });
    const outside = (e) => { if (!e.target.closest('.play-menu, .lm-play-menu')) onClose(); };
    const keys = (e) => {
      if (e.key === 'Escape') { e.stopPropagation(); onClose(true); return; }
      if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp') return;
      e.preventDefault();
      const all = [...ref.current.querySelectorAll('[role=menuitemradio], [role=menuitem]')];
      const i = all.indexOf(document.activeElement);
      all[(i + (e.key === 'ArrowDown' ? 1 : -1) + all.length) % all.length].focus();
    };
    document.addEventListener('pointerdown', outside);
    window.addEventListener('keydown', keys, true);
    return () => { document.removeEventListener('pointerdown', outside); window.removeEventListener('keydown', keys, true); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, shown]);

  if (!shown) return null;
  // Only sizes that leave the system 2 GB; a size set on the slider in Settings shows up too.
  const fits = (gb) => !total || gb <= total - 2;
  const choices = [0, ...RAM_CHOICES.filter(fits)];
  if (ram && !choices.includes(ram)) choices.push(ram);
  choices.sort((a, b) => a - b);
  let i = 0;

  return (
    <div ref={ref} className={'play-menu' + (up ? ' is-up' : '') + (open ? '' : ' is-closing')} role="menu" aria-label="Перед игрой">
      <span className="play-menu-notch" aria-hidden="true" />
      <div className="play-menu-ram" style={{ '--i': i++ }}>
        <span className="overline">Память для игры</span>
        <div className="play-menu-chips" role="group" aria-label="Память для игры">
          {choices.map((gb) => (
            <button key={gb} type="button" role="menuitemradio" aria-checked={ram === gb} className={'play-menu-chip' + (ram === gb ? ' is-on' : '')} onClick={() => onRam(gb)}>
              {gb ? gb + ' ГБ' : 'Авто'}
            </button>
          ))}
        </div>
      </div>
      <div className="play-menu-list">
        {actions.map((a) => (
          <button key={a.id} type="button" role="menuitem" className="play-menu-item" style={{ '--i': i++ }} onClick={() => { onClose(); a.run(); }}>
            <span className="play-menu-icon"><Icon name={a.icon} size={16} /></span>
            <span className="play-menu-text"><span className="play-menu-label">{a.label}</span>{a.hint ? <span className="play-menu-hint">{a.hint}</span> : null}</span>
            <Icon name="chevron-right" size={12} className="play-menu-go" />
          </button>
        ))}
      </div>
    </div>
  );
}
