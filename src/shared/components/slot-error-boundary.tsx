"use client";

import { Component, type ReactNode } from "react";

export interface SlotErrorBoundaryProps {
  contributionId: string;
  children?: ReactNode;
}

interface SlotErrorBoundaryState {
  failed: boolean;
}

export class SlotErrorBoundary extends Component<
  SlotErrorBoundaryProps,
  SlotErrorBoundaryState
> {
  state: SlotErrorBoundaryState = { failed: false };

  static getDerivedStateFromError(): SlotErrorBoundaryState {
    return { failed: true };
  }

  componentDidCatch(error: unknown): void {
    // eslint-disable-next-line no-console -- client components have no server logger
    console.error(
      "Slot contribution failed to render:",
      this.props.contributionId,
      error,
    );
  }

  render(): ReactNode {
    return this.state.failed ? null : this.props.children;
  }
}
