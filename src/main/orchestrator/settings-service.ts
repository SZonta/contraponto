import type { AppSettings } from '@shared/types';
import type { Store } from '../storage/store';
import { DEFAULT_SETTINGS } from './routing';

const SETTING_KEY = 'appSettings';

export class SettingsService {
  constructor(private readonly store: Store) {}

  get(): AppSettings {
    return { ...DEFAULT_SETTINGS, ...this.store.getSetting<Partial<AppSettings>>(SETTING_KEY) };
  }

  update(settings: AppSettings): AppSettings {
    const threshold = Math.min(100, Math.max(1, Math.round(settings.quotaSwitch.threshold)));
    const clean: AppSettings = {
      routingRules: settings.routingRules
        .map((rule) => ({ taskType: rule.taskType.trim(), agent: rule.agent }))
        .filter((rule) => rule.taskType),
      quotaSwitch: { enabled: settings.quotaSwitch.enabled, threshold },
    };
    this.store.setSetting(SETTING_KEY, clean);
    return clean;
  }
}
