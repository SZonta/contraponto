import { useEffect, useRef, useState } from 'react';
import { Dialog } from './Dialog';

export type ViewedImage = { src: string; alt: string };

const MIN_ZOOM = 0.1;
const MAX_ZOOM = 20;

/** Full-window image: wheel zooms toward the pointer, drag moves, double click toggles fit / 100%. */
export function ImageViewer({ image, onClose }: { image: ViewedImage; onClose: () => void }) {
  const [zoom, setZoom] = useState(1);
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const [natural, setNatural] = useState<{ width: number; height: number } | null>(null);
  const drag = useRef<{ x: number; y: number } | null>(null);
  const stage = useRef<HTMLDivElement>(null);

  const fit = () => {
    if (!natural || !stage.current) return;
    const { clientWidth, clientHeight } = stage.current;
    setZoom(Math.min(1, (clientWidth * 0.95) / natural.width, (clientHeight * 0.95) / natural.height));
    setOffset({ x: 0, y: 0 });
  };

  useEffect(fit, [natural]);
  useEffect(() => { window.addEventListener('resize', fit); return () => window.removeEventListener('resize', fit); });

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === '+' || event.key === '=') setZoom((value) => Math.min(MAX_ZOOM, value * 1.25));
      if (event.key === '-') setZoom((value) => Math.max(MIN_ZOOM, value / 1.25));
      if (event.key === '0') fit();
      if (event.key.startsWith('Arrow')) {
        event.preventDefault();
        setOffset((value) => ({ x: value.x + (event.key === 'ArrowLeft' ? 32 : event.key === 'ArrowRight' ? -32 : 0), y: value.y + (event.key === 'ArrowUp' ? 32 : event.key === 'ArrowDown' ? -32 : 0) }));
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  // Zooms keeping the point under the cursor in place.
  const onWheel = (event: React.WheelEvent) => {
    const rect = stage.current!.getBoundingClientRect();
    const pointer = { x: event.clientX - rect.left - rect.width / 2, y: event.clientY - rect.top - rect.height / 2 };
    const next = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, zoom * (event.deltaY < 0 ? 1.15 : 1 / 1.15)));
    const ratio = next / zoom;
    setOffset({ x: pointer.x - (pointer.x - offset.x) * ratio, y: pointer.y - (pointer.y - offset.y) * ratio });
    setZoom(next);
  };

  return (
    <Dialog title={image.alt || 'Imagem do chat'} onClose={onClose} fullscreen>
      <div className="flex shrink-0 flex-wrap items-center gap-2 border-b border-line px-4 py-2 text-sm">
        <span className="min-w-0 flex-1 text-xs text-muted">Arraste para mover · + / − para zoom · setas para mover</span>
        <span className="w-14 text-right text-muted" aria-live="polite">{Math.round(zoom * 100)}%</span>
        <button aria-label="Diminuir zoom" title="Diminuir (-)" onClick={() => setZoom((value) => Math.max(MIN_ZOOM, value / 1.25))} className="rounded bg-raised px-2.5 py-1 hover:bg-line">
          −
        </button>
        <button aria-label="Aumentar zoom" title="Aumentar (+)" onClick={() => setZoom((value) => Math.min(MAX_ZOOM, value * 1.25))} className="rounded bg-raised px-2.5 py-1 hover:bg-line">
          +
        </button>
        <button title="Ajustar à tela (0)" onClick={fit} className="rounded bg-raised px-2.5 py-1 hover:bg-line">
          Ajustar
        </button>
        <button title="Tamanho real" onClick={() => { setZoom(1); setOffset({ x: 0, y: 0 }); }} className="rounded bg-raised px-2.5 py-1 hover:bg-line">
          100%
        </button>
      </div>
      <div
        ref={stage}
        className={`relative flex-1 overflow-hidden ${drag.current ? 'cursor-grabbing' : 'cursor-grab'}`}
        onClick={(event) => event.stopPropagation()}
        onWheel={onWheel}
        onMouseDown={(event) => {
          drag.current = { x: event.clientX - offset.x, y: event.clientY - offset.y };
        }}
        onMouseMove={(event) => {
          if (drag.current) setOffset({ x: event.clientX - drag.current.x, y: event.clientY - drag.current.y });
        }}
        onMouseUp={() => (drag.current = null)}
        onMouseLeave={() => (drag.current = null)}
        onDoubleClick={() => (zoom < 1 ? (setZoom(1), setOffset({ x: 0, y: 0 })) : fit())}
      >
        <img
          src={image.src}
          alt={image.alt}
          draggable={false}
          onLoad={(event) => setNatural({ width: event.currentTarget.naturalWidth, height: event.currentTarget.naturalHeight })}
          className="absolute top-1/2 left-1/2 max-w-none select-none"
          style={{
            transform: `translate(calc(-50% + ${offset.x}px), calc(-50% + ${offset.y}px)) scale(${zoom})`,
            imageRendering: zoom >= 2 ? 'pixelated' : 'auto',
          }}
        />
      </div>
    </Dialog>
  );
}
