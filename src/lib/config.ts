// Reads runtime config injected as window.__APP_CONFIG__ by config.js. Falls
// back to empty strings so `vite dev` (where the placeholder ships anyway) and
// tests work without a container. No value here is a secret.

export interface AppConfig {
  SEED_DEMO: string;
  UMAMI_URL: string;
  UMAMI_WEBSITE_ID: string;
  SENTRY_DSN: string;
}

declare global {
  interface Window {
    __APP_CONFIG__?: Partial<AppConfig>;
  }
}

const raw: Partial<AppConfig> =
  (typeof window !== "undefined" && window.__APP_CONFIG__) || {};

export const config: AppConfig = {
  SEED_DEMO: raw.SEED_DEMO ?? "",
  UMAMI_URL: raw.UMAMI_URL ?? "",
  UMAMI_WEBSITE_ID: raw.UMAMI_WEBSITE_ID ?? "",
  SENTRY_DSN: raw.SENTRY_DSN ?? "",
};

// A string env flag is truthy unless it is empty, "0", or "false".
export function isTruthy(value: string): boolean {
  const v = value.trim().toLowerCase();
  return v !== "" && v !== "0" && v !== "false";
}

export const seedDemoEnabled = isTruthy(config.SEED_DEMO);
