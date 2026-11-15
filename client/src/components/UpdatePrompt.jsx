import React, { useEffect, useState } from 'react';
import { RefreshCw, Sparkles, X } from 'lucide-react';

export default function UpdatePrompt() {
  const [waitingWorker, setWaitingWorker] = useState(null);
  const [showPrompt, setShowPrompt] = useState(false);

  useEffect(() => {
    if (!('serviceWorker' in navigator)) return;

    // Listen for controlling service worker change
    let refreshing = false;
    navigator.serviceWorker.addEventListener('controllerchange', () => {
      if (!refreshing) {
        refreshing = true;
        window.location.reload();
      }
    });

    navigator.serviceWorker.getRegistration().then((reg) => {
      if (!reg) return;

      // Check if there is already a waiting worker
      if (reg.waiting) {
        setWaitingWorker(reg.waiting);
        setShowPrompt(true);
      }

      // Check for updates on new worker installation
      reg.addEventListener('updatefound', () => {
        const newWorker = reg.installing;
        if (!newWorker) return;

        newWorker.addEventListener('statechange', () => {
          if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
            setWaitingWorker(newWorker);
            setShowPrompt(true);
          }
        });
      });

      // Periodically check for updates (every 30 mins)
      const interval = setInterval(() => {
        reg.update().catch(() => {});
      }, 30 * 60 * 1000);

      return () => clearInterval(interval);
    });
  }, []);

  const handleUpdate = () => {
    if (waitingWorker) {
      waitingWorker.postMessage({ type: 'SKIP_WAITING' });
    } else {
      window.location.reload();
    }
    setShowPrompt(false);
  };

  if (!showPrompt) return null;

  return (
    <div className="fixed bottom-6 right-6 z-50 max-w-sm w-full bg-[#0b241a] border border-mintGreen/30 rounded-2xl p-4 shadow-2xl backdrop-blur-md animate-bounce-subtle text-white">
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-2">
          <span className="p-2 bg-mintGreen/10 text-mintGreen rounded-xl">
            <Sparkles className="w-5 h-5 text-mintGreen" />
          </span>
          <div>
            <h4 className="text-sm font-extrabold text-white">New Update Available</h4>
            <p className="text-xs text-white/60">
              A newer version of the Kitchen Display & Ordering app is ready.
            </p>
          </div>
        </div>
        <button
          onClick={() => setShowPrompt(false)}
          className="text-white/40 hover:text-white transition"
          aria-label="Dismiss"
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      <div className="mt-3 flex gap-2">
        <button
          onClick={handleUpdate}
          className="flex-1 py-2 px-3 rounded-xl bg-mintGreen text-[#071a12] font-extrabold text-xs flex items-center justify-center gap-1.5 hover:bg-[#88e7bd] transition shadow-lg shadow-mintGreen/20"
        >
          <RefreshCw className="w-3.5 h-3.5" />
          <span>Update Now</span>
        </button>
        <button
          onClick={() => setShowPrompt(false)}
          className="py-2 px-3 rounded-xl bg-white/10 hover:bg-white/15 text-white/70 font-semibold text-xs transition"
        >
          Later
        </button>
      </div>
    </div>
  );
}
