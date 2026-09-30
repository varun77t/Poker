import { z } from 'zod';

const Port = z.coerce.number().int().min(0).max(65535);

const EnvSchema = z.object({
  /**
   * The port users open in the browser. In production the Node server listens here (hosting platforms
   * set it). In development the Vite dev server owns it, so the Node server must not use it.
   */
  PORT: Port.default(3000),
  /** Development only: the Node API server's port behind the Vite proxy. */
  API_PORT: Port.default(3000),
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug']).default('info'),
  /** `json` (one object per line, for the hosting platform's log search) or `pretty`. Default: json in production. */
  LOG_FORMAT: z.enum(['json', 'pretty']).optional(),
  /**
   * How many reverse proxies sit in front of the server (Render and Railway: 1). The client's real
   * address is then read from X-Forwarded-For for per-IP rate limits. 0 trusts no proxy headers,
   * which is right when nothing is in front (a spoofed header must not dodge the limits).
   */
  TRUST_PROXY: z.coerce.number().int().min(0).max(5).default(0),
});

export type Config = z.infer<typeof EnvSchema>;

export function loadConfig(env: Record<string, string | undefined> = process.env): Config {
  const result = EnvSchema.safeParse(env);
  if (!result.success) {
    const issues = result.error.issues.map((i) => `  ${i.path.join('.')}: ${i.message}`).join('\n');
    throw new Error(`Invalid environment configuration:\n${issues}`);
  }
  return result.data;
}

/** Port the Node server listens on: the public PORT in production, API_PORT (behind Vite) otherwise. */
export function listenPort(config: Config): number {
  return config.NODE_ENV === 'production' ? config.PORT : config.API_PORT;
}
