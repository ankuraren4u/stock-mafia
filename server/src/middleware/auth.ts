import type { Request, Response, NextFunction } from "express";

const API_KEY = process.env.API_KEY || "";
const RATE_LIMIT_WINDOW_MS = 60_000;
const RATE_LIMIT_MAX = parseInt(process.env.RATE_LIMIT_MAX || "120", 10);

const hits = new Map<string, { count: number; windowStart: number }>();

export function authMiddleware(req: Request, res: Response, next: NextFunction) {
  if (API_KEY) {
    const provided = req.headers["x-api-key"] || req.query.api_key;
    if (provided !== API_KEY) {
      res.status(401).json({ error: "Unauthorized", message: "Provide x-api-key header or api_key query param" });
      return;
    }
  }
  next();
}

export function rateLimiter(req: Request, res: Response, next: NextFunction) {
  const ip = req.ip || req.socket.remoteAddress || "unknown";
  const now = Date.now();
  const entry = hits.get(ip);

  if (!entry || now - entry.windowStart > RATE_LIMIT_WINDOW_MS) {
    hits.set(ip, { count: 1, windowStart: now });
    res.setHeader("X-RateLimit-Limit", RATE_LIMIT_MAX);
    res.setHeader("X-RateLimit-Remaining", RATE_LIMIT_MAX - 1);
    next();
    return;
  }

  entry.count++;
  const remaining = Math.max(0, RATE_LIMIT_MAX - entry.count);
  res.setHeader("X-RateLimit-Limit", RATE_LIMIT_MAX);
  res.setHeader("X-RateLimit-Remaining", remaining);
  res.setHeader("X-RateLimit-Reset", Math.ceil((entry.windowStart + RATE_LIMIT_WINDOW_MS) / 1000));

  if (entry.count > RATE_LIMIT_MAX) {
    res.status(429).json({ error: "Too many requests", retryAfter: Math.ceil((entry.windowStart + RATE_LIMIT_WINDOW_MS - now) / 1000) });
    return;
  }

  next();
}

export function securityHeaders(_req: Request, res: Response, next: NextFunction) {
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("X-Frame-Options", "DENY");
  res.setHeader("X-XSS-Protection", "1; mode=block");
  res.setHeader("Referrer-Policy", "strict-origin-when-cross-origin");
  next();
}

export function requestLogger(req: Request, _res: Response, next: NextFunction) {
  const start = Date.now();
  _res.on("finish", () => {
    const ms = Date.now() - start;
    if (ms > 1000) {
      console.log(`[slow] ${req.method} ${req.path} ${ms}ms`);
    }
  });
  next();
}
