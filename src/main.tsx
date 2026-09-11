import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import { App } from "./App";
import { ErrorBoundary } from "./components/ErrorBoundary";
import { initTelemetry } from "./lib/telemetry";
import { requestPersistence } from "./lib/storage";
import { maybeSeedDemo } from "./lib/seedDemo";
import "./styles/index.css";

// Render the shell immediately so first paint is real content, then do boot
// side effects (persistence request, demo seed, telemetry) after paint. None
// of them block the UI.
const root = createRoot(document.getElementById("root")!);
root.render(
  <StrictMode>
    <ErrorBoundary>
      <BrowserRouter>
        <App />
      </BrowserRouter>
    </ErrorBoundary>
  </StrictMode>,
);

function boot() {
  initTelemetry();
  void requestPersistence();
  void maybeSeedDemo();
}

if (typeof window !== "undefined") {
  if (document.readyState === "complete") {
    boot();
  } else {
    window.addEventListener("load", boot, { once: true });
  }
}
