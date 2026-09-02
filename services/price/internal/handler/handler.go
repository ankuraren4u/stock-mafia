package handler

import (
	"database/sql"
	"encoding/json"
	"log"
	"net/http"
	"time"

	"github.com/stockmafia/trading-app/services/price/internal/repository"
	"github.com/stockmafia/trading-app/services/price/internal/ws"
)

type GRPCServer struct {
	repo *repository.Repository
	hub  *ws.Hub
}

func NewGRPCServer(repo *repository.Repository, hub *ws.Hub) *GRPCServer {
	return &GRPCServer{repo: repo, hub: hub}
}

func HandleSSE(repo *repository.Repository, hub *ws.Hub) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "text/event-stream")
		w.Header().Set("Cache-Control", "no-cache")
		w.Header().Set("Connection", "keep-alive")
		w.Header().Set("Access-Control-Allow-Origin", "*")

		flusher, ok := w.(http.Flusher)
		if !ok {
			http.Error(w, "SSE not supported", http.StatusInternalServerError)
			return
		}

		ctx := r.Context()
		ticker := time.NewTicker(5 * time.Second)
		defer ticker.Stop()

		for {
			select {
			case <-ctx.Done():
				return
			case <-ticker.C:
				quotes, err := repo.GetAllQuotes()
				if err != nil {
					log.Printf("SSE fetch error: %v", err)
					continue
				}

				data, _ := json.Marshal(map[string]interface{}{
					"type":  "quotes",
					"data":  quotes,
					"time":  time.Now().UnixMilli(),
				})

				_, err = w.Write([]byte("data: " + string(data) + "\n\n"))
				if err != nil {
					return
				}
				flusher.Flush()
			}
		}
	}
}

func (s *GRPCServer) GetAllQuotes() []map[string]interface{} {
	db := s.repo.DB()
	rows, err := db.Query(`
		SELECT s.yahoo, s.symbol, q.price, q.change, q.change_pct, q.volume
		FROM quotes q JOIN stocks s ON q.stock_id = s.id
	`)
	if err != nil {
		return nil
	}
	defer rows.Close()

	var quotes []map[string]interface{}
	for rows.Next() {
		var yahoo, symbol string
		var price, change, changePct float64
		var volume sql.NullInt64
		if err := rows.Scan(&yahoo, &symbol, &price, &change, &changePct, &volume); err != nil {
			continue
		}
		q := map[string]interface{}{
			"yahoo":     yahoo,
			"symbol":    symbol,
			"price":     price,
			"change":    change,
			"changePct": changePct,
		}
		if volume.Valid {
			q["volume"] = volume.Int64
		}
		quotes = append(quotes, q)
	}
	return quotes
}
