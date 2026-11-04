// Next.js 16 instrumentation hook.
// https://nextjs.org/docs/app/building-your-application/optimizing/instrumentation
//
// Two things happen here:
//   1. register() runs ONCE at server boot — we wire process-level
//      unhandled-rejection + uncaught-exception listeners so crashes that
//      escape route handlers still get captured.
//   2. onRequestError() runs every time a route handler throws — we
//      route the error into our in-house error monitor (no manual
//      try/catch needed in every route).
//
// Note: this file is server-only. Edge/middleware errors aren't covered
// here — they bubble through the runtime separately and rarely happen in
// our middleware, which is a single cookie-presence check.

export async function register(): Promise<void> {
  // Defer dynamic import until runtime — types are loaded via the import below
  // but we want the side-effecting module loaded lazily so build doesn't
  // pull Firebase Admin into the wrong runtime.
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  const { captureError } = await import("./lib/error-monitoring");

  process.on("unhandledRejection", (reason) => {
    void captureError(reason, { source: "server", path: "process.unhandledRejection" });
  });
  process.on("uncaughtException", (err) => {
    void captureError(err, { source: "server", path: "process.uncaughtException" });
  });
}

/**
 * Called by Next 16 whenever a route handler throws. The `request` shape is
 * the Next.js error-info object — we pull what we can for context.
 */
export async function onRequestError(
  err: unknown,
  request: { path?: string; routerKind?: string; routePath?: string },
  context: { routerKind?: string; routePath?: string },
): Promise<void> {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  try {
    const { captureError } = await import("./lib/error-monitoring");
    await captureError(err, {
      source: "server",
      path: request.path ?? request.routePath ?? context.routePath ?? null,
      context: {
        router_kind: request.routerKind ?? context.routerKind ?? null,
      },
    });
  } catch {
    // never throw from instrumentation
  }
}
