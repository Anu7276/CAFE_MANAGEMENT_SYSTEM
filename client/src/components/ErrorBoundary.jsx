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

  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen bg-[#071a12] text-white flex items-center justify-center p-6">
          <div className="max-w-[420px] w-full bg-[#0c241b] border border-white/10 rounded-3xl p-8 text-center shadow-2xl">
            <div className="w-14 h-14 rounded-full bg-red-500/20 text-coralRed flex items-center justify-center mx-auto mb-4">
              <AlertTriangle className="w-7 h-7" />
            </div>
            <h2 className="text-xl font-extrabold text-white mb-2">Something went wrong</h2>
            <p className="text-xs text-white/60 mb-6">
              An unexpected issue occurred while rendering this screen. Your cart and orders remain secure.
            </p>
            <button
              onClick={this.handleReload}
              className="w-full h-11 rounded-full bg-mintGreen text-[#071a12] font-bold text-xs flex items-center justify-center gap-2 hover:bg-[#88e7bd] transition shadow-lg shadow-mintGreen/20"
            >
              <RefreshCw className="w-4 h-4" />
              <span>Reload Application</span>
            </button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
