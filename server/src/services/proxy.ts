import type { Market } from "../lib/universe.js";

const UA = {
  "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
  Accept: "text/csv,text/plain,*/*",
};

// ─── Proxy Pool ──────────────────────────────────────────────

interface ProxyConfig {
  url: string;
  type: "http" | "https" | "socks5";
  username?: string;
  password?: string;
}

interface ProxyHealth {
  url: string;
  successes: number;
  failures: number;
  lastUsed: number;
  lastSuccess: number;
  lastFailure: number;
  avgLatency: number;
  latencySamples: number[];
  healthy: boolean;
}

const proxyPool: ProxyHealth[] = [];
let proxyIndex = 0;

export function loadProxies(proxyList: string[]) {
  proxyPool.length = 0;
  for (const url of proxyList) {
    if (!url.trim() || url.startsWith("#")) continue;
    proxyPool.push({
      url: url.trim(),
      successes: 0,
      failures: 0,
      lastUsed: 0,
      lastSuccess: 0,
      lastFailure: 0,
      avgLatency: 0,
      latencySamples: [],
      healthy: true,
    });
  }
  console.log(`[proxy] Loaded ${proxyPool.length} proxies`);
}

function getNextProxy(): ProxyConfig | null {
  if (proxyPool.length === 0) return null;
  
  // Find a healthy proxy, skip recently failed ones
  const now = Date.now();
  for (let i = 0; i < proxyPool.length; i++) {
    const idx = (proxyIndex + i) % proxyPool.length;
    const p = proxyPool[idx];
    if (p.healthy && (now - p.lastFailure > 30000 || p.failures === 0)) {
      proxyIndex = (idx + 1) % proxyPool.length;
      p.lastUsed = now;
      return { url: p.url, type: getProxyType(p.url) };
    }
  }
  
  // All proxies are unhealthy, reset health and try again
  for (const p of proxyPool) {
    p.healthy = true;
    p.failures = 0;
  }
  const p = proxyPool[0];
  p.lastUsed = now;
  return { url: p.url, type: getProxyType(p.url) };
}

function getProxyType(url: string): "http" | "https" | "socks5" {
  if (url.startsWith("socks5")) return "socks5";
  if (url.startsWith("https")) return "https";
  return "http";
}

function recordSuccess(proxyUrl: string, latencyMs: number) {
  const p = proxyPool.find((x) => x.url === proxyUrl);
  if (p) {
    p.successes++;
    p.lastSuccess = Date.now();
    p.latencySamples.push(latencyMs);
    if (p.latencySamples.length > 10) p.latencySamples.shift();
    p.avgLatency = p.latencySamples.reduce((a, b) => a + b, 0) / p.latencySamples.length;
    p.healthy = true;
  }
}

function recordFailure(proxyUrl: string) {
  const p = proxyPool.find((x) => x.url === proxyUrl);
  if (p) {
    p.failures++;
    p.lastFailure = Date.now();
    // Mark unhealthy after 3 consecutive failures
    if (p.failures >= 3 && p.failures > p.successes) {
      p.healthy = false;
    }
  }
}

export function getProxyStatus() {
  return proxyPool.map((p) => ({
    url: p.url,
    healthy: p.healthy,
    successes: p.successes,
    failures: p.failures,
    avgLatency: Math.round(p.avgLatency),
    lastUsed: p.lastUsed ? new Date(p.lastUsed).toISOString() : "never",
  }));
}

// ─── Domain Rate Limiter ─────────────────────────────────────

interface DomainLimiter {
  domain: string;
  concurrent: number;
  maxConcurrent: number;
  totalRequests: number;
  lastRequest: number;
  cooldownUntil: number;
}

const domainLimiters = new Map<string, DomainLimiter>();
const DOMAIN_MAX_CONCURRENT = 2;
const DOMAIN_MIN_DELAY_MS = 500;

function getDomainLimiter(domain: string): DomainLimiter {
  if (!domainLimiters.has(domain)) {
    domainLimiters.set(domain, {
      domain,
      concurrent: 0,
      maxConcurrent: DOMAIN_MAX_CONCURRENT,
      totalRequests: 0,
      lastRequest: 0,
      cooldownUntil: 0,
    });
  }
  return domainLimiters.get(domain)!;
}

async function acquireDomainSlot(domain: string): Promise<boolean> {
  const limiter = getDomainLimiter(domain);
  const now = Date.now();
  
  // Check cooldown
  if (now < limiter.cooldownUntil) {
    return false;
  }
  
  // Check concurrent limit
  if (limiter.concurrent >= limiter.maxConcurrent) {
    return false;
  }
  
  // Check minimum delay between requests
  if (now - limiter.lastRequest < DOMAIN_MIN_DELAY_MS) {
    await new Promise((r) => setTimeout(r, DOMAIN_MIN_DELAY_MS - (now - limiter.lastRequest)));
  }
  
  limiter.concurrent++;
  limiter.totalRequests++;
  limiter.lastRequest = Date.now();
  return true;
}

function releaseDomainSlot(domain: string) {
  const limiter = domainLimiters.get(domain);
  if (limiter) {
    limiter.concurrent = Math.max(0, limiter.concurrent - 1);
  }
}

function cooldownDomain(domain: string, ms: number) {
  const limiter = getDomainLimiter(domain);
  limiter.cooldownUntil = Date.now() + ms;
  limiter.concurrent = 0;
}

export function getDomainLimiters() {
  return Array.from(domainLimiters.values()).map((l) => ({
    domain: l.domain,
    concurrent: l.concurrent,
    maxConcurrent: l.maxConcurrent,
    totalRequests: l.totalRequests,
    cooldownUntil: l.cooldownUntil > Date.now() ? new Date(l.cooldownUntil).toISOString() : null,
  }));
}

// ─── Rate Limiters ───────────────────────────────────────────

interface RateLimiter {
  tokens: number;
  maxTokens: number;
  refillRate: number; // tokens per second
  lastRefill: number;
}

const rateLimiters = new Map<string, RateLimiter>();

function getRateLimiter(key: string, maxTokens: number, refillRate: number): RateLimiter {
  if (!rateLimiters.has(key)) {
    rateLimiters.set(key, {
      tokens: maxTokens,
      maxTokens,
      refillRate,
      lastRefill: Date.now(),
    });
  }
  const limiter = rateLimiters.get(key)!;
  
  // Refill tokens
  const now = Date.now();
  const elapsed = (now - limiter.lastRefill) / 1000;
  limiter.tokens = Math.min(limiter.maxTokens, limiter.tokens + elapsed * limiter.refillRate);
  limiter.lastRefill = now;
  
  return limiter;
}

async function waitForRateLimit(key: string, maxTokens: number, refillRate: number): Promise<void> {
  const limiter = getRateLimiter(key, maxTokens, refillRate);
  while (limiter.tokens < 1) {
    const waitMs = ((1 - limiter.tokens) / limiter.refillRate) * 1000;
    await new Promise((r) => setTimeout(r, Math.min(waitMs, 1000)));
    // Refill
    const now = Date.now();
    const elapsed = (now - limiter.lastRefill) / 1000;
    limiter.tokens = Math.min(limiter.maxTokens, limiter.tokens + elapsed * limiter.refillRate);
    limiter.lastRefill = now;
  }
  limiter.tokens--;
}

export function getRateLimiterStatus() {
  return Array.from(rateLimiters.entries()).map(([key, l]) => ({
    key,
    tokens: Math.floor(l.tokens),
    maxTokens: l.maxTokens,
    refillRate: l.refillRate,
  }));
}

// ─── Fetch with Proxy ────────────────────────────────────────

export async function fetchWithProxy(
  url: string,
  options: RequestInit = {},
  proxyConfig?: ProxyConfig,
): Promise<Response> {
  const proxy = proxyConfig || getNextProxy();
  const domain = new URL(url).hostname;
  
  // Wait for domain rate limit
  await waitForRateLimit(domain, 2, 1); // 2 tokens max, 1 per second
  
  // Acquire domain slot
  const acquired = await acquireDomainSlot(domain);
  if (!acquired) {
    await new Promise((r) => setTimeout(r, 1000));
    return fetchWithProxy(url, options, proxyConfig);
  }
  
  const startTime = Date.now();
  try {
    let response: Response;
    
    if (proxy) {
      // For now, use standard fetch with proxy headers
      // In production, use a proper HTTP client that supports proxies
      response = await fetch(url, {
        ...options,
        headers: {
          ...options.headers,
          "User-Agent": UA["User-Agent"],
          "X-Forwarded-For": getRandomIP(),
        },
      });
    } else {
      response = await fetch(url, {
        ...options,
        headers: {
          ...options.headers,
          ...UA,
        },
      });
    }
    
    const latency = Date.now() - startTime;
    
    if (proxy) {
      recordSuccess(proxy.url, latency);
    }
    
    // Handle rate limiting
    if (response.status === 429) {
      cooldownDomain(domain, 60000); // 1 minute cooldown
      throw new Error(`Rate limited by ${domain}`);
    }
    
    return response;
  } catch (err) {
    if (proxy) {
      recordFailure(proxy.url);
    }
    throw err;
  } finally {
    releaseDomainSlot(domain);
  }
}

function getRandomIP(): string {
  // Generate a random IP for X-Forwarded-For header
  return `${Math.floor(Math.random() * 200) + 10}.${Math.floor(Math.random() * 256)}.${Math.floor(Math.random() * 256)}.${Math.floor(Math.random() * 256)}`;
}

// ─── Circuit Breaker ─────────────────────────────────────────

interface CircuitBreakerState {
  failures: number;
  lastFailure: number;
  state: "closed" | "open" | "half-open";
  openUntil: number;
}

const circuitBreakers = new Map<string, CircuitBreakerState>();
const FAILURE_THRESHOLD = 5;
const RESET_TIMEOUT = 60000; // 1 minute

function getCircuitBreaker(source: string): CircuitBreakerState {
  if (!circuitBreakers.has(source)) {
    circuitBreakers.set(source, {
      failures: 0,
      lastFailure: 0,
      state: "closed",
      openUntil: 0,
    });
  }
  const cb = circuitBreakers.get(source)!;
  
  // Check if we should transition to half-open
  if (cb.state === "open" && Date.now() > cb.openUntil) {
    cb.state = "half-open";
  }
  
  return cb;
}

export function canRequest(source: string): boolean {
  const cb = getCircuitBreaker(source);
  return cb.state !== "open";
}

export function recordSourceSuccess(source: string) {
  const cb = getCircuitBreaker(source);
  cb.failures = 0;
  if (cb.state === "half-open") {
    cb.state = "closed";
  }
}

export function recordSourceFailure(source: string) {
  const cb = getCircuitBreaker(source);
  cb.failures++;
  cb.lastFailure = Date.now();
  
  if (cb.failures >= FAILURE_THRESHOLD) {
    cb.state = "open";
    cb.openUntil = Date.now() + RESET_TIMEOUT;
    console.log(`[circuit-breaker] ${source} circuit opened for ${RESET_TIMEOUT / 1000}s`);
  }
}

export function getCircuitBreakerStatus() {
  return Array.from(circuitBreakers.entries()).map(([source, cb]) => ({
    source,
    state: cb.state,
    failures: cb.failures,
    openUntil: cb.state === "open" ? new Date(cb.openUntil).toISOString() : null,
  }));
}
