const STORAGE_KEYS = {
  VOICE_ENABLED: 'voiceHooks:voiceEnabled',
  SELECTED_VOICE: 'voiceHooks:selectedVoice',
  SPEECH_RATE: 'voiceHooks:speechRate',
  SEND_MODE: 'voiceHooks:sendMode',
  TRIGGER_WORD: 'voiceHooks:triggerWord',
  THEME: 'voiceHooks:theme',
} as const;

export const storage = {
  get<T>(key: keyof typeof STORAGE_KEYS, defaultValue: T): T {
    try {
      const item = localStorage.getItem(STORAGE_KEYS[key]);
      return item ? JSON.parse(item) : defaultValue;
    } catch {
      return defaultValue;
    }
  },

  set<T>(key: keyof typeof STORAGE_KEYS, value: T): void {
    try {
      localStorage.setItem(STORAGE_KEYS[key], JSON.stringify(value));
    } catch (error) {
      console.error('Failed to save to localStorage:', error);
    }
  },

  remove(key: keyof typeof STORAGE_KEYS): void {
    try {
      localStorage.removeItem(STORAGE_KEYS[key]);
    } catch (error) {
      console.error('Failed to remove from localStorage:', error);
    }
  },

  clear(): void {
    try {
      Object.values(STORAGE_KEYS).forEach((key) => {
        localStorage.removeItem(key);
      });
    } catch (error) {
      console.error('Failed to clear localStorage:', error);
    }
  },
};

export const loadPreferences = () => ({
  voiceEnabled: storage.get('VOICE_ENABLED', false),
  selectedVoice: storage.get('SELECTED_VOICE', 'system'),
  speechRate: storage.get('SPEECH_RATE', 1.0),
  sendMode: storage.get('SEND_MODE', 'automatic') as 'automatic' | 'trigger',
  triggerWord: storage.get('TRIGGER_WORD', 'send'),
  theme: storage.get('THEME', 'dark') as 'light' | 'dark',
});

export const savePreferences = (preferences: Partial<ReturnType<typeof loadPreferences>>) => {
  Object.entries(preferences).forEach(([key, value]) => {
    const storageKey = key.replace(/([A-Z])/g, '_$1').toUpperCase() as keyof typeof STORAGE_KEYS;
    if (storageKey in STORAGE_KEYS) {
      storage.set(storageKey, value);
    }
  });
};
