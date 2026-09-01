export async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const ac = new AbortController();
  const timer = setTimeout(() => ac.abort(), 18000);
  try {
    const res = await fetch(path, {
      ...init,
      headers: { "Content-Type": "application/json", ...(init?.headers ?? {}) },
      signal: ac.signal,
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok && res.status !== 202) {
      throw new Error((data as { error?: string }).error || res.statusText);
    }
    return data as T;
  } catch (err) {
    if (err instanceof Error && err.name === "AbortError") {
      throw new Error("Request timed out — using the next source on retry");
    }
    throw err;
  } finally {
    clearTimeout(timer);
  }
}

export function money(n: number | null | undefined, currency = "INR") {
  if (n == null || Number.isNaN(n)) return "—";
  const code = currency === "USD" ? "USD" : "INR";
  return new Intl.NumberFormat(code === "USD" ? "en-US" : "en-IN", {
    style: "currency",
    currency: code,
    maximumFractionDigits: 2,
  }).format(n);
}

export function compactMoney(n: number | null | undefined, currency = "INR") {
  if (n == null || Number.isNaN(n)) return "—";
  const code = currency === "USD" ? "USD" : "INR";
  return new Intl.NumberFormat(code === "USD" ? "en-US" : "en-IN", {
    notation: "compact",
    style: "currency",
    currency: code,
    maximumFractionDigits: 2,
  }).format(n);
}

export function pct(n: number | null | undefined) {
  if (n == null || Number.isNaN(n)) return "—";
  const sign = n > 0 ? "+" : "";
  return `${sign}${n.toFixed(2)}%`;
}

export function cls(...parts: Array<string | false | null | undefined>) {
  return parts.filter(Boolean).join(" ");
}
