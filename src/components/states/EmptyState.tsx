import type { ReactNode } from "react";

interface EmptyStateProps {
  icon?: string;
  title: string;
  body?: string;
  action?: ReactNode;
}

// Designed empty surface: says what the screen is for and what to do first.
export function EmptyState({ icon = "🎙️", title, body, action }: EmptyStateProps) {
  return (
    <div className="state card">
      <div className="state__icon" aria-hidden="true">
        {icon}
      </div>
      <h2>{title}</h2>
      {body ? <p>{body}</p> : null}
      {action}
    </div>
  );
}
