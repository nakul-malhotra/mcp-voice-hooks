import { useEffect, useRef, useCallback, useState } from 'react';

interface UseSSEOptions {
  url: string;
  onMessage?: (data: any) => void;
  onError?: (error: Event) => void;
  onOpen?: () => void;
  enabled?: boolean;
  reconnect?: boolean;
  reconnectInterval?: number;
}

interface UseSSEResult {
  isConnected: boolean;
  lastMessage: any;
  error: Event | null;
  reconnect: () => void;
  disconnect: () => void;
}

export const useSSE = ({
  url,
  onMessage,
  onError,
  onOpen,
  enabled = true,
  reconnect = true,
  reconnectInterval = 3000,
}: UseSSEOptions): UseSSEResult => {
  const [isConnected, setIsConnected] = useState(false);
  const [lastMessage, setLastMessage] = useState<any>(null);
  const [error, setError] = useState<Event | null>(null);

  const eventSourceRef = useRef<EventSource | null>(null);
  const reconnectTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const shouldReconnectRef = useRef(reconnect);

  // Use refs for all options to avoid dependency issues
  const urlRef = useRef(url);
  const reconnectIntervalRef = useRef(reconnectInterval);
  const onMessageRef = useRef(onMessage);
  const onErrorRef = useRef(onError);
  const onOpenRef = useRef(onOpen);

  // Update refs when values change (but don't trigger useEffect re-runs)
  useEffect(() => {
    urlRef.current = url;
    reconnectIntervalRef.current = reconnectInterval;
    onMessageRef.current = onMessage;
    onErrorRef.current = onError;
    onOpenRef.current = onOpen;
    shouldReconnectRef.current = reconnect;
  });

  const disconnect = useCallback(() => {
    if (reconnectTimeoutRef.current) {
      clearTimeout(reconnectTimeoutRef.current);
      reconnectTimeoutRef.current = null;
    }

    if (eventSourceRef.current) {
      eventSourceRef.current.close();
      eventSourceRef.current = null;
      setIsConnected(false);
    }
  }, []);

  const connect = useCallback(() => {
    const currentUrl = urlRef.current;
    console.log('[useSSE] connect() called, url:', currentUrl);

    if (eventSourceRef.current) {
      console.log('[useSSE] Existing connection found, closing first');
      eventSourceRef.current.close();
      eventSourceRef.current = null;
    }

    if (reconnectTimeoutRef.current) {
      clearTimeout(reconnectTimeoutRef.current);
      reconnectTimeoutRef.current = null;
    }

    try {
      console.log('[useSSE] Creating new EventSource');
      const eventSource = new EventSource(currentUrl);
      eventSourceRef.current = eventSource;

      eventSource.onopen = () => {
        console.log('[useSSE] onopen fired - connection established');
        setIsConnected(true);
        setError(null);
        onOpenRef.current?.();
      };

      eventSource.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          setLastMessage(data);
          onMessageRef.current?.(data);
        } catch (err) {
          console.error('[useSSE] Failed to parse SSE message:', err);
        }
      };

      eventSource.onerror = (err) => {
        console.error('[useSSE] onerror fired, readyState:', eventSource.readyState);
        setError(err);
        setIsConnected(false);
        onErrorRef.current?.(err);

        // Only reconnect if still enabled and reconnect flag is set
        if (shouldReconnectRef.current && eventSource.readyState === EventSource.CLOSED) {
          console.log('[useSSE] Will reconnect in', reconnectIntervalRef.current, 'ms');
          reconnectTimeoutRef.current = setTimeout(() => {
            connect();
          }, reconnectIntervalRef.current);
        }
      };
    } catch (err) {
      console.error('[useSSE] Failed to create EventSource:', err);
    }
  }, []); // Empty deps - uses refs for all values

  // Main effect - only depends on `enabled`
  // URL changes are handled by reconnecting when needed
  useEffect(() => {
    console.log('[useSSE] Main useEffect, enabled:', enabled);

    if (enabled) {
      shouldReconnectRef.current = reconnect;
      connect();
    }

    return () => {
      console.log('[useSSE] Cleanup - disconnecting');
      shouldReconnectRef.current = false; // Prevent reconnect during cleanup
      disconnect();
    };
  }, [enabled, connect, disconnect, reconnect]);


  const manualReconnect = useCallback(() => {
    shouldReconnectRef.current = true;
    connect();
  }, [connect]);

  return {
    isConnected,
    lastMessage,
    error,
    reconnect: manualReconnect,
    disconnect,
  };
};
