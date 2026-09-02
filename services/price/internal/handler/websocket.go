package handler

import (
	"context"
	"encoding/json"
	"net/http"
	"strings"
	"sync"
	"sync/atomic"
	"time"

	"github.com/gorilla/websocket"
	"github.com/redis/go-redis/v9"
	"go.uber.org/zap"
)

const (
	wsWriteBufSize   = 256
	wsPingInterval   = 30 * time.Second
	wsPongWait       = 60 * time.Second
	wsWriteWait      = 10 * time.Second
	wsMaxMessageSize = 512
)

var upgrader = websocket.Upgrader{
	ReadBufferSize:  1024,
	WriteBufferSize: 1024,
	CheckOrigin:     func(r *http.Request) bool { return true },
}

type Hub struct {
	clients    sync.Map
	symbolSubs sync.Map
	broadcast  chan []byte
	register   chan *Client
	unregister chan *Client
	logger     *zap.Logger
	redis      *redis.Client
	interval   time.Duration
	cancel     context.CancelFunc
	clientCount int64
}

type Client struct {
	hub     *Hub
	conn    *websocket.Conn
	send    chan []byte
	symbols sync.Map
}

type PriceUpdate struct {
	Symbol        string  `json:"symbol"`
	Price         float64 `json:"price"`
	Change        float64 `json:"change"`
	ChangePercent float64 `json:"change_percent"`
	Volume        int64   `json:"volume"`
	Timestamp     int64   `json:"timestamp"`
}

type wsMessage struct {
	Type    string   `json:"type"`
	Symbols []string `json:"symbols"`
}

func NewHub(logger *zap.Logger, rdb *redis.Client, interval time.Duration) *Hub {
	return &Hub{
		broadcast:  make(chan []byte, 1024),
		register:   make(chan *Client, 256),
		unregister: make(chan *Client, 256),
		logger:     logger,
		redis:      rdb,
		interval:   interval,
	}
}

func (h *Hub) Run(ctx context.Context) {
	ctx, cancel := context.WithCancel(ctx)
	h.cancel = cancel

	go h.broadcastPrices(ctx)

	for {
		select {
		case <-ctx.Done():
			h.clients.Range(func(key, value interface{}) bool {
				c := key.(*Client)
				close(c.send)
				h.clients.Delete(c)
				return true
			})
			return
		case client := <-h.register:
			h.clients.Store(client, true)
			atomic.AddInt64(&h.clientCount, 1)
			h.logger.Info("ws client connected", zap.Int64("total", atomic.LoadInt64(&h.clientCount)))

		case client := <-h.unregister:
			if _, loaded := h.clients.LoadAndDelete(client); loaded {
				client.symbols.Range(func(key, value interface{}) bool {
					h.removeSymbolSub(key.(string), client)
					return true
				})
				atomic.AddInt64(&h.clientCount, -1)
				h.logger.Info("ws client disconnected", zap.Int64("total", atomic.LoadInt64(&h.clientCount)))
			}
		}
	}
}

func (h *Hub) addSymbolSub(symbol string, client *Client) {
	val, _ := h.symbolSubs.LoadOrStore(symbol, &sync.Map{})
	subs := val.(*sync.Map)
	subs.Store(client, true)
}

func (h *Hub) removeSymbolSub(symbol string, client *Client) {
	if val, ok := h.symbolSubs.Load(symbol); ok {
		subs := val.(*sync.Map)
		subs.Delete(client)
	}
}

func (h *Hub) GetSubscribedSymbols() map[string]bool {
	symbols := make(map[string]bool)
	h.symbolSubs.Range(func(key, value interface{}) bool {
		symbols[key.(string)] = true
		return true
	})
	return symbols
}

func (h *Hub) broadcastPrices(ctx context.Context) {
	ticker := time.NewTicker(h.interval)
	defer ticker.Stop()

	for {
		select {
		case <-ctx.Done():
			return
		case <-ticker.C:
			allSymbols := h.GetSubscribedSymbols()
			if len(allSymbols) == 0 {
				continue
			}

			keys := make([]string, 0, len(allSymbols))
			for sym := range allSymbols {
				keys = append(keys, "price:"+sym)
			}

			vals, err := h.redis.MGet(ctx, keys...).Result()
			if err != nil {
				h.logger.Error("failed to fetch prices from redis", zap.Error(err))
				continue
			}

			prices := make(map[string]PriceUpdate)
			for i, val := range vals {
				if val == nil {
					continue
				}
				data, ok := val.(string)
				if !ok {
					continue
				}
				var price PriceUpdate
				if err := json.Unmarshal([]byte(data), &price); err != nil {
					continue
				}
				sym := strings.TrimPrefix(keys[i], "price:")
				price.Symbol = sym
				prices[sym] = price
			}

			if len(prices) == 0 {
				continue
			}

			h.clients.Range(func(key, value interface{}) bool {
				c := key.(*Client)
				payload := h.filterPayload(c, prices)
				if len(payload) == 0 {
					return true
				}
				msg, _ := json.Marshal(map[string]interface{}{
					"type": "prices",
					"data": payload,
					"time": time.Now().UnixMilli(),
				})
				select {
				case c.send <- msg:
				default:
					go func() { h.unregister <- c }()
				}
				return true
			})
		}
	}
}

func (h *Hub) filterPayload(c *Client, prices map[string]PriceUpdate) map[string]PriceUpdate {
	payload := make(map[string]PriceUpdate)
	c.symbols.Range(func(key, value interface{}) bool {
		sym := key.(string)
		if p, ok := prices[sym]; ok {
			payload[sym] = p
		}
		return true
	})
	return payload
}

func (h *Hub) HandleWebSocket(w http.ResponseWriter, r *http.Request) {
	conn, err := upgrader.Upgrade(w, r, nil)
	if err != nil {
		h.logger.Error("failed to upgrade websocket", zap.Error(err))
		return
	}

	client := &Client{
		hub:  h,
		conn: conn,
		send: make(chan []byte, wsWriteBufSize),
	}

	h.register <- client

	go client.writePump()
	go client.readPump()
}

func (h *Hub) BroadcastRaw(msg []byte) {
	select {
	case h.broadcast <- msg:
	default:
	}
}

func (h *Hub) BroadcastToSubscribers(symbol string, msg []byte) {
	if val, ok := h.symbolSubs.Load(symbol); ok {
		subs := val.(*sync.Map)
		subs.Range(func(key, value interface{}) bool {
			c := key.(*Client)
			select {
			case c.send <- msg:
			default:
				go func() { h.unregister <- c }()
			}
			return true
		})
	}
}

func (h *Hub) GetClientCount() int {
	return int(atomic.LoadInt64(&h.clientCount))
}

func (h *Hub) Stop() {
	if h.cancel != nil {
		h.cancel()
	}
}

func (c *Client) readPump() {
	defer func() {
		c.hub.unregister <- c
		c.conn.Close()
	}()

	c.conn.SetReadLimit(wsMaxMessageSize)
	c.conn.SetReadDeadline(time.Now().Add(wsPongWait))
	c.conn.SetPongHandler(func(string) error {
		c.conn.SetReadDeadline(time.Now().Add(wsPongWait))
		return nil
	})

	for {
		_, message, err := c.conn.ReadMessage()
		if err != nil {
			if websocket.IsUnexpectedCloseError(err, websocket.CloseGoingAway, websocket.CloseAbnormalClosure) {
				c.hub.logger.Error("ws read error", zap.Error(err))
			}
			break
		}

		var msg wsMessage
		if err := json.Unmarshal(message, &msg); err != nil {
			continue
		}

		switch msg.Type {
		case "subscribe":
			for _, sym := range msg.Symbols {
				c.symbols.Store(sym, true)
				c.hub.addSymbolSub(sym, c)
			}
			c.sendJSON(map[string]interface{}{"type": "subscribed", "symbols": msg.Symbols})
		case "unsubscribe":
			for _, sym := range msg.Symbols {
				c.symbols.Delete(sym)
				c.hub.removeSymbolSub(sym, c)
			}
			c.sendJSON(map[string]interface{}{"type": "unsubscribed", "symbols": msg.Symbols})
		case "ping":
			c.sendJSON(map[string]interface{}{"type": "pong", "time": time.Now().UnixMilli()})
		}
	}
}

func (c *Client) sendJSON(v interface{}) {
	data, err := json.Marshal(v)
	if err != nil {
		return
	}
	select {
	case c.send <- data:
	default:
	}
}

func (c *Client) writePump() {
	ticker := time.NewTicker(wsPingInterval)
	defer func() {
		ticker.Stop()
		c.conn.Close()
	}()

	for {
		select {
		case message, ok := <-c.send:
			c.conn.SetWriteDeadline(time.Now().Add(wsWriteWait))
			if !ok {
				c.conn.WriteMessage(websocket.CloseMessage, []byte{})
				return
			}
			w, err := c.conn.NextWriter(websocket.TextMessage)
			if err != nil {
				return
			}
			w.Write(message)
			if err := w.Close(); err != nil {
				return
			}

		case <-ticker.C:
			c.conn.SetWriteDeadline(time.Now().Add(wsWriteWait))
			if err := c.conn.WriteMessage(websocket.PingMessage, nil); err != nil {
				return
			}
		}
	}
}
