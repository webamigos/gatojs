"use client";

import { Component, type ReactNode } from "react";

export interface OverrideErrorBoundaryProps {
  handle: string;
  source: string;
  fallback: ReactNode;
  children?: ReactNode;
}

interface OverrideErrorBoundaryState {
  failed: boolean;
}

export class OverrideErrorBoundary extends Component<
  OverrideErrorBoundaryProps,
  OverrideErrorBoundaryState
> {
  state: OverrideErrorBoundaryState = { failed: false };

  static getDerivedStateFromError(): OverrideErrorBoundaryState {
    return { failed: true };
  }

  componentDidCatch(error: unknown): void {
    // eslint-disable-next-line no-console -- client components have no server logger
    console.error(
      "Component override failed to render:",
      this.props.handle,
      this.props.source,
      error,
    );
  }

  render(): ReactNode {
    return this.state.failed ? this.props.fallback : this.props.children;
  }
}
