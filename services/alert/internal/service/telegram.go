package service

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"sync"
	"time"

	"go.uber.org/zap"
)

const (
	telegramRateLimit = 30 // messages per second
	telegramAPIBase   = "https://api.telegram.org"
)

type TelegramBot struct {
	botToken string
	chatID   string
	logger   *zap.Logger
	client   *http.Client

	rateLimiter chan struct{}
	mu          sync.Mutex
}

type TelegramConfig struct {
	BotToken string
	ChatID   string
}

type TelegramInlineKeyboard struct {
	InlineKeyboard [][]TelegramKeyboardButton `json:"inline_keyboard"`
}

type TelegramKeyboardButton struct {
	Text         string `json:"text"`
	CallbackData string `json:"callback_data,omitempty"`
	URL          string `json:"url,omitempty"`
}

type TelegramSendMessageRequest struct {
	ChatID      string                      `json:"chat_id"`
	Text        string                      `json:"text"`
	ParseMode   string                      `json:"parse_mode,omitempty"`
	ReplyMarkup *TelegramInlineKeyboard     `json:"reply_markup,omitempty"`
}

type TelegramResponse struct {
	OK     bool            `json:"ok"`
	Result json.RawMessage `json:"result,omitempty"`
	Description string      `json:"description,omitempty"`
	ErrorCode   int         `json:"error_code,omitempty"`
}

func NewTelegramBot(cfg TelegramConfig, logger *zap.Logger) *TelegramBot {
	bot := &TelegramBot{
		botToken: cfg.BotToken,
		chatID:   cfg.ChatID,
		logger:   logger,
		client: &http.Client{
			Timeout: 10 * time.Second,
		},
		rateLimiter: make(chan struct{}, telegramRateLimit),
	}

	for i := 0; i < telegramRateLimit; i++ {
		bot.rateLimiter <- struct{}{}
	}

	go bot.refillRateLimiter()

	return bot
}

func (t *TelegramBot) refillRateLimiter() {
	ticker := time.NewTicker(time.Second / time.Duration(telegramRateLimit))
	defer ticker.Stop()

	for range ticker.C {
		select {
		case t.rateLimiter <- struct{}{}:
		default:
		}
	}
}

func (t *TelegramBot) acquireToken(ctx context.Context) error {
	select {
	case <-ctx.Done():
		return ctx.Err()
	case <-t.rateLimiter:
		return nil
	}
}

func (t *TelegramBot) Send(ctx context.Context, msg NotificationMessage) error {
	if t.botToken == "" || t.chatID == "" {
		t.logger.Debug("telegram not configured, skipping")
		return nil
	}

	if err := t.acquireToken(ctx); err != nil {
		return fmt.Errorf("rate limiter context done: %w", err)
	}

	text := t.formatMessage(msg)

	req := TelegramSendMessageRequest{
		ChatID:    t.chatID,
		Text:      text,
		ParseMode: "Markdown",
		ReplyMarkup: &TelegramInlineKeyboard{
			InlineKeyboard: [][]TelegramKeyboardButton{
				{
					{
						Text:         "View Stock",
						CallbackData: fmt.Sprintf("view:%s", msg.Symbol),
						URL:          fmt.Sprintf("https://www.google.com/finance/quote/%s", msg.Symbol),
					},
					{
						Text:         "Dismiss",
						CallbackData: fmt.Sprintf("dismiss:%s", msg.AlertID),
					},
				},
			},
		},
	}

	return t.sendMessage(ctx, req)
}

func (t *TelegramBot) SendSimple(ctx context.Context, text string) error {
	if t.botToken == "" || t.chatID == "" {
		return nil
	}

	if err := t.acquireToken(ctx); err != nil {
		return fmt.Errorf("rate limiter context done: %w", err)
	}

	req := TelegramSendMessageRequest{
		ChatID:    t.chatID,
		Text:      text,
		ParseMode: "Markdown",
	}

	return t.sendMessage(ctx, req)
}

func (t *TelegramBot) sendMessage(ctx context.Context, req TelegramSendMessageRequest) error {
	data, err := json.Marshal(req)
	if err != nil {
		return fmt.Errorf("failed to marshal telegram payload: %w", err)
	}

	url := fmt.Sprintf("%s/bot%s/sendMessage", telegramAPIBase, t.botToken)

	httpReq, err := http.NewRequestWithContext(ctx, "POST", url, bytes.NewBuffer(data))
	if err != nil {
		return fmt.Errorf("failed to create request: %w", err)
	}
	httpReq.Header.Set("Content-Type", "application/json")

	resp, err := t.client.Do(httpReq)
	if err != nil {
		return fmt.Errorf("failed to send telegram message: %w", err)
	}
	defer resp.Body.Close()

	body, _ := io.ReadAll(resp.Body)

	var telegramResp TelegramResponse
	if err := json.Unmarshal(body, &telegramResp); err != nil {
		return fmt.Errorf("failed to unmarshal telegram response: %w", err)
	}

	if !telegramResp.OK {
		t.logger.Error("telegram API error",
			zap.Int("error_code", telegramResp.ErrorCode),
			zap.String("description", telegramResp.Description),
		)
		return fmt.Errorf("telegram API error %d: %s", telegramResp.ErrorCode, telegramResp.Description)
	}

	t.logger.Info("telegram message sent",
		zap.String("chat_id", t.chatID),
	)

	return nil
}

func (t *TelegramBot) formatMessage(msg NotificationMessage) string {
	emoji := "📈"
	if msg.Value < msg.Target {
		emoji = "📉"
	}

	return fmt.Sprintf(
		"*%s %s*\n\n"+
			"`%s` %s `%s`\n\n"+
			"Current Price: *%.2f*\n"+
			"Target Price: *%.2f*\n"+
			"Condition: `%s`\n\n"+
			"_Alert ID: %s_",
		emoji,
		msg.Title,
		msg.Condition,
		msg.Symbol,
		msg.Condition,
		msg.Value,
		msg.Target,
		msg.Condition,
		msg.AlertID,
	)
}

func (t *TelegramBot) Name() string {
	return "telegram"
}
