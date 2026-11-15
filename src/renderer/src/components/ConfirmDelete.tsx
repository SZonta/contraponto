import { useState } from 'react';
import { readableError } from '../ux';
import { Dialog } from './Dialog';

export function ConfirmDelete({ title, name, description, button, onConfirm, onClose }: {
  title: string; name: string; description: string; button: string; onConfirm: () => Promise<void>; onClose: () => void;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const confirm = async () => {
    setBusy(true); setError(null);
    try { await onConfirm(); onClose(); }
    catch (reason) { setError(readableError(reason)); setBusy(false); }
  };
  return <Dialog title={title} onClose={onClose} footer={<>
    <button onClick={onClose} className="secondary-button">Cancelar</button>
    <button disabled={busy} onClick={() => void confirm()} className="rounded border border-red-400 bg-red-950/40 px-4 py-2 font-semibold text-red-200">{busy ? 'Apagando…' : button}</button>
  </>}>
    <p className="break-words font-semibold">{name}</p>
    <p className="mt-3 text-sm leading-relaxed text-muted">{description}</p>
    {error && <p role="alert" className="mt-3 text-sm text-red-200">{error}</p>}
  </Dialog>;
}
