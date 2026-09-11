import { config } from "./config";

// Analytics and error tracking, wired only from runtime config. Family data
// (entry text, written forms, meanings, audio) NEVER leaves the device: no
// event or breadcrumb here carries it, and URL/request data that could is
// scrubbed before send. When a channel's config is absent it stays off and the
// app runs normally.

let started = false;

export function initTelemetry(): void {
  if (started) return;
  started = true;
  initAnalytics();
  void initErrorTracking();
}

function initAnalytics(): void {
  if (!config.UMAMI_URL || !config.UMAMI_WEBSITE_ID) return;
  if (typeof document === "undefined") return;
  const script = document.createElement("script");
  script.async = true;
  script.defer = true;
  script.src = config.UMAMI_URL;
  script.setAttribute("data-website-id", config.UMAMI_WEBSITE_ID);
  // Do not auto-track URLs: routes could theoretically carry an entry id. We
  // send only anonymous page loads.
  script.setAttribute("data-do-not-track", "true");
  document.head.appendChild(script);
}

async function initErrorTracking(): Promise<void> {
  if (!config.SENTRY_DSN) return;
  try {
    const Sentry = await import("@sentry/browser");
    Sentry.init({
      dsn: config.SENTRY_DSN,
      // Strip anything that could carry family data out of events.
      sendDefaultPii: false,
      beforeBreadcrumb: () => null,
      beforeSend(event) {
        scrubEvent(event as unknown as Record<string, unknown>);
        return event;
      },
    });
  } catch {
    // Error tracking is best-effort; never block the app if it fails to load.
  }
}

// Removes request/URL/user fields that could carry entry text, ids, or PII.
// Exported for tests. Typed loosely because it mutates a Sentry event in place.
export function scrubEvent(event: Record<string, unknown>): Record<string, unknown> {
  delete event.request;
  delete event.user;
  if (event.transaction) event.transaction = "[redacted]";
  if (event.extra) event.extra = {};
  return event;
}
