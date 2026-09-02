package ws

import (
	"context"
	"database/sql"
	"encoding/json"
	"log"
	"net/http"
	"sync"
	"time"

	"github.com/gorilla/websocket"
)

var upgrader = websocket.Upgrader{
	CheckOrigin:     func(r *http.Request) bool { return true },
	ReadBufferSize:  1024,
	WriteBufferSize: 1024,
}

type Client struct {
	conn    *websocket.Conn
	symbols map[string]bool
	send    chan []byte
}

type Hub struct {
	clients    map[*Client]bool
	register   chan *Client
	unregister chan *Client
	broadcast  chan []byte
	db         *sql.DB
	mu         sync.RWMutex
	interval   time.Duration
	cancel     context.CancelFunc
}

type PricesMessage struct {
	Type string                 `json:"type"`
	Data map[string]PriceData   `json:"data"`
	Time int64                  `json:"time"`
}

type PriceData struct {
	Price     float64 `json:"price"`
	Change    float64 `json:"change"`
	ChangePct float64 `json:"changePct"`
	Volume    *int64  `json:"volume"`
}

type SubscribeMessage struct {
	Type    string   `json:"type"`
	Symbols []string `json:"symbols"`
}

func NewHub(db *sql.DB, interval time.Duration) *Hub {
	return &Hub{
		clients:    make(map[*Client]bool),
		register:   make(chan *Client),
		unregister: make(chan *Client),
		broadcast:  make(chan []byte, 256),
		db:         db,
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
			return
		case client := <-h.register:
			h.mu.Lock()
			h.clients[client] = true
			h.mu.Unlock()
			log.Printf("WebSocket client connected, total: %d", h.ClientCount())

		case client := <-h.unregister:
			h.mu.Lock()
			if _, ok := h.clients[client]; ok {
				delete(h.clients, client)
				close(client.send)
			}
			h.mu.Unlock()
			log.Printf("WebSocket client disconnected, total: %d", h.ClientCount())

		case message := <-h.broadcast:
			h.mu.RLock()
			for client := range h.clients {
				select {
				case client.send <- message:
				default:
					close(client.send)
					delete(h.clients, client)
				}
			}
			h.mu.RUnlock()
		}
	}
}

func (h *Hub) HandleWS(w http.ResponseWriter, r *http.Request) {
	conn, err := upgrader.Upgrade(w, r, nil)
	if err != nil {
		log.Printf("WebSocket upgrade failed: %v", err)
		return
	}

	client := &Client{
		conn:    conn,
		symbols: make(map[string]bool),
		send:    make(chan []byte, 256),
	}

	h.register <- client

	go client.writePump()
	go client.readPump(h)
}

func (h *Hub) Stop() {
	if h.cancel != nil {
		h.cancel()
	}
	h.mu.Lock()
	for client := range h.clients {
		close(client.send)
		delete(h.clients, client)
	}
	h.mu.Unlock()
}

func (h *Hub) ClientCount() int {
	h.mu.RLock()
	defer h.mu.RUnlock()
	return len(h.clients)
}

func (h *Hub) broadcastPrices(ctx context.Context) {
	ticker := time.NewTicker(h.interval)
	defer ticker.Stop()

	for {
		select {
		case <-ctx.Done():
			return
		case <-ticker.C:
			h.mu.RLock()
			allSymbols := make(map[string]bool)
			for client := range h.clients {
				for sym := range client.symbols {
					allSymbols[sym] = true
				}
			}
			h.mu.RUnlock()

			if len(allSymbols) == 0 {
				continue
			}

			prices := h.fetchPrices(allSymbols)

			h.mu.RLock()
			for client := range h.clients {
				payload := make(map[string]PriceData)
				for sym := range client.symbols {
					if data, ok := prices[sym]; ok {
						payload[sym] = data
					}
				}
				if len(payload) > 0 {
					msg := PricesMessage{Type: "prices", Data: payload, Time: time.Now().UnixMilli()}
					if bytes, err := json.Marshal(msg); err == nil {
						select {
						case client.send <- bytes:
						default:
						}
					}
				}
			}
			h.mu.RUnlock()
		}
	}
}

func (h *Hub) fetchPrices(symbols map[string]bool) map[string]PriceData {
	prices := make(map[string]PriceData)

	for sym := range symbols {
		var price, change, changePct float64
		var volume sql.NullInt64
		err := h.db.QueryRow(`
			SELECT q.price, q.change, q.change_pct, q.volume
			FROM quotes q JOIN stocks s ON q.stock_id = s.id
			WHERE s.yahoo = ?
		`, sym).Scan(&price, &change, &changePct, &volume)
		if err != nil {
			continue
		}
		pd := PriceData{Price: price, Change: change, ChangePct: changePct}
		if volume.Valid {
			pd.Volume = &volume.Int64
		}
		prices[sym] = pd
	}

	return prices
}

func (c *Client) readPump(h *Hub) {
	defer func() {
		h.unregister <- c
		c.conn.Close()
	}()

	c.conn.SetReadLimit(512)
	c.conn.SetReadDeadline(time.Now().Add(60 * time.Second))
	c.conn.SetPongHandler(func(string) error {
		c.conn.SetReadDeadline(time.Now().Add(60 * time.Second))
		return nil
	})

	for {
		_, message, err := c.conn.ReadMessage()
		if err != nil {
			break
		}

		var msg struct {
			Type    string   `json:"type"`
			Symbols []string `json:"symbols"`
		}
		if err := json.Unmarshal(message, &msg); err != nil {
			continue
		}

		switch msg.Type {
		case "subscribe":
			h.mu.Lock()
			for _, sym := range msg.Symbols {
				c.symbols[sym] = true
			}
			h.mu.Unlock()
		case "unsubscribe":
			h.mu.Lock()
			for _, sym := range msg.Symbols {
				delete(c.symbols, sym)
			}
			h.mu.Unlock()
		case "ping":
			pong := map[string]interface{}{"type": "pong", "time": time.Now().UnixMilli()}
			if bytes, err := json.Marshal(pong); err == nil {
				c.send <- bytes
			}
		}
	}
}

func (c *Client) writePump() {
	ticker := time.NewTicker(30 * time.Second)
	defer func() {
		ticker.Stop()
		c.conn.Close()
	}()

	for {
		select {
		case message, ok := <-c.send:
			c.conn.SetWriteDeadline(time.Now().Add(10 * time.Second))
			if !ok {
				c.conn.WriteMessage(websocket.CloseMessage, []byte{})
				return
			}
			c.conn.WriteMessage(websocket.TextMessage, message)

		case <-ticker.C:
			c.conn.SetWriteDeadline(time.Now().Add(10 * time.Second))
			if err := c.conn.WriteMessage(websocket.PingMessage, nil); err != nil {
				return
			}
		}
	}
}
