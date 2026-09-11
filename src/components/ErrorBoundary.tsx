import { Component, type ErrorInfo, type ReactNode } from "react";

interface Props {
  children: ReactNode;
}
interface State {
  hasError: boolean;
}

// Catches render errors so the app shows a designed message instead of a white
// screen. No error text is displayed to the user.
export class ErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false };

  static getDerivedStateFromError(): State {
    return { hasError: true };
  }

  componentDidCatch(_error: Error, _info: ErrorInfo): void {
    // Intentionally quiet: telemetry (when configured) reports the error.
  }

  render() {
    if (this.state.hasError) {
      return (
        <main className="app__main">
          <div className="notice notice--error" role="alert">
            <h2>Reload to keep going</h2>
            <p style={{ marginBottom: 12 }}>
              Reload the page to keep going. Your saved words stay on this
              device.
            </p>
            <button
              type="button"
              className="btn btn--primary"
              onClick={() => window.location.reload()}
            >
              Reload
            </button>
          </div>
        </main>
      );
    }
    return this.props.children;
  }
}
