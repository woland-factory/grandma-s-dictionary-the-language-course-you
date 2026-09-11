import type { ReactNode } from "react";

interface ErrorStateProps {
  icon?: string;
  title: string;
  body: string;
  action?: ReactNode;
}

// Designed error surface: product voice, a clear next step, never a raw error.
export function ErrorState({ icon = "🎤", title, body, action }: ErrorStateProps) {
  return (
    <div className="notice notice--error" role="alert">
      <div className="state__icon" aria-hidden="true" style={{ fontSize: "1.6rem" }}>
        {icon}
      </div>
      <h2>{title}</h2>
      <p style={{ marginBottom: action ? 12 : 0 }}>{body}</p>
      {action}
    </div>
  );
}
