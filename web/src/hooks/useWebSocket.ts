import { useEffect, useRef, useState, useCallback } from "react";

interface PriceTick {
  price: number;
  change: number;
  changePct: number;
  volume: number | null;
}

interface WSMessage {
  type: string;
  data?: Record<string, PriceTick>;
  time?: number;
  symbol?: string;
  direction?: string;
  price?: number;
  note?: string;
  message?: string;
}

export function useWebSocket(symbols: string[]) {
  const wsRef = useRef<WebSocket | null>(null);
  const [connected, setConnected] = useState(false);
  const [prices, setPrices] = useState<Map<string, PriceTick>>(new Map());
  const [alerts, setAlerts] = useState<Array<WSMessage & { id: number }>>([]);
  const reconnectTimer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const symbolsRef = useRef(symbols);

  symbolsRef.current = symbols;

  const connect = useCallback(() => {
    if (wsRef.current?.readyState === WebSocket.OPEN) return;

    const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
    const host = window.location.host;
    const url = `${protocol}//${host}/ws`;

    try {
      const ws = new WebSocket(url);
      wsRef.current = ws;

      ws.onopen = () => {
        setConnected(true);
        if (symbolsRef.current.length) {
          ws.send(JSON.stringify({ type: "subscribe", symbols: symbolsRef.current }));
        }
      };

      ws.onmessage = (event) => {
        try {
          const msg: WSMessage = JSON.parse(String(event.data));
          if (msg.type === "prices" && msg.data) {
            setPrices((prev) => {
              const next = new Map(prev);
              for (const [sym, tick] of Object.entries(msg.data!)) {
                next.set(sym, tick);
              }
              return next;
            });
          }
          if (msg.type === "alert" && msg.symbol) {
            setAlerts((prev) => [
              { ...msg, id: Date.now() },
              ...prev,
            ].slice(0, 20));
          }
        } catch {}
      };

      ws.onclose = () => {
        setConnected(false);
        reconnectTimer.current = setTimeout(connect, 3000);
      };

      ws.onerror = () => {
        ws.close();
      };
    } catch {}
  }, []);

  useEffect(() => {
    connect();
    return () => {
      clearTimeout(reconnectTimer.current);
      wsRef.current?.close();
    };
  }, [connect]);

  useEffect(() => {
    if (wsRef.current?.readyState === WebSocket.OPEN && symbols.length) {
      wsRef.current.send(JSON.stringify({ type: "subscribe", symbols }));
    }
  }, [symbols]);

  const unsubscribe = useCallback((syms: string[]) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({ type: "unsubscribe", symbols: syms }));
    }
  }, []);

  const dismissAlert = useCallback((id: number) => {
    setAlerts((prev) => prev.filter((a) => a.id !== id));
  }, []);

  return { connected, prices, alerts, unsubscribe, dismissAlert };
}
