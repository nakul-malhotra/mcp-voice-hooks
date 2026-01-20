import React, { useState, useEffect } from 'react';

interface Voice {
  name: string;
  lang: string;
  voiceURI: string;
  isLocal: boolean;
}

interface SettingsPanelProps {
  isVoiceEnabled: boolean;
  onVoiceEnabledChange: (enabled: boolean) => void;
  selectedVoice: string;
  onVoiceChange: (voiceURI: string) => void;
  speechRate: number;
  onSpeechRateChange: (rate: number) => void;
  onTestVoice: () => void;
}

export const SettingsPanel: React.FC<SettingsPanelProps> = ({
  isVoiceEnabled,
  onVoiceEnabledChange,
  selectedVoice,
  onVoiceChange,
  speechRate,
  onSpeechRateChange,
  onTestVoice,
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const [voices, setVoices] = useState<Voice[]>([]);
  const [selectedLanguage, setSelectedLanguage] = useState('en-US');

  useEffect(() => {
    if (typeof window === 'undefined' || !window.speechSynthesis) return;

    const loadVoices = () => {
      const availableVoices = window.speechSynthesis.getVoices();
      const formattedVoices = availableVoices.map((voice) => ({
        name: voice.name,
        lang: voice.lang,
        voiceURI: voice.voiceURI,
        isLocal: voice.localService,
      }));
      setVoices(formattedVoices);
    };

    loadVoices();
    window.speechSynthesis.onvoiceschanged = loadVoices;

    return () => {
      window.speechSynthesis.onvoiceschanged = null;
    };
  }, []);

  const languages = Array.from(new Set(voices.map((v) => v.lang))).sort();
  const filteredVoices = voices.filter((v) => v.lang === selectedLanguage);
  const localVoices = filteredVoices.filter((v) => v.isLocal);
  const cloudVoices = filteredVoices.filter((v) => !v.isLocal);

  const isGoogleVoice = selectedVoice.toLowerCase().includes('google');

  return (
    <div className="border-t border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-5">
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="flex items-center justify-between w-full p-2 rounded-lg hover:bg-zinc-50 dark:hover:bg-zinc-800 transition-colors duration-200"
      >
        <h3 className="text-sm font-semibold text-zinc-700 dark:text-zinc-300">
          Voice Settings
        </h3>
        <svg
          className={`w-5 h-5 text-zinc-500 dark:text-zinc-400 transition-transform duration-200 ${
            isOpen ? 'rotate-180' : ''
          }`}
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M19 9l-7 7-7-7"
          />
        </svg>
      </button>

      {isOpen && (
        <div className="mt-4 space-y-4 animate-in slide-in-from-top-2 duration-200">
          <div className="flex items-center justify-between p-3 bg-zinc-50 dark:bg-zinc-900 rounded-lg">
            <span className="text-sm font-medium text-zinc-700 dark:text-zinc-300">
              Voice Responses
            </span>
            <button
              onClick={() => onVoiceEnabledChange(!isVoiceEnabled)}
              className={`
                relative w-12 h-6 rounded-full transition-colors duration-200
                ${isVoiceEnabled ? 'bg-emerald-500' : 'bg-zinc-300 dark:bg-zinc-700'}
              `}
            >
              <span
                className={`
                  absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full shadow-sm
                  transition-transform duration-200
                  ${isVoiceEnabled ? 'translate-x-6' : 'translate-x-0'}
                `}
              />
            </button>
          </div>

          {isVoiceEnabled && (
            <div className="space-y-4">
              <div>
                <label className="block text-xs font-medium text-zinc-600 dark:text-zinc-400 mb-1.5">
                  Language
                </label>
                <select
                  value={selectedLanguage}
                  onChange={(e) => setSelectedLanguage(e.target.value)}
                  className="w-full px-3 py-2 text-sm border border-zinc-300 dark:border-zinc-700 rounded-lg bg-white dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100 focus:outline-none focus:ring-2 focus:ring-emerald-500 dark:focus:ring-emerald-600"
                >
                  {languages.map((lang) => (
                    <option key={lang} value={lang}>
                      {lang}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-medium text-zinc-600 dark:text-zinc-400 mb-1.5">
                  Voice
                </label>
                <select
                  value={selectedVoice}
                  onChange={(e) => onVoiceChange(e.target.value)}
                  className="w-full px-3 py-2 text-sm border border-zinc-300 dark:border-zinc-700 rounded-lg bg-white dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100 focus:outline-none focus:ring-2 focus:ring-emerald-500 dark:focus:ring-emerald-600"
                >
                  <option value="system">Mac System Voice</option>
                  {cloudVoices.length > 0 && (
                    <optgroup label="Cloud Voices">
                      {cloudVoices.map((voice) => (
                        <option key={voice.voiceURI} value={voice.voiceURI}>
                          {voice.name}
                        </option>
                      ))}
                    </optgroup>
                  )}
                  {localVoices.length > 0 && (
                    <optgroup label="Local Voices">
                      {localVoices.map((voice) => (
                        <option key={voice.voiceURI} value={voice.voiceURI}>
                          {voice.name}
                        </option>
                      ))}
                    </optgroup>
                  )}
                </select>

                {selectedVoice === 'system' && (
                  <div className="mt-2 p-2 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded text-xs text-blue-700 dark:text-blue-300">
                    <span className="font-medium">Tip:</span> Download high-quality voices in Mac System Settings
                  </div>
                )}
              </div>

              {isGoogleVoice && (
                <div className="p-2 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded text-xs text-amber-700 dark:text-amber-300">
                  <span className="font-medium">Note:</span> Google voices may not respond well to rate adjustments
                </div>
              )}

              <div>
                <label className="block text-xs font-medium text-zinc-600 dark:text-zinc-400 mb-1.5">
                  Speaking Rate: {speechRate.toFixed(1)}x
                </label>
                <input
                  type="range"
                  min="0.5"
                  max="3"
                  step="0.1"
                  value={speechRate}
                  onChange={(e) => onSpeechRateChange(parseFloat(e.target.value))}
                  className="w-full h-2 bg-zinc-200 dark:bg-zinc-700 rounded-lg appearance-none cursor-pointer accent-emerald-500"
                />
                <div className="flex justify-between text-xs text-zinc-500 dark:text-zinc-400 mt-1">
                  <span>0.5x</span>
                  <span>3.0x</span>
                </div>
              </div>

              <button
                onClick={onTestVoice}
                className="w-full px-4 py-2 bg-emerald-500 hover:bg-emerald-600 text-white text-sm font-medium rounded-lg transition-colors duration-200"
              >
                Test Voice
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
};
