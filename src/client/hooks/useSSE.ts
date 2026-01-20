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

  const disconnect = useCallback(() => {
    shouldReconnectRef.current = false;

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
    if (eventSourceRef.current) {
      disconnect();
    }

    try {
      const eventSource = new EventSource(url);
      eventSourceRef.current = eventSource;

      eventSource.onopen = () => {
        setIsConnected(true);
        setError(null);
        onOpen?.();
      };

      eventSource.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          setLastMessage(data);
          onMessage?.(data);
        } catch (err) {
          console.error('Failed to parse SSE message:', err);
        }
      };

      eventSource.onerror = (err) => {
        setError(err);
        setIsConnected(false);
        onError?.(err);

        if (shouldReconnectRef.current) {
          reconnectTimeoutRef.current = setTimeout(() => {
            connect();
          }, reconnectInterval);
        }
      };
    } catch (err) {
      console.error('Failed to create EventSource:', err);
    }
  }, [url, onMessage, onError, onOpen, disconnect, reconnectInterval]);

  useEffect(() => {
    shouldReconnectRef.current = reconnect;
  }, [reconnect]);

  useEffect(() => {
    if (enabled) {
      connect();
    }

    return () => {
      disconnect();
    };
  }, [enabled, connect, disconnect]);

  const manualReconnect = useCallback(() => {
    disconnect();
    shouldReconnectRef.current = true;
    connect();
  }, [connect, disconnect]);

  return {
    isConnected,
    lastMessage,
    error,
    reconnect: manualReconnect,
    disconnect,
  };
};
