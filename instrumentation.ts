/**
 * Next.js instrumentation entry — runs once per server process.
 * Used today to (a) optionally bootstrap Sentry if @sentry/nextjs is installed
 * and SENTRY_DSN is configured, and (b) hook process-level error handlers so
 * unhandled rejections don't crash silently.
 */
import { logger } from "@/lib/logger";

export async function register() {
  const dsn = process.env.SENTRY_DSN;
  if (dsn) {
    try {
      // Dynamic import — Sentry is optional; if the dep isn't installed we just
      // log and continue. Add `@sentry/nextjs` to package.json to enable.
      // The string concat hides the import target from TS module resolution
      // so the build doesn't require the package to be installed.
      const moduleName = "@sentry/" + "nextjs";
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const Sentry: any = await import(/* webpackIgnore: true */ moduleName).catch(() => null);
      if (Sentry?.init) {
        Sentry.init({
          dsn,
          tracesSampleRate: 0.1,
          environment: process.env.NODE_ENV,
        });
        logger.info("[instrumentation] Sentry initialised");
      } else {
        logger.warn("[instrumentation] SENTRY_DSN set but @sentry/nextjs not installed");
      }
    } catch (err) {
      logger.warn({ err }, "[instrumentation] Sentry init failed");
    }
  }

  // Last-resort error handlers for the Next.js runtime.
  if (process.env.NEXT_RUNTIME === "nodejs") {
    process.on("uncaughtException", (err) => {
      logger.error({ err }, "[runtime] uncaught exception");
    });
    process.on("unhandledRejection", (reason) => {
      logger.error({ reason }, "[runtime] unhandled rejection");
    });
  }
}
