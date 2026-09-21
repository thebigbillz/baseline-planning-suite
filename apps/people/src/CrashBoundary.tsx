import { Component, type ReactNode } from 'react';

interface State {
  readonly error: Error | null;
}

/** A render error stays inside People: the host, and the other remote, never see it. */
export class CrashBoundary extends Component<{ readonly children: ReactNode }, State> {
  override state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  override render(): ReactNode {
    if (this.state.error === null) return this.props.children;
    return (
      <div role="alert" style={{ padding: 32, fontFamily: 'var(--bl-font)' }}>
        <h1 style={{ fontSize: 20, margin: '0 0 8px' }}>People hit an error and stopped.</h1>
        <p style={{ margin: '0 0 16px', color: 'var(--bl-ink-3)' }}>{this.state.error.message}</p>
        <button type="button" onClick={() => this.setState({ error: null })}>
          Try again
        </button>
      </div>
    );
  }
}
