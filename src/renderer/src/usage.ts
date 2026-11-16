import type { UsageWindow } from '@shared/types';

export function quotaPercent(window: UsageWindow | null | undefined): number | null {
  return window && Number.isFinite(window.usedPercent) ? Math.round(Math.max(0, Math.min(100, window.usedPercent))) : null;
}

export function quotaReset(window: UsageWindow | null | undefined, now: number): string {
  if (!window) return 'Uso não informado';
  if (!window.resetsAt || !Number.isFinite(window.resetsAt)) return 'Renovação não informada';
  if (window.resetsAt <= now) return 'Aguardando atualização';
  const minutes = Math.ceil((window.resetsAt - now) / 60000);
  const hours = Math.floor(minutes / 60);
  if (!hours) return 'Renova em ' + minutes + ' min';
  if (hours < 24) return 'Renova em ' + hours + 'h' + (minutes % 60 ? ' ' + minutes % 60 + 'min' : '');
  return 'Renova em ' + Math.floor(hours / 24) + 'd' + (hours % 24 ? ' ' + hours % 24 + 'h' : '');
}

export function quotaResetDate(window: UsageWindow | null | undefined): string | null {
  if (!window?.resetsAt || !Number.isFinite(window.resetsAt)) return null;
  return new Intl.DateTimeFormat('pt-BR', { weekday: 'short', day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }).format(window.resetsAt);
}
