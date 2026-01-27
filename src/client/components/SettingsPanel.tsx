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

  return (
    <div className="border-t border-stone-200 dark:border-stone-800 bg-white dark:bg-stone-900">
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="flex items-center justify-between w-full px-6 py-4 hover:bg-stone-50 dark:hover:bg-stone-800/50 transition-colors duration-200"
      >
        <div className="flex items-center gap-3">
          <div className={`w-2 h-2 rounded-full transition-colors duration-200 ${isVoiceEnabled ? 'bg-emerald-500' : 'bg-stone-300 dark:bg-stone-600'}`} />
          <span className="text-sm font-medium text-stone-700 dark:text-stone-300">
            Voice Output
          </span>
          <span className="text-xs text-stone-400 dark:text-stone-500">
            {isVoiceEnabled ? 'On' : 'Off'}
          </span>
        </div>
        <svg
          className={`w-4 h-4 text-stone-400 transition-transform duration-200 ${isOpen ? 'rotate-180' : ''}`}
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
        >
          <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {isOpen && (
        <div className="px-6 pb-6 space-y-5 animate-in fade-in slide-in-from-top-2 duration-200">
          {/* Enable/Disable toggle */}
          <div className="flex items-center justify-between py-3 px-4 bg-stone-50 dark:bg-stone-800 rounded-xl">
            <span className="text-sm text-stone-600 dark:text-stone-300">
              Speak responses aloud
            </span>
            <button
              onClick={() => onVoiceEnabledChange(!isVoiceEnabled)}
              className={`
                relative w-11 h-6 rounded-full transition-colors duration-200
                ${isVoiceEnabled ? 'bg-terracotta-500' : 'bg-stone-300 dark:bg-stone-600'}
              `}
            >
              <span
                className={`
                  absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full shadow-sm
                  transition-transform duration-200 ease-out
                  ${isVoiceEnabled ? 'translate-x-5' : 'translate-x-0'}
                `}
              />
            </button>
          </div>

          {isVoiceEnabled && (
            <div className="space-y-4">
              {/* Language selector */}
              <div>
                <label className="block text-xs font-medium text-stone-500 dark:text-stone-400 uppercase tracking-wide mb-2">
                  Language
                </label>
                <select
                  value={selectedLanguage}
                  onChange={(e) => setSelectedLanguage(e.target.value)}
                  className="w-full px-3 py-2.5 text-sm bg-stone-50 dark:bg-stone-800 border border-stone-200 dark:border-stone-700 rounded-xl text-stone-800 dark:text-stone-100 focus:outline-none focus:ring-2 focus:ring-terracotta-500/20 focus:border-terracotta-500 transition-all duration-200"
                >
                  {languages.map((lang) => (
                    <option key={lang} value={lang}>
                      {lang}
                    </option>
                  ))}
                </select>
              </div>

              {/* Voice selector */}
              <div>
                <label className="block text-xs font-medium text-stone-500 dark:text-stone-400 uppercase tracking-wide mb-2">
                  Voice
                </label>
                <select
                  value={selectedVoice}
                  onChange={(e) => onVoiceChange(e.target.value)}
                  className="w-full px-3 py-2.5 text-sm bg-stone-50 dark:bg-stone-800 border border-stone-200 dark:border-stone-700 rounded-xl text-stone-800 dark:text-stone-100 focus:outline-none focus:ring-2 focus:ring-terracotta-500/20 focus:border-terracotta-500 transition-all duration-200"
                >
                  <option value="system">System Default</option>
                  {cloudVoices.length > 0 && (
                    <optgroup label="Enhanced">
                      {cloudVoices.map((voice) => (
                        <option key={voice.voiceURI} value={voice.voiceURI}>
                          {voice.name}
                        </option>
                      ))}
                    </optgroup>
                  )}
                  {localVoices.length > 0 && (
                    <optgroup label="Local">
                      {localVoices.map((voice) => (
                        <option key={voice.voiceURI} value={voice.voiceURI}>
                          {voice.name}
                        </option>
                      ))}
                    </optgroup>
                  )}
                </select>
              </div>

              {/* Speed slider */}
              <div>
                <div className="flex items-center justify-between mb-2">
                  <label className="text-xs font-medium text-stone-500 dark:text-stone-400 uppercase tracking-wide">
                    Speed
                  </label>
                  <span className="text-xs text-stone-600 dark:text-stone-300 tabular-nums">
                    {speechRate.toFixed(1)}x
                  </span>
                </div>
                <input
                  type="range"
                  min="0.5"
                  max="2"
                  step="0.1"
                  value={speechRate}
                  onChange={(e) => onSpeechRateChange(parseFloat(e.target.value))}
                  className="w-full h-1.5 bg-stone-200 dark:bg-stone-700 rounded-full appearance-none cursor-pointer accent-terracotta-500"
                />
                <div className="flex justify-between text-[10px] text-stone-400 mt-1">
                  <span>Slow</span>
                  <span>Fast</span>
                </div>
              </div>

              {/* Test button */}
              <button
                onClick={onTestVoice}
                className="w-full px-4 py-2.5 bg-stone-900 dark:bg-stone-100 hover:bg-stone-800 dark:hover:bg-stone-200 text-white dark:text-stone-900 text-sm font-medium rounded-xl transition-colors duration-200"
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
