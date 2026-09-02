package proxy

import (
	"encoding/json"
	"fmt"
	"net"
	"net/http"
	"os/exec"
	"runtime"
	"time"

	"go.uber.org/zap"
)

type VPNConfig struct {
	Provider string
	Server   string
	Protocol string
	Port     int
	Username string
	Password string
}

type VPN struct {
	config VPNConfig
	logger *zap.Logger
	connected bool
}

func NewVPN(cfg VPNConfig, logger *zap.Logger) *VPN {
	return &VPN{
		config: cfg,
		logger: logger,
	}
}

func (v *VPN) Connect() error {
	v.logger.Info("connecting to VPN",
		zap.String("provider", v.config.Provider),
		zap.String("server", v.config.Server),
	)

	switch v.config.Provider {
	case "wireguard":
		return v.connectWireGuard()
	case "openvpn":
		return v.connectOpenVPN()
	case "nordvpn":
		return v.connectNordVPN()
	default:
		return fmt.Errorf("unsupported VPN provider: %s", v.config.Provider)
	}
}

func (v *VPN) connectWireGuard() error {
	if runtime.GOOS == "linux" {
		cmd := exec.Command("wg-quick", "up", v.config.Server)
		if output, err := cmd.CombinedOutput(); err != nil {
			return fmt.Errorf("wireguard connect failed: %s: %w", string(output), err)
		}
	}
	v.connected = true
	v.logger.Info("wireguard VPN connected")
	return nil
}

func (v *VPN) connectOpenVPN() error {
	configPath := fmt.Sprintf("/etc/openvpn/%s.conf", v.config.Server)
	cmd := exec.Command("openvpn", "--config", configPath)
	if output, err := cmd.CombinedOutput(); err != nil {
		return fmt.Errorf("openvpn connect failed: %s: %w", string(output), err)
	}
	v.connected = true
	v.logger.Info("openvpn connected")
	return nil
}

func (v *VPN) connectNordVPN() error {
	cmd := exec.Command("nordvpn", "connect", v.config.Server)
	if output, err := cmd.CombinedOutput(); err != nil {
		return fmt.Errorf("nordvpn connect failed: %s: %w", string(output), err)
	}
	v.connected = true
	v.logger.Info("nordvpn connected")
	return nil
}

func (v *VPN) Disconnect() error {
	v.logger.Info("disconnecting VPN")

	switch v.config.Provider {
	case "wireguard":
		if runtime.GOOS == "linux" {
			cmd := exec.Command("wg-quick", "down", v.config.Server)
			if output, err := cmd.CombinedOutput(); err != nil {
				return fmt.Errorf("wireguard disconnect failed: %s: %w", string(output), err)
			}
		}
	case "openvpn":
		cmd := exec.Command("killall", "openvpn")
		if output, err := cmd.CombinedOutput(); err != nil {
			return fmt.Errorf("openvpn disconnect failed: %s: %w", string(output), err)
		}
	case "nordvpn":
		cmd := exec.Command("nordvpn", "disconnect")
		if output, err := cmd.CombinedOutput(); err != nil {
			return fmt.Errorf("nordvpn disconnect failed: %s: %w", string(output), err)
		}
	}

	v.connected = false
	return nil
}

func (v *VPN) IsConnected() bool {
	return v.connected
}

func (v *VPN) GetExternalIP() (string, error) {
	resp, err := http.Get("https://api.ipify.org?format=json")
	if err != nil {
		return "", fmt.Errorf("failed to get external IP: %w", err)
	}
	defer resp.Body.Close()

	var result struct {
		IP string `json:"ip"`
	}
	if err := json.NewDecoder(resp.Body).Decode(&result); err != nil {
		return "", fmt.Errorf("failed to decode IP response: %w", err)
	}

	return result.IP, nil
}

func (v *VPN) WaitForConnection(timeout time.Duration) error {
	deadline := time.Now().Add(timeout)
	for time.Now().Before(deadline) {
		conn, err := net.DialTimeout("tcp", "8.8.8.8:53", 5*time.Second)
		if err == nil {
			conn.Close()
			return nil
		}
		time.Sleep(time.Second)
	}
	return fmt.Errorf("timeout waiting for VPN connection")
}

func (v *VPN) RotateServer() error {
	v.logger.Info("rotating VPN server")

	if err := v.Disconnect(); err != nil {
		return fmt.Errorf("failed to disconnect: %w", err)
	}

	time.Sleep(2 * time.Second)

	if err := v.Connect(); err != nil {
		return fmt.Errorf("failed to reconnect: %w", err)
	}

	return nil
}
