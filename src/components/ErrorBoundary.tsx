import { Component, type ErrorInfo, type ReactNode } from 'react';
import { RefreshCw } from 'lucide-react';

interface Props {
  children: ReactNode;
  /** Changing this resets the boundary — e.g. when switching tabs or leagues. */
  resetKey?: string;
}

interface State {
  error: Error | null;
}

/**
 * Without this, one bad render (a malformed API payload, an unexpected null)
 * white-screens the entire app. Scoped per tab so a broken Draft tab doesn't
 * take the Leaderboard down with it.
 */
export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidUpdate(prev: Props) {
    if (prev.resetKey !== this.props.resetKey && this.state.error) {
      this.setState({ error: null });
    }
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('NBA Bruball render error:', error, info.componentStack);
  }

  render() {
    if (!this.state.error) return this.props.children;

    return (
      <div className="rounded-xl border border-red-200 bg-red-50 p-5">
        <h2 className="font-medium text-gray-900">Something broke here</h2>
        <p className="mt-1 text-sm text-gray-700">
          {this.state.error.message || 'An unexpected error occurred.'}
        </p>
        <button
          type="button"
          onClick={() => this.setState({ error: null })}
          className="mt-3 flex items-center gap-1.5 rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-700"
        >
          <RefreshCw className="size-4" /> Try again
        </button>
      </div>
    );
  }
}
