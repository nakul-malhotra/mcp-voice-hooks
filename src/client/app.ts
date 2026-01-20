interface Session {
    sessionId: string;
    id: string;
    name?: string;
    triggerWord: string | null;
    triggerAliases: string[];
    messages: ConversationMessage[];
}

interface Utterance {
    id: string;
    text: string;
    timestamp: string;
    status: 'pending' | 'delivered' | 'responded';
}

interface ConversationMessage {
    id: string;
    role: 'user' | 'assistant';
    text: string;
    timestamp: string;
    status?: 'pending' | 'delivered' | 'responded';
}

interface VoicePreferences {
    voiceResponsesEnabled: boolean;
}

interface SessionsResponse {
    sessions: Session[];
}

interface SessionRegistrationResponse {
    sessionId: string;
    triggerWord: string | null;
}

interface ConversationResponse {
    messages: ConversationMessage[];
}

interface TTSEvent {
    type: 'speak' | 'waitStatus';
    text?: string;
    isWaiting?: boolean;
}

interface SpeakSystemRequest {
    text: string;
    rate: number;
}

type SendMode = 'automatic' | 'trigger';
type SelectedVoice = 'system' | `browser:${number}`;

interface SpeechRecognitionEvent extends Event {
    resultIndex: number;
    results: SpeechRecognitionResultList;
}

interface SpeechRecognitionErrorEvent extends Event {
    error: string;
}

interface SpeechRecognitionResult {
    isFinal: boolean;
    [index: number]: SpeechRecognitionAlternative;
}

interface SpeechRecognitionAlternative {
    transcript: string;
    confidence: number;
}

interface SpeechRecognitionResultList {
    length: number;
    item(index: number): SpeechRecognitionResult;
    [index: number]: SpeechRecognitionResult;
}

interface SpeechRecognitionInstance extends EventTarget {
    continuous: boolean;
    interimResults: boolean;
    lang: string;
    start(): void;
    stop(): void;
    onresult: ((event: SpeechRecognitionEvent) => void) | null;
    onerror: ((event: SpeechRecognitionErrorEvent) => void) | null;
    onend: (() => void) | null;
}

interface SpeechRecognitionConstructor {
    new(): SpeechRecognitionInstance;
}

interface WindowWithSpeechRecognition extends Window {
    SpeechRecognition?: SpeechRecognitionConstructor;
    webkitSpeechRecognition?: SpeechRecognitionConstructor;
}

class MessengerClient {
    private baseUrl: string;

    private conversationMessages: HTMLElement;
    private conversationContainer: HTMLElement;
    private sessionTabsContainer: HTMLElement | null;
    private sessionPickerModal: HTMLElement | null;

    private messageInput: HTMLTextAreaElement;
    private micBtn: HTMLButtonElement;

    private sendModeRadios: NodeListOf<HTMLInputElement>;
    private triggerWordInputContainer: HTMLElement;
    private triggerWordInput: HTMLInputElement;

    private settingsToggleHeader: HTMLElement;
    private settingsContent: HTMLElement;
    private voiceResponsesToggle: HTMLInputElement;
    private voiceOptions: HTMLElement;
    private languageSelect: HTMLSelectElement | null;
    private voiceSelect: HTMLSelectElement;
    private localVoicesGroup: HTMLOptGroupElement;
    private cloudVoicesGroup: HTMLOptGroupElement;
    private speechRateSlider: HTMLInputElement | null;
    private speechRateInput: HTMLInputElement | null;
    private testTTSBtn: HTMLButtonElement | null;
    private rateWarning: HTMLElement;
    private systemVoiceInfo: HTMLElement;

    private sessions: Map<string, Session>;
    private activeSessionId: string | null;
    private eventSources: Map<string, EventSource>;

    private sendMode: SendMode;
    private triggerWord: string;
    private isListening: boolean;
    private isInterimText: boolean;
    private accumulatedText: string;
    private debug: boolean;

    private voices: SpeechSynthesisVoice[];
    private selectedVoice: SelectedVoice;
    private speechRate: number;
    private speechPitch: number;

    private recognition: SpeechRecognitionInstance | null;

    constructor() {
        this.baseUrl = window.location.origin;

        this.conversationMessages = this.getRequiredElement('conversationMessages');
        this.conversationContainer = this.getRequiredElement('conversationContainer');
        this.sessionTabsContainer = document.getElementById('sessionTabsContainer');
        this.sessionPickerModal = document.getElementById('sessionPickerModal');

        this.messageInput = this.getRequiredElement<HTMLTextAreaElement>('messageInput');
        this.micBtn = this.getRequiredElement<HTMLButtonElement>('micBtn');

        this.sendModeRadios = document.querySelectorAll<HTMLInputElement>('input[name="sendMode"]');
        this.triggerWordInputContainer = this.getRequiredElement('triggerWordInputContainer');
        this.triggerWordInput = this.getRequiredElement<HTMLInputElement>('triggerWordInput');

        this.settingsToggleHeader = this.getRequiredElement('settingsToggleHeader');
        this.settingsContent = this.getRequiredElement('settingsContent');
        this.voiceResponsesToggle = this.getRequiredElement<HTMLInputElement>('voiceResponsesToggle');
        this.voiceOptions = this.getRequiredElement('voiceOptions');
        this.languageSelect = document.getElementById('languageSelect') as HTMLSelectElement | null;
        this.voiceSelect = this.getRequiredElement<HTMLSelectElement>('voiceSelect');
        this.localVoicesGroup = this.getRequiredElement<HTMLOptGroupElement>('localVoicesGroup');
        this.cloudVoicesGroup = this.getRequiredElement<HTMLOptGroupElement>('cloudVoicesGroup');
        this.speechRateSlider = document.getElementById('speechRate') as HTMLInputElement | null;
        this.speechRateInput = document.getElementById('speechRateInput') as HTMLInputElement | null;
        this.testTTSBtn = document.getElementById('testTTSBtn') as HTMLButtonElement | null;
        this.rateWarning = this.getRequiredElement('rateWarning');
        this.systemVoiceInfo = this.getRequiredElement('systemVoiceInfo');

        this.sessions = new Map<string, Session>();
        this.activeSessionId = null;
        this.eventSources = new Map<string, EventSource>();

        this.sendMode = 'automatic';
        this.triggerWord = 'send';
        this.isListening = false;
        this.isInterimText = false;
        this.accumulatedText = '';
        this.debug = localStorage.getItem('voiceHooksDebug') === 'true';

        this.voices = [];
        this.selectedVoice = 'system';
        this.speechRate = 1.0;
        this.speechPitch = 1.0;

        this.recognition = null;

        this.initializeSpeechRecognition();
        this.initializeSpeechSynthesis();
        this.setupEventListeners();
        this.loadPreferences();
        this.initializeSessions();
    }

    private getRequiredElement<T extends HTMLElement = HTMLElement>(id: string): T {
        const element = document.getElementById(id);
        if (!element) {
            throw new Error(`Required element with id '${id}' not found`);
        }
        return element as T;
    }

    private debugLog(...args: unknown[]): void {
        if (this.debug) {
            console.log(...args);
        }
    }

    private initializeSpeechSynthesis(): void {
        if (!window.speechSynthesis) {
            console.warn('Speech synthesis not supported in this browser');
            return;
        }

        this.voices = [];

        const loadVoices = (): void => {
            const voices = window.speechSynthesis.getVoices();

            const deduplicatedVoices: SpeechSynthesisVoice[] = [];
            const seen = new Set<string>();

            voices.forEach(voice => {
                const key = `${voice.name}-${voice.lang}-${voice.voiceURI}`;
                if (!seen.has(key)) {
                    seen.add(key);
                    deduplicatedVoices.push(voice);
                }
            });

            this.voices = deduplicatedVoices;
            this.populateVoiceList();
        };

        loadVoices();
        setTimeout(loadVoices, 100);

        if (window.speechSynthesis.onvoiceschanged !== undefined) {
            window.speechSynthesis.onvoiceschanged = loadVoices;
        }
    }

    private async initializeSessions(): Promise<void> {
        try {
            const urlParams = new URLSearchParams(window.location.search);
            const sessionIdFromUrl = urlParams.get('sessionId');

            if (sessionIdFromUrl) {
                await this.addSession(sessionIdFromUrl);
                this.setActiveSession(sessionIdFromUrl);
            } else {
                const response = await fetch(`${this.baseUrl}/api/sessions/active`);
                if (response.ok) {
                    const data = await response.json() as SessionsResponse;
                    const activeSessions = data.sessions || [];

                    if (activeSessions.length === 0) {
                        console.log('No active sessions, registering new session...');
                        await this.registerNewSession();
                    } else if (activeSessions.length === 1) {
                        await this.addSession(activeSessions[0].sessionId, activeSessions[0]);
                        this.setActiveSession(activeSessions[0].sessionId);
                    } else {
                        activeSessions.forEach(session => this.addSession(session.sessionId, session));
                        this.showSessionPicker(activeSessions);
                    }
                }
            }

            setInterval(() => this.loadData(), 2000);
        } catch (error) {
            console.error('Failed to initialize sessions:', error);
        }
    }

    private async registerNewSession(): Promise<void> {
        try {
            const response = await fetch(`${this.baseUrl}/api/sessions/register`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({})
            });

            if (response.ok) {
                const data = await response.json() as SessionRegistrationResponse;
                await this.addSession(data.sessionId, {
                    sessionId: data.sessionId,
                    id: data.sessionId,
                    triggerWord: data.triggerWord,
                    triggerAliases: [],
                    messages: []
                });
                this.setActiveSession(data.sessionId);
                console.log(`Registered new session: ${data.sessionId} (trigger: ${data.triggerWord})`);
            } else {
                console.error('Failed to register session:', await response.text());
            }
        } catch (error) {
            console.error('Failed to register session:', error);
        }
    }

    private async addSession(sessionId: string, sessionData: Partial<Session> | null = null): Promise<void> {
        if (this.sessions.has(sessionId)) return;

        const session: Session = sessionData ? {
            sessionId,
            id: sessionData.id || sessionId,
            name: sessionData.name,
            messages: sessionData.messages || [],
            triggerWord: sessionData.triggerWord || null,
            triggerAliases: sessionData.triggerAliases || []
        } : {
            id: sessionId,
            sessionId,
            messages: [],
            triggerWord: null,
            triggerAliases: []
        };

        this.sessions.set(sessionId, session);
        this.connectSSE(sessionId);
        this.updateSessionTabs();
    }

    private connectSSE(sessionId: string): void {
        if (this.eventSources.has(sessionId)) {
            this.eventSources.get(sessionId)?.close();
        }

        const eventSource = new EventSource(`${this.baseUrl}/api/tts-events?sessionId=${sessionId}`);

        eventSource.onmessage = (event: MessageEvent): void => {
            try {
                const data = JSON.parse(event.data) as TTSEvent;

                if (data.type === 'speak' && data.text) {
                    if (this.activeSessionId === sessionId) {
                        this.speakText(data.text);
                    }
                } else if (data.type === 'waitStatus') {
                    if (this.activeSessionId === sessionId && data.isWaiting !== undefined) {
                        this.handleWaitStatus(data.isWaiting);
                    }
                }
            } catch (error) {
                console.error('Failed to parse TTS event:', error);
            }
        };

        eventSource.onerror = (error: Event): void => {
            console.error(`SSE connection error for session ${sessionId}:`, error);
        };

        this.eventSources.set(sessionId, eventSource);
    }

    private setActiveSession(sessionId: string): void {
        if (!this.sessions.has(sessionId)) return;

        this.activeSessionId = sessionId;
        this.updateSessionTabs();
        this.loadData();
    }

    private updateSessionTabs(): void {
        if (!this.sessionTabsContainer || this.sessions.size <= 1) {
            if (this.sessionTabsContainer) {
                this.sessionTabsContainer.style.display = 'none';
            }
            return;
        }

        this.sessionTabsContainer.style.display = 'flex';
        this.sessionTabsContainer.replaceChildren();

        this.sessions.forEach((session, sessionId) => {
            const tab = document.createElement('button');
            tab.className = 'session-tab';

            const label = session.name || session.triggerWord
                ? (session.name || `Trigger: ${session.triggerWord}`)
                : `Session ${sessionId.substring(0, 8)}`;

            tab.textContent = label;

            if (sessionId === this.activeSessionId) {
                tab.classList.add('active');
            }

            tab.addEventListener('click', () => {
                this.setActiveSession(sessionId);
            });

            this.sessionTabsContainer?.appendChild(tab);
        });
    }

    private showSessionPicker(sessions: Session[]): void {
        if (!this.sessionPickerModal) return;

        this.sessionPickerModal.style.display = 'flex';
        const pickerList = this.sessionPickerModal.querySelector('.session-picker-list');

        if (pickerList) {
            pickerList.replaceChildren();

            sessions.forEach(session => {
                const item = document.createElement('button');
                item.className = 'session-picker-item';

                const label = session.name || session.triggerWord
                    ? (session.name || `Trigger: ${session.triggerWord}`)
                    : `Session ${session.id.substring(0, 8)}`;

                item.textContent = label;

                item.addEventListener('click', () => {
                    this.setActiveSession(session.id);
                    if (this.sessionPickerModal) {
                        this.sessionPickerModal.style.display = 'none';
                    }
                });

                pickerList.appendChild(item);
            });
        }
    }

    private findTargetSession(text: string): string | null {
        for (const [sessionId, session] of this.sessions) {
            if (session.triggerWord && this.containsTriggerWord(text, session.triggerWord)) {
                return sessionId;
            }
        }
        return null;
    }

    private removeTriggerWord(text: string, triggerWord?: string | null): string {
        const trigger = triggerWord || this.triggerWord;
        const words = text.split(/\s+/);
        const filtered = words.filter(w => w.toLowerCase() !== trigger.toLowerCase());
        return filtered.join(' ');
    }

    private containsTriggerWord(text: string, triggerWord: string | null = null): boolean {
        const trigger = triggerWord || this.triggerWord;
        if (!trigger) return false;
        const words = text.toLowerCase().split(/\s+/);
        return words.includes(trigger.toLowerCase());
    }

    private handleWaitStatus(isWaiting: boolean): void {
        const waitingIndicator = document.getElementById('waitingIndicator');
        if (waitingIndicator) {
            waitingIndicator.style.display = isWaiting ? 'block' : 'none';
            if (isWaiting) {
                this.scrollToBottom();
            }
        }
    }

    private async speakText(text: string): Promise<void> {
        if (this.selectedVoice === 'system') {
            try {
                const response = await fetch(`${this.baseUrl}/api/speak-system`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        text: text,
                        rate: Math.round(this.speechRate * 150)
                    } as SpeakSystemRequest)
                });

                if (!response.ok) {
                    const error = await response.json();
                    console.error('Failed to speak via system voice:', error);
                }
            } catch (error) {
                console.error('Failed to call speak-system API:', error);
            } finally {
                await this.notifySpeakDone();
            }
        } else {
            if (!window.speechSynthesis) {
                console.error('Speech synthesis not available');
                await this.notifySpeakDone();
                return;
            }

            window.speechSynthesis.cancel();

            const utterance = new SpeechSynthesisUtterance(text);

            if (this.selectedVoice.startsWith('browser:')) {
                const voiceIndex = parseInt(this.selectedVoice.substring(8));
                if (this.voices[voiceIndex]) {
                    utterance.voice = this.voices[voiceIndex];
                }
            }

            utterance.rate = this.speechRate;
            utterance.pitch = this.speechPitch;

            utterance.onstart = (): void => {
                this.debugLog('Started speaking:', text);
            };

            utterance.onend = (): void => {
                this.debugLog('Finished speaking');
                this.notifySpeakDone();
            };

            utterance.onerror = (event: SpeechSynthesisErrorEvent): void => {
                console.error('Speech synthesis error:', event);
                this.notifySpeakDone();
            };

            window.speechSynthesis.speak(utterance);
        }
    }

    private async notifySpeakDone(): Promise<void> {
        try {
            if (!this.activeSessionId) return;
            await fetch(`${this.baseUrl}/api/speak-done?sessionId=${this.activeSessionId}`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({})
            });
            this.debugLog('Notified server that speaking is done');
        } catch (error) {
            console.error('Failed to notify speak-done:', error);
        }
    }

    private loadPreferences(): void {
        const savedVoiceResponses = localStorage.getItem('voiceResponsesEnabled');
        if (savedVoiceResponses !== null) {
            const enabled = savedVoiceResponses === 'true';
            this.voiceResponsesToggle.checked = enabled;
            this.voiceOptions.style.display = enabled ? 'block' : 'none';
            this.updateVoiceResponses(enabled);
        }

        const savedVoice = localStorage.getItem('selectedVoice');
        if (savedVoice) {
            this.selectedVoice = savedVoice as SelectedVoice;
        }

        const savedRate = localStorage.getItem('speechRate');
        if (savedRate) {
            this.speechRate = parseFloat(savedRate);
            if (this.speechRateSlider) this.speechRateSlider.value = this.speechRate.toString();
            if (this.speechRateInput) this.speechRateInput.value = this.speechRate.toFixed(1);
        }
    }

    private populateLanguageFilter(): void {
        if (!this.languageSelect || !this.voices) return;

        const currentSelection = this.languageSelect.value || 'en-US';
        this.languageSelect.replaceChildren();

        const allOption = document.createElement('option');
        allOption.value = 'all';
        allOption.textContent = 'All Languages';
        this.languageSelect.appendChild(allOption);

        const languageCodes = new Set<string>();
        this.voices.forEach(voice => {
            languageCodes.add(voice.lang);
        });

        Array.from(languageCodes).sort().forEach(lang => {
            const option = document.createElement('option');
            option.value = lang;
            option.textContent = lang;
            this.languageSelect?.appendChild(option);
        });

        this.languageSelect.value = currentSelection;
        if (this.languageSelect.value !== currentSelection) {
            this.languageSelect.value = 'en-US';
        }
    }

    private populateVoiceList(): void {
        if (!this.voiceSelect || !this.localVoicesGroup || !this.cloudVoicesGroup) return;

        this.populateLanguageFilter();

        this.localVoicesGroup.replaceChildren();
        this.cloudVoicesGroup.replaceChildren();

        const excludedVoices = [
            'Eddy', 'Flo', 'Grandma', 'Grandpa', 'Reed', 'Rocko', 'Sandy', 'Shelley',
            'Albert', 'Bad News', 'Bahh', 'Bells', 'Boing', 'Bubbles', 'Cellos',
            'Good News', 'Jester', 'Organ', 'Superstar', 'Trinoids', 'Whisper',
            'Wobble', 'Zarvox', 'Fred', 'Junior', 'Kathy', 'Ralph'
        ];

        const selectedLanguage = this.languageSelect ? this.languageSelect.value : 'en-US';

        this.voices.forEach((voice, index) => {
            const voiceLang = voice.lang;
            const shouldInclude = selectedLanguage === 'all' || voiceLang === selectedLanguage;

            if (shouldInclude) {
                const voiceName = voice.name;
                const isExcluded = excludedVoices.some(excluded =>
                    voiceName.toLowerCase().startsWith(excluded.toLowerCase())
                );

                if (!isExcluded) {
                    const option = document.createElement('option');
                    option.value = `browser:${index}`;
                    option.textContent = `${voice.name} (${voice.lang})`;

                    if (voice.localService) {
                        this.localVoicesGroup.appendChild(option);
                    } else {
                        this.cloudVoicesGroup.appendChild(option);
                    }
                }
            }
        });

        if (this.localVoicesGroup.children.length === 0) {
            this.localVoicesGroup.style.display = 'none';
        } else {
            this.localVoicesGroup.style.display = '';
        }

        if (this.cloudVoicesGroup.children.length === 0) {
            this.cloudVoicesGroup.style.display = 'none';
        } else {
            this.cloudVoicesGroup.style.display = '';
        }

        if (this.selectedVoice) {
            this.voiceSelect.value = this.selectedVoice;
        }

        this.updateVoiceWarnings();
    }

    private updateVoiceWarnings(): void {
        if (this.selectedVoice === 'system') {
            this.systemVoiceInfo.style.display = 'flex';
            this.rateWarning.style.display = 'none';
        } else if (this.selectedVoice.startsWith('browser:')) {
            const voiceIndex = parseInt(this.selectedVoice.substring(8));
            const voice = this.voices[voiceIndex];

            if (voice) {
                const isGoogleVoice = voice.name.toLowerCase().includes('google');
                this.rateWarning.style.display = isGoogleVoice ? 'flex' : 'none';
                this.systemVoiceInfo.style.display = voice.localService ? 'flex' : 'none';
            } else {
                this.rateWarning.style.display = 'none';
                this.systemVoiceInfo.style.display = 'none';
            }
        } else {
            this.rateWarning.style.display = 'none';
            this.systemVoiceInfo.style.display = 'none';
        }
    }

    private setupEventListeners(): void {
        this.messageInput.addEventListener('keydown', (e) => this.handleTextInputKeydown(e));
        this.messageInput.addEventListener('input', () => this.autoGrowTextarea());

        this.micBtn.addEventListener('click', () => this.toggleVoiceDictation());

        this.sendModeRadios.forEach(radio => {
            radio.addEventListener('change', (e) => {
                const target = e.target as HTMLInputElement;
                this.sendMode = target.value as SendMode;
                this.triggerWordInputContainer.style.display =
                    this.sendMode === 'trigger' ? 'flex' : 'none';
            });
        });

        this.triggerWordInput.addEventListener('input', (e) => {
            const target = e.target as HTMLInputElement;
            this.triggerWord = target.value.trim().toLowerCase();
        });

        this.settingsToggleHeader.addEventListener('click', () => {
            const arrow = this.settingsToggleHeader.querySelector('.toggle-arrow');
            if (this.settingsContent.classList.contains('open')) {
                this.settingsContent.classList.remove('open');
                arrow?.classList.remove('open');
            } else {
                this.settingsContent.classList.add('open');
                arrow?.classList.add('open');
            }
        });

        this.voiceResponsesToggle.addEventListener('change', async (e) => {
            const target = e.target as HTMLInputElement;
            const enabled = target.checked;
            await this.updateVoiceResponses(enabled);
            this.voiceOptions.style.display = enabled ? 'block' : 'none';
        });

        this.voiceSelect.addEventListener('change', (e) => {
            const target = e.target as HTMLSelectElement;
            this.selectedVoice = target.value as SelectedVoice;
            localStorage.setItem('selectedVoice', this.selectedVoice);
            this.updateVoiceWarnings();
        });

        if (this.languageSelect) {
            this.languageSelect.addEventListener('change', () => {
                this.populateVoiceList();
            });
        }

        if (this.speechRateSlider) {
            this.speechRateSlider.addEventListener('input', (e) => {
                const target = e.target as HTMLInputElement;
                this.speechRate = parseFloat(target.value);
                if (this.speechRateInput) {
                    this.speechRateInput.value = this.speechRate.toFixed(1);
                }
                localStorage.setItem('speechRate', this.speechRate.toString());
            });
        }

        if (this.speechRateInput) {
            this.speechRateInput.addEventListener('input', (e) => {
                const target = e.target as HTMLInputElement;
                let value = parseFloat(target.value);
                if (!isNaN(value)) {
                    value = Math.max(0.5, Math.min(5, value));
                    this.speechRate = value;
                    if (this.speechRateSlider) {
                        this.speechRateSlider.value = value.toString();
                    }
                    target.value = value.toFixed(1);
                    localStorage.setItem('speechRate', this.speechRate.toString());
                }
            });
        }

        if (this.testTTSBtn) {
            this.testTTSBtn.addEventListener('click', () => {
                this.speakText('This is Voice Mode for Claude Code. How can I help you today?');
            });
        }
    }

    private async loadData(): Promise<void> {
        if (!this.activeSessionId) return;

        try {
            const conversationResponse = await fetch(
                `${this.baseUrl}/api/conversation?limit=50&sessionId=${this.activeSessionId}`
            );
            if (conversationResponse.ok) {
                const data = await conversationResponse.json() as ConversationResponse;
                this.updateConversation(data.messages);
            }
        } catch (error) {
            console.error('Failed to load data:', error);
        }
    }

    private updateConversation(messages: ConversationMessage[]): void {
        const container = this.conversationMessages;
        const emptyState = container.querySelector('.empty-state') as HTMLElement | null;

        if (messages.length === 0) {
            if (emptyState) {
                emptyState.style.display = 'flex';
            }
            container.querySelectorAll('.message-bubble').forEach(el => el.remove());
            return;
        }

        if (emptyState) {
            emptyState.style.display = 'none';
        }

        const existingBubbles = container.querySelectorAll<HTMLElement>('.message-bubble');
        const existingIds = new Set<string>();
        existingBubbles.forEach(bubble => {
            if (bubble.dataset.messageId) {
                existingIds.add(bubble.dataset.messageId);
            }
        });

        const waitingIndicator = container.querySelector('.waiting-indicator');

        messages.forEach(message => {
            if (!existingIds.has(message.id)) {
                const bubble = this.createMessageBubble(message);
                if (waitingIndicator) {
                    container.insertBefore(bubble, waitingIndicator);
                } else {
                    container.appendChild(bubble);
                }
            } else {
                if (message.role === 'user' && message.status) {
                    const bubble = container.querySelector<HTMLElement>(`[data-message-id="${message.id}"]`);
                    if (bubble) {
                        const statusEl = bubble.querySelector('.message-status');
                        if (statusEl) {
                            const wasPending = statusEl.classList.contains('pending');
                            const isPending = message.status === 'pending';

                            if (wasPending && !isPending) {
                                const deleteBtn = statusEl.querySelector('.delete-message-btn');
                                if (deleteBtn) {
                                    deleteBtn.remove();
                                }
                            }

                            statusEl.className = `message-status ${message.status}`;
                            const statusText = statusEl.querySelector('span:last-child');
                            if (statusText) {
                                statusText.textContent = message.status.toUpperCase();
                            }
                        }
                    }
                }
            }
        });

        this.scrollToBottom();
    }

    private createMessageBubble(message: ConversationMessage): HTMLElement {
        const bubble = document.createElement('div');
        bubble.className = `message-bubble ${message.role}`;
        bubble.dataset.messageId = message.id;

        const messageText = document.createElement('div');
        messageText.className = 'message-text';
        messageText.textContent = message.text;

        const messageMeta = document.createElement('div');
        messageMeta.className = 'message-meta';

        const timestamp = document.createElement('span');
        timestamp.className = 'message-timestamp';
        timestamp.textContent = this.formatTimestamp(message.timestamp);
        messageMeta.appendChild(timestamp);

        if (message.role === 'user' && message.status) {
            const statusContainer = document.createElement('div');
            statusContainer.className = `message-status ${message.status}`;

            if (message.status === 'pending') {
                const deleteBtn = document.createElement('span');
                deleteBtn.className = 'delete-message-btn';

                const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
                svg.setAttribute('class', 'delete-icon');
                svg.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
                svg.setAttribute('viewBox', '0 0 24 24');

                const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
                path.setAttribute('d', 'M6 19c0 1.1.9 2 2 2h8c1.1 0 2-.9 2-2V7H6v12zM19 4h-3.5l-1-1h-5l-1 1H5v2h14V4z');

                svg.appendChild(path);
                deleteBtn.appendChild(svg);

                deleteBtn.onclick = (e: MouseEvent): void => {
                    e.stopPropagation();
                    this.deleteMessage(message.id);
                };
                statusContainer.appendChild(deleteBtn);
            }

            const statusText = document.createElement('span');
            statusText.textContent = message.status.toUpperCase();
            statusContainer.appendChild(statusText);

            messageMeta.appendChild(statusContainer);
        }

        bubble.appendChild(messageText);
        bubble.appendChild(messageMeta);

        return bubble;
    }

    private scrollToBottom(): void {
        this.conversationContainer.scrollTo({
            top: this.conversationContainer.scrollHeight,
            behavior: 'smooth'
        });
    }

    private formatTimestamp(timestamp: string): string {
        const date = new Date(timestamp);
        return date.toLocaleTimeString();
    }

    private handleTextInputKeydown(e: KeyboardEvent): void {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            this.sendTypedMessage();
        }
    }

    private autoGrowTextarea(): void {
        const textarea = this.messageInput;
        textarea.style.height = 'auto';
        textarea.style.height = Math.min(textarea.scrollHeight, 120) + 'px';
    }

    private async sendTypedMessage(): Promise<void> {
        const text = this.messageInput.value.trim();
        if (!text || this.isInterimText) return;

        this.messageInput.value = '';
        this.messageInput.style.height = 'auto';

        await this.sendMessage(text);
    }

    private async sendMessage(text: string, targetSessionId: string | null = null): Promise<void> {
        try {
            const sessionId = targetSessionId || this.activeSessionId;
            if (!sessionId) {
                console.error('No session ID available');
                return;
            }

            const response = await fetch(`${this.baseUrl}/api/potential-utterances?sessionId=${sessionId}`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    text,
                    timestamp: new Date().toISOString()
                })
            });

            if (response.ok) {
                await this.loadData();
            }
        } catch (error) {
            console.error('Failed to send message:', error);
        }
    }

    private toggleVoiceDictation(): void {
        if (this.isListening) {
            this.stopVoiceDictation();
        } else {
            this.startVoiceDictation();
        }
    }

    private async startVoiceDictation(): Promise<void> {
        if (!this.recognition) {
            alert('Speech recognition not supported in this browser');
            return;
        }

        try {
            if (this.isInterimText) {
                this.messageInput.value = '';
                this.isInterimText = false;
            }

            this.recognition.start();
            this.isListening = true;
            this.micBtn.classList.add('listening');

            await this.updateVoiceInputState(true);
        } catch (e) {
            console.error('Failed to start recognition:', e);
            alert('Failed to start speech recognition');
        }
    }

    private async stopVoiceDictation(): Promise<void> {
        if (this.recognition) {
            this.isListening = false;
            this.recognition.stop();
            this.micBtn.classList.remove('listening');

            const text = this.messageInput.value.trim();
            if (text) {
                if (this.sendMode === 'trigger') {
                    if (this.containsTriggerWord(text)) {
                        const textToSend = this.removeTriggerWord(text);
                        await this.sendMessage(textToSend);
                        this.messageInput.value = '';
                    }
                } else {
                    await this.sendMessage(text);
                    this.messageInput.value = '';
                }
            }

            this.isInterimText = false;
            this.messageInput.style.height = 'auto';

            await this.updateVoiceInputState(false);
        }
    }

    private initializeSpeechRecognition(): void {
        const windowWithRecognition = window as unknown as WindowWithSpeechRecognition;
        const SpeechRecognition = windowWithRecognition.SpeechRecognition || windowWithRecognition.webkitSpeechRecognition;

        if (!SpeechRecognition) {
            console.error('Speech recognition not supported');
            this.micBtn.disabled = true;
            return;
        }

        this.recognition = new SpeechRecognition();
        this.recognition.continuous = true;
        this.recognition.interimResults = true;
        this.recognition.lang = 'en-US';

        this.recognition.onresult = (event: SpeechRecognitionEvent): void => {
            let interimTranscript = '';

            for (let i = event.resultIndex; i < event.results.length; i++) {
                const transcript = event.results[i][0].transcript;

                if (event.results[i].isFinal) {
                    this.isInterimText = false;

                    if (this.sendMode === 'automatic') {
                        const finalText = this.messageInput.value.trim();

                        let targetSession = this.activeSessionId;
                        if (this.sessions.size > 1) {
                            const foundSession = this.findTargetSession(finalText);
                            if (foundSession) {
                                const session = this.sessions.get(foundSession);
                                if (session) {
                                    const textToSend = this.removeTriggerWord(finalText, session.triggerWord);
                                    this.sendMessage(textToSend, foundSession);
                                    this.messageInput.value = '';
                                    this.accumulatedText = '';
                                    return;
                                }
                            }
                        }

                        this.sendMessage(finalText, targetSession);
                        this.messageInput.value = '';
                        this.accumulatedText = '';
                    } else {
                        const previouslyAccumulated = this.accumulatedText || '';
                        const newUtterance = transcript.trim();

                        if (this.containsTriggerWord(newUtterance)) {
                            const combined = previouslyAccumulated
                                ? previouslyAccumulated + ' ' + newUtterance
                                : newUtterance;
                            const textToSend = this.removeTriggerWord(combined, this.triggerWord).trim();
                            if (textToSend) {
                                this.sendMessage(textToSend);
                            }
                            this.messageInput.value = '';
                            this.accumulatedText = '';
                        } else {
                            const newAccumulated = previouslyAccumulated
                                ? previouslyAccumulated + ' ' + newUtterance
                                : newUtterance;
                            this.messageInput.value = newAccumulated;
                            this.accumulatedText = newAccumulated;
                            this.autoGrowTextarea();
                        }
                    }
                } else {
                    interimTranscript += transcript;
                }
            }

            if (interimTranscript) {
                if (this.sendMode === 'trigger' && this.accumulatedText) {
                    this.messageInput.value = this.accumulatedText + ' ' + interimTranscript.trim();
                } else {
                    this.messageInput.value = interimTranscript;
                }

                this.isInterimText = true;
                this.autoGrowTextarea();
            }
        };

        this.recognition.onerror = (event: SpeechRecognitionErrorEvent): void => {
            if (event.error !== 'no-speech') {
                console.error('Speech error:', event.error);
                this.stopVoiceDictation();
            }
        };

        this.recognition.onend = (): void => {
            if (this.isListening) {
                try {
                    this.recognition?.start();
                } catch (e) {
                    console.error('Failed to restart recognition:', e);
                    this.stopVoiceDictation();
                }
            }
        };
    }

    private async deleteMessage(messageId: string): Promise<void> {
        try {
            if (!this.activeSessionId) {
                console.error('No active session');
                return;
            }
            const response = await fetch(`${this.baseUrl}/api/utterances/${messageId}?sessionId=${this.activeSessionId}`, {
                method: 'DELETE'
            });

            if (response.ok) {
                const bubble = this.conversationMessages.querySelector(`[data-message-id="${messageId}"]`);
                if (bubble) {
                    bubble.remove();
                }
                await this.loadData();
            } else {
                const error = await response.json();
                console.error('Failed to delete message:', error);
                alert(`Failed to delete: ${error.error || 'Unknown error'}`);
            }
        } catch (error) {
            console.error('Failed to delete message:', error);
        }
    }

    private async updateVoiceInputState(active: boolean): Promise<void> {
        try {
            if (!this.activeSessionId) return;
            await fetch(`${this.baseUrl}/api/voice-input-state?sessionId=${this.activeSessionId}`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ active })
            });
        } catch (error) {
            console.error('Failed to update voice input state:', error);
        }
    }

    private async updateVoiceResponses(enabled: boolean): Promise<void> {
        try {
            localStorage.setItem('voiceResponsesEnabled', enabled.toString());

            if (!this.activeSessionId) return;
            await fetch(`${this.baseUrl}/api/voice-preferences?sessionId=${this.activeSessionId}`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ voiceResponsesEnabled: enabled } as VoicePreferences)
            });
        } catch (error) {
            console.error('Failed to update voice responses:', error);
        }
    }
}

document.addEventListener('DOMContentLoaded', () => {
    new MessengerClient();
});
