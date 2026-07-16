export function initializeFrontendMonitoring() {
  const send = (kind, message) => {
    fetch("/api/telemetry", {
      method: "POST",
      keepalive: true,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ kind, message: String(message).slice(0, 500), path: location.pathname })
    }).catch(() => {});
  };
  window.addEventListener("error", (event) => send("error", event.message));
  window.addEventListener("unhandledrejection", (event) => send("unhandledrejection", event.reason));
}
