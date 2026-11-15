import { useEffect, useId, useRef } from 'react';
import { createPortal } from 'react-dom';

/** One focus boundary shared by settings, schedules and the image viewer. */
export function Dialog({ title, children, footer, onClose, wide = false, fullscreen = false }: {
  title: string; children: React.ReactNode; footer?: React.ReactNode; onClose: () => void; wide?: boolean; fullscreen?: boolean;
}) {
  const titleId = useId();
  const container = useRef<HTMLElement>(null);
  const close = useRef(onClose);
  close.current = onClose;
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    const root = document.getElementById('root');
    const wasInert = root?.inert ?? false;
    if (root) root.inert = true;
    const focusable = () => Array.from(container.current!.querySelectorAll<HTMLElement>(
      'button:not(:disabled),input:not(:disabled),select:not(:disabled),textarea:not(:disabled),summary,a[href],[tabindex="0"]',
    )).filter((element) => element.getClientRects().length > 0);
    (focusable()[0] ?? container.current)?.focus();
    const handle = (event: KeyboardEvent) => {
      if (event.key === 'Escape') { event.preventDefault(); close.current(); }
      if (event.key === 'Tab') {
        const list = focusable();
        if (!list.length) { event.preventDefault(); return; }
        if (event.shiftKey && (document.activeElement === list[0] || document.activeElement === container.current)) {
          event.preventDefault(); list.at(-1)!.focus();
        } else if (!event.shiftKey && document.activeElement === list.at(-1)) {
          event.preventDefault(); list[0].focus();
        }
      }
    };
    document.addEventListener('keydown', handle);
    return () => {
      document.removeEventListener('keydown', handle);
      if (root) root.inert = wasInert;
      if (previous?.isConnected) previous.focus();
      else document.getElementById('conversation')?.focus();
    };
  }, []);
  return createPortal(
    <div className={`dialog-backdrop ${fullscreen ? 'dialog-fullscreen' : ''}`}>
      <section ref={container} role="dialog" aria-modal="true" aria-labelledby={titleId} tabIndex={-1}
        className={`dialog-panel ${wide ? 'dialog-wide' : ''}`} onClick={(event) => event.stopPropagation()}>
        <header className="dialog-heading">
          <h2 id={titleId} className="min-w-0 flex-1 truncate text-base font-semibold">{title}</h2>
          <button type="button" onClick={onClose} aria-label={`Fechar ${title}`} title="Fechar (Esc)" className="icon-button">✕</button>
        </header>
        <div className="dialog-content">{children}</div>
        {footer && <footer className="dialog-footer">{footer}</footer>}
      </section>
    </div>, document.body,
  );
}
