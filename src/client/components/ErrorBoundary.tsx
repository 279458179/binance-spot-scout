import { Component } from "react";
import type { ErrorInfo, ReactNode } from "react";

interface ErrorBoundaryProps {
  children: ReactNode;
}

interface ErrorBoundaryState {
  error: Error | null;
}

/** Catches render errors so a single bad card never blanks the whole page. */
export class ErrorBoundary extends Component<
  ErrorBoundaryProps,
  ErrorBoundaryState
> {
  override state: ErrorBoundaryState = { error: null };

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { error };
  }

  override componentDidCatch(error: Error, _info: ErrorInfo): void {
    console.error("[spot-scout] render error", error);
  }

  private handleReset = (): void => {
    this.setState({ error: null });
  };

  override render(): ReactNode {
    const { error } = this.state;

    if (error === null) {
      return this.props.children;
    }

    return (
      <div className="mx-auto flex max-w-3xl flex-col items-center gap-4 px-4 py-16 text-center">
        <span aria-hidden className="text-4xl">
          🙀
        </span>
        <h1 className="text-xl font-semibold">页面出了点问题</h1>
        <p className="max-w-sm text-sm leading-relaxed text-ink-400">
          界面在渲染时遇到了意外情况，可以刷新页面重试。你的钱包和仓位都没有被触碰。
        </p>
        <div className="flex flex-wrap items-center justify-center gap-2">
          <button
            type="button"
            onClick={this.handleReset}
            className="rounded-2xl bg-mint-500 px-5 py-3 text-sm font-semibold text-night-950"
          >
            重试渲染
          </button>
          <button
            type="button"
            onClick={() => window.location.reload()}
            className="rounded-2xl border border-white/10 px-5 py-3 text-sm font-semibold text-ink-200"
          >
            刷新页面
          </button>
        </div>
      </div>
    );
  }
}
