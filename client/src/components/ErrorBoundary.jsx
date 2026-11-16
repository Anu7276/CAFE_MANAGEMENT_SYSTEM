import React from 'react';
import { AlertTriangle, RefreshCw } from 'lucide-react';
import { Sentry } from '../utils/sentry';

export default class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  componentDidCatch(error, errorInfo) {
    console.error('ErrorBoundary caught:', error, errorInfo);
    if (import.meta.env.VITE_SENTRY_DSN) {
      Sentry.captureException(error, { extra: errorInfo });
    }
  }

  handleReload = () => {
    window.location.reload();
  };

  handleReset = () => {
    try {
      sessionStorage.clear();
      localStorage.removeItem('emerald_cart');
      localStorage.removeItem('emerald_active_order');
    } catch {}
    window.location.href = '/';
  };

  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen bg-[#071a12] text-white flex items-center justify-center p-6">
          <div className="max-w-[420px] w-full bg-[#0c241b] border border-white/10 rounded-3xl p-8 text-center shadow-2xl">
            <div className="w-14 h-14 rounded-full bg-red-500/20 text-coralRed flex items-center justify-center mx-auto mb-4">
              <AlertTriangle className="w-7 h-7" />
            </div>
            <h2 className="text-xl font-extrabold text-white mb-2">Something went wrong</h2>
            <p className="text-xs text-white/60 mb-4">
              An unexpected issue occurred while rendering this screen. Your cart and orders remain secure.
            </p>

            {this.state.error?.message && (
              <div className="mb-6 p-3 rounded-xl bg-black/40 border border-white/10 text-[11px] text-coralRed/90 font-mono text-left overflow-x-auto max-h-24">
                {this.state.error.message}
              </div>
            )}

            <div className="space-y-2">
              <button
                onClick={this.handleReload}
                className="w-full h-11 rounded-full bg-mintGreen text-[#071a12] font-bold text-xs flex items-center justify-center gap-2 hover:bg-[#88e7bd] transition shadow-lg shadow-mintGreen/20"
              >
                <RefreshCw className="w-4 h-4" />
                <span>Reload Application</span>
              </button>
              <button
                onClick={this.handleReset}
                className="w-full h-9 rounded-full bg-white/10 hover:bg-white/15 text-white/70 font-semibold text-xs transition"
              >
                Clear Local Session & Return Home
              </button>
            </div>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
