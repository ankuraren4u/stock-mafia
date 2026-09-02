package service

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"time"

	"go.uber.org/zap"
)

const (
	discordAPIBase = "https://discord.com/api/v10"
)

type DiscordWebhook struct {
	webhookURL string
	logger     *zap.Logger
	client     *http.Client
}

type DiscordConfig struct {
	WebhookURL string
}

type DiscordEmbed struct {
	Title       string          `json:"title,omitempty"`
	Description string          `json:"description,omitempty"`
	URL         string          `json:"url,omitempty"`
	Color       int             `json:"color,omitempty"`
	Fields      []DiscordField  `json:"fields,omitempty"`
	Footer      *DiscordFooter  `json:"footer,omitempty"`
	Timestamp   string          `json:"timestamp,omitempty"`
	Author      *DiscordAuthor  `json:"author,omitempty"`
}

type DiscordField struct {
	Name   string `json:"name"`
	Value  string `json:"value"`
	Inline bool   `json:"inline"`
}

type DiscordFooter struct {
	Text    string `json:"text"`
	IconURL string `json:"icon_url,omitempty"`
}

type DiscordAuthor struct {
	Name    string `json:"name"`
	URL     string `json:"url,omitempty"`
	IconURL string `json:"icon_url,omitempty"`
}

type DiscordWebhookPayload struct {
	Username  string        `json:"username,omitempty"`
	AvatarURL string        `json:"avatar_url,omitempty"`
	Content   string        `json:"content,omitempty"`
	Embeds    []DiscordEmbed `json:"embeds,omitempty"`
}

type DiscordResponse struct {
	ID        string `json:"id"`
	Token     string `json:"token"`
}

const (
	colorGreen  = 0x00FF00
	colorRed    = 0xFF0000
	colorYellow = 0xFFFF00
	colorBlue   = 0x0099FF
	colorGray   = 0x808080
)

func NewDiscordWebhook(cfg DiscordConfig, logger *zap.Logger) *DiscordWebhook {
	return &DiscordWebhook{
		webhookURL: cfg.WebhookURL,
		logger:     logger,
		client: &http.Client{
			Timeout: 10 * time.Second,
		},
	}
}

func (d *DiscordWebhook) Send(ctx context.Context, msg NotificationMessage) error {
	if d.webhookURL == "" {
		d.logger.Debug("discord webhook not configured, skipping")
		return nil
	}

	embed := d.buildEmbed(msg)

	payload := DiscordWebhookPayload{
		Embeds: []DiscordEmbed{embed},
	}

	data, err := json.Marshal(payload)
	if err != nil {
		return fmt.Errorf("failed to marshal discord payload: %w", err)
	}

	req, err := http.NewRequestWithContext(ctx, "POST", d.webhookURL, bytes.NewBuffer(data))
	if err != nil {
		return fmt.Errorf("failed to create request: %w", err)
	}
	req.Header.Set("Content-Type", "application/json")

	resp, err := d.client.Do(req)
	if err != nil {
		return fmt.Errorf("failed to send discord webhook: %w", err)
	}
	defer resp.Body.Close()

	body, _ := io.ReadAll(resp.Body)

	if resp.StatusCode != http.StatusNoContent && resp.StatusCode != http.StatusOK {
		d.logger.Error("discord webhook failed",
			zap.Int("status", resp.StatusCode),
			zap.String("body", string(body)),
		)
		return fmt.Errorf("discord webhook returned status %d", resp.StatusCode)
	}

	d.logger.Info("discord webhook sent",
		zap.String("symbol", msg.Symbol),
		zap.String("alert_id", msg.AlertID),
	)

	return nil
}

func (d *DiscordWebhook) buildEmbed(msg NotificationMessage) DiscordEmbed {
	color := colorGreen
	if msg.Value < msg.Target {
		color = colorRed
	}

	embed := DiscordEmbed{
		Title:       fmt.Sprintf("🚨 %s", msg.Title),
		Description: fmt.Sprintf("**%s** price alert triggered!", msg.Symbol),
		Color:       color,
		Fields: []DiscordField{
			{
				Name:   "Symbol",
				Value:  fmt.Sprintf("`%s`", msg.Symbol),
				Inline: true,
			},
			{
				Name:   "Current Price",
				Value:  fmt.Sprintf("**%.2f**", msg.Value),
				Inline: true,
			},
			{
				Name:   "Target Price",
				Value:  fmt.Sprintf("**%.2f**", msg.Target),
				Inline: true,
			},
			{
				Name:   "Condition",
				Value:  fmt.Sprintf("`%s`", msg.Condition),
				Inline: true,
			},
			{
				Name:   "Alert ID",
				Value:  fmt.Sprintf("`%s`", msg.AlertID),
				Inline: true,
			},
			{
				Name:   "Time",
				Value:  fmt.Sprintf("<t:%d:R>", msg.TriggeredAt.Unix()),
				Inline: true,
			},
		},
		Footer: &DiscordFooter{
			Text:    "StockMafia Trading Platform",
			IconURL: "https://img.icons8.com/color/48/stocks.png",
		},
		Timestamp: msg.TriggeredAt.Format(time.RFC3339),
	}

	return embed
}

func (d *DiscordWebhook) SendSimple(ctx context.Context, content string) error {
	if d.webhookURL == "" {
		return nil
	}

	payload := DiscordWebhookPayload{
		Content: content,
	}

	data, err := json.Marshal(payload)
	if err != nil {
		return fmt.Errorf("failed to marshal discord payload: %w", err)
	}

	req, err := http.NewRequestWithContext(ctx, "POST", d.webhookURL, bytes.NewBuffer(data))
	if err != nil {
		return fmt.Errorf("failed to create request: %w", err)
	}
	req.Header.Set("Content-Type", "application/json")

	resp, err := d.client.Do(req)
	if err != nil {
		return fmt.Errorf("failed to send discord webhook: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusNoContent && resp.StatusCode != http.StatusOK {
		return fmt.Errorf("discord webhook returned status %d", resp.StatusCode)
	}

	return nil
}

func (d *DiscordWebhook) Name() string {
	return "discord"
}
