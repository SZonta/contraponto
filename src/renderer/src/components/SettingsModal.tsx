import { useEffect, useState } from 'react';
import type { AgentId, AppSettings } from '@shared/types';
import { api } from '../lib';

export function SettingsModal({ onClose }: { onClose: () => void }) {
  const [settings, setSettings] = useState<AppSettings | null>(null);
  const [newType, setNewType] = useState('');

  useEffect(() => {
    void api.getSettings().then(setSettings);
  }, []);

  if (!settings) return null;

  const setRule = (index: number, agent: AgentId) =>
    setSettings({ ...settings, routingRules: settings.routingRules.map((rule, i) => (i === index ? { ...rule, agent } : rule)) });

  const save = async () => {
    await api.updateSettings(settings);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-10 flex items-center justify-center bg-black/60" onClick={onClose}>
      <div className="max-h-[85vh] w-[560px] overflow-y-auto rounded-lg border border-line bg-panel p-5" onClick={(event) => event.stopPropagation()}>
        <h2 className="text-base font-semibold">Configurações</h2>

        <h3 className="mt-5 text-sm font-semibold">Quem faz o quê no modo Automático</h3>
        <p className="mt-1 text-xs text-muted">O Claude lidera e passa ao Codex os tipos de tarefa marcados com Codex. O que não estiver na tabela, o Claude decide.</p>
        <div className="mt-3 flex flex-col gap-1.5">
          {settings.routingRules.map((rule, index) => (
            <div key={`${rule.taskType}-${index}`} className="flex items-center gap-2">
              <span className="flex-1 truncate">{rule.taskType}</span>
              <select
                value={rule.agent}
                onChange={(event) => setRule(index, event.target.value as AgentId)}
                className="rounded border border-line bg-ink px-2 py-1 text-xs"
              >
                <option value="claude">Claude</option>
                <option value="codex">Codex</option>
              </select>
              <button
                title="Remover"
                onClick={() => setSettings({ ...settings, routingRules: settings.routingRules.filter((_, i) => i !== index) })}
                className="px-1 text-muted hover:text-red-400"
              >
                ×
              </button>
            </div>
          ))}
          <form
            className="mt-1 flex gap-2"
            onSubmit={(event) => {
              event.preventDefault();
              if (!newType.trim()) return;
              setSettings({ ...settings, routingRules: [...settings.routingRules, { taskType: newType.trim(), agent: 'claude' }] });
              setNewType('');
            }}
          >
            <input
              value={newType}
              onChange={(event) => setNewType(event.target.value)}
              placeholder="Novo tipo de tarefa"
              className="flex-1 rounded border border-line bg-ink px-2 py-1 text-sm outline-none"
            />
            <button className="rounded bg-raised px-3 py-1 text-sm hover:bg-line">Adicionar</button>
          </form>
        </div>

        <h3 className="mt-6 text-sm font-semibold">Troca por cota</h3>
        <label className="mt-2 flex items-center gap-2">
          <input
            type="checkbox"
            checked={settings.quotaSwitch.enabled}
            onChange={(event) => setSettings({ ...settings, quotaSwitch: { ...settings.quotaSwitch, enabled: event.target.checked } })}
          />
          <span>No modo Automático, passar o trabalho para a outra IA quando uma passar de</span>
          <input
            type="number"
            min={1}
            max={100}
            value={settings.quotaSwitch.threshold}
            onChange={(event) =>
              setSettings({ ...settings, quotaSwitch: { ...settings.quotaSwitch, threshold: Number(event.target.value) } })
            }
            className="w-16 rounded border border-line bg-ink px-2 py-0.5"
          />
          <span>%</span>
        </label>
        <p className="mt-1 text-xs text-muted">Vale para a janela de 5h e para a semanal. Nos modos Claude e Codex nada muda.</p>

        <div className="mt-6 flex justify-end gap-2">
          <button onClick={onClose} className="rounded bg-raised px-4 py-1.5 text-sm hover:bg-line">
            Cancelar
          </button>
          <button onClick={save} className="rounded bg-claude px-4 py-1.5 text-sm font-semibold text-ink">
            Salvar
          </button>
        </div>
      </div>
    </div>
  );
}
