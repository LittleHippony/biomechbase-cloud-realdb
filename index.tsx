import React from 'react';
import ReactDOM from 'react-dom/client';

type RootErrorBoundaryState = { hasError: boolean; message: string };

class RootErrorBoundary extends React.Component<React.PropsWithChildren, RootErrorBoundaryState> {
  state: RootErrorBoundaryState = { hasError: false, message: '' };

  static getDerivedStateFromError(error: unknown): RootErrorBoundaryState {
    const message = error instanceof Error ? error.message : 'Unknown runtime error';
    return { hasError: true, message };
  }

  componentDidCatch(error: unknown) {
    console.error('Root render error:', error);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div style={{ padding: 16, fontFamily: 'Inter, sans-serif', color: '#b91c1c', background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 8, maxWidth: 860, margin: '24px auto' }}>
          <div style={{ fontWeight: 600, marginBottom: 8 }}>App crashed during render.</div>
          <div style={{ fontSize: 13 }}>{this.state.message}</div>
        </div>
      );
    }

    return this.props.children;
  }
}

const rootElement = document.getElementById('root');
if (!rootElement) {
  throw new Error("Could not find root element to mount to");
}

const root = ReactDOM.createRoot(rootElement);

const showFatalMessage = (message: string) => {
  rootElement.innerHTML = `<div style="padding:16px;font-family:Inter,sans-serif;color:#b91c1c;background:#fef2f2;border:1px solid #fecaca;border-radius:8px;max-width:860px;margin:24px auto;"><div style="font-weight:600;margin-bottom:8px;">App failed to load.</div><div style="font-size:13px;">${message}</div></div>`;
};

root.render(
  <React.StrictMode>
    <div style={{ padding: 16, fontFamily: 'Inter, sans-serif', color: '#475569' }}>Loading app...</div>
  </React.StrictMode>
);

const mountApp = async () => {
  try {
    const { default: App } = await import('./App');
    root.render(
      <React.StrictMode>
        <RootErrorBoundary>
          <App />
        </RootErrorBoundary>
      </React.StrictMode>
    );
  } catch (error) {
    console.error('Failed to load App module:', error);
    const message = error instanceof Error ? error.message : 'Unknown module load error';
    showFatalMessage(message);
  }
};

try {
  mountApp();
} catch (error) {
  console.error('Failed to render app:', error);
  const message = error instanceof Error ? error.message : 'Unknown startup error';
  showFatalMessage(message);
}