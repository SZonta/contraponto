import { useCallback, useEffect, useState } from 'react';
import type { AgentId, AppSettings } from '@shared/types';
import { api } from '../lib';
import { readableError } from '../ux';
import { Dialog } from './Dialog';

export function SettingsModal({ onClose }: { onClose: () => void }) {
  const [settings, setSettings] = useState<AppSettings | null>(null);
  const [desktop, setDesktop] = useState<{ startWithWindows: boolean; packaged: boolean } | null>(null);
  const [newType, setNewType] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const load = useCallback(async () => {
    setLoading(true); setError(null);
    try { const [next, system] = await Promise.all([api.getSettings(), api.getDesktopSettings()]); setSettings(next); setDesktop(system); }
    catch (reason) { setError(readableError(reason)); } finally { setLoading(false); }
  }, []);
  useEffect(() => { void load(); }, [load]);
  const save = async () => {
    if (!settings) return;
    if (!Number.isFinite(settings.quotaSwitch.threshold) || settings.quotaSwitch.threshold < 1 || settings.quotaSwitch.threshold > 100) {
      setError('Informe um limite de uso entre 1 e 100%.'); return;
    }
    setSaving(true); setError(null);
    try { await api.updateSettings(settings); if (desktop?.packaged) await api.setStartWithWindows(desktop.startWithWindows); onClose(); }
    catch (reason) { setError(readableError(reason)); } finally { setSaving(false); }
  };
  return <Dialog title="Configurações" onClose={onClose} footer={<>
    <button onClick={onClose} className="secondary-button">Cancelar</button>
    <button onClick={() => void save()} disabled={!settings || loading || saving} className="primary-button disabled:opacity-40">{saving ? 'Salvando…' : 'Salvar'}</button>
  </>}>
    {loading && <p role="status" className="py-6 text-center text-muted">Carregando configurações…</p>}
    {error && <div role="alert" className="mb-4 rounded border border-red-700 bg-red-950/30 p-3 text-sm text-red-200">{error}{!settings && <button onClick={() => void load()} className="ml-2 underline">Tentar novamente</button>}</div>}
    {settings && !loading && <div className="flex flex-col gap-6">
      <fieldset><legend className="text-sm font-semibold">Windows e bandeja</legend>
        <label className="mt-3 flex items-center gap-3 text-sm"><input type="checkbox" checked={desktop?.startWithWindows ?? false} disabled={!desktop?.packaged}
          onChange={(event) => desktop && setDesktop({ ...desktop, startWithWindows: event.target.checked })} />Iniciar com o Windows</label>
        <p className="mt-2 text-xs leading-relaxed text-muted">{desktop?.packaged ? 'Fechar a janela mantém o app na bandeja. Para encerrar, use Sair.' : 'Disponível no app instalado. Em desenvolvimento, fechar a janela também mantém o app na bandeja.'}</p>
      </fieldset>
      <fieldset><legend className="text-sm font-semibold">Quem faz o quê no Automático</legend>
        <p className="mt-2 text-xs leading-relaxed text-muted">O Claude lidera. Escolha quais tarefas ele deve passar ao Codex.</p>
        <div className="mt-3 flex flex-col gap-2">{settings.routingRules.map((rule, index) => <div key={`${rule.taskType}-${index}`} className="flex items-center gap-2">
          <span className="min-w-0 flex-1 text-sm">{rule.taskType}</span>
          <select aria-label={`Agente para ${rule.taskType}`} value={rule.agent} onChange={(event) => setSettings({ ...settings, routingRules: settings.routingRules.map((item, position) => position === index ? { ...item, agent: event.target.value as AgentId } : item) })} className="rounded border bg-ink px-2 text-xs">
            <option value="claude">Claude</option><option value="codex">Codex</option>
          </select>
          <button aria-label={`Remover regra ${rule.taskType}`} onClick={() => setSettings({ ...settings, routingRules: settings.routingRules.filter((_, position) => position !== index) })} className="icon-button">×</button>
        </div>)}</div>
        <form className="mt-3 flex gap-2" onSubmit={(event) => {
          event.preventDefault(); if (!newType.trim()) return;
          setSettings({ ...settings, routingRules: [...settings.routingRules, { taskType: newType.trim(), agent: 'claude' }] }); setNewType('');
        }}><input aria-label="Novo tipo de tarefa" value={newType} onChange={(event) => setNewType(event.target.value)} placeholder="Novo tipo de tarefa" className="min-w-0 flex-1 rounded border bg-ink px-3 text-sm" /><button className="secondary-button text-sm">Adicionar</button></form>
      </fieldset>
      <fieldset><legend className="text-sm font-semibold">Troca por cota</legend>
        <label className="mt-3 flex items-center gap-3 text-sm"><input type="checkbox" checked={settings.quotaSwitch.enabled} onChange={(event) => setSettings({ ...settings, quotaSwitch: { ...settings.quotaSwitch, enabled: event.target.checked } })} />Trocar de IA quando a cota estiver alta</label>
        <label className="mt-3 flex items-center gap-3 text-sm">Limite de uso (%)<input aria-label="Limite de uso em porcentagem" type="number" min={1} max={100} step={1} disabled={!settings.quotaSwitch.enabled} value={settings.quotaSwitch.threshold}
          onChange={(event) => setSettings({ ...settings, quotaSwitch: { ...settings.quotaSwitch, threshold: Number(event.target.value) } })} className="w-20 rounded border bg-ink px-2" /></label>
        <p className="mt-2 text-xs leading-relaxed text-muted">Só no Automático. Vale para as cotas de 5h e da semana. A escolha manual de Claude ou Codex continua valendo.</p>
      </fieldset>
    </div>}
  </Dialog>;
}
