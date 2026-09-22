import { createHash } from "node:crypto";

export interface HttpOptions {
  minDelayMs?: number;
  timeoutMs?: number;
  maxRetries?: number;
  userAgent?: string;
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

export class PoliteHttpClient {
  readonly #options: Required<HttpOptions>;
  readonly #lastRequest = new Map<string, number>();

  constructor(options: HttpOptions = {}) {
    this.#options = {
      minDelayMs: options.minDelayMs ?? Number(process.env.IMPORT_MIN_DELAY_MS ?? 1500),
      timeoutMs: options.timeoutMs ?? Number(process.env.IMPORT_TIMEOUT_MS ?? 20000),
      maxRetries: options.maxRetries ?? Number(process.env.IMPORT_MAX_RETRIES ?? 3),
      userAgent: options.userAgent ?? process.env.IMPORT_USER_AGENT ?? "PlaymobilCollectionResearch/0.1",
    };
  }

  async get(url: string): Promise<{ body: string; status: number; headers: Headers; hash: string }> {
    const parsed = new URL(url);
    const previous = this.#lastRequest.get(parsed.origin) ?? 0;
    await sleep(Math.max(0, this.#options.minDelayMs - (Date.now() - previous)));

    let lastError: unknown;
    for (let attempt = 0; attempt <= this.#options.maxRetries; attempt += 1) {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), this.#options.timeoutMs);
      try {
        this.#lastRequest.set(parsed.origin, Date.now());
        const response = await fetch(url, {
          headers: { accept: "text/html,application/xml,application/json;q=0.9,*/*;q=0.5", "user-agent": this.#options.userAgent },
          signal: controller.signal,
        });
        const body = await response.text();
        if (response.status === 429 || response.status >= 500) {
          if (attempt < this.#options.maxRetries) {
            await sleep(Math.min(30_000, 1000 * 2 ** attempt));
            continue;
          }
        }
        return { body, status: response.status, headers: response.headers, hash: createHash("sha256").update(body).digest("hex") };
      } catch (error) {
        lastError = error;
        if (attempt < this.#options.maxRetries) await sleep(Math.min(30_000, 1000 * 2 ** attempt));
      } finally {
        clearTimeout(timeout);
      }
    }
    throw lastError instanceof Error ? lastError : new Error(`Request failed: ${url}`);
  }
}
