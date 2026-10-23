import { useRegisterSW } from 'virtual:pwa-register/react';

/** Registers the service worker and offers to switch to a newly deployed build. */
export function UpdatePrompt() {
  const {
    needRefresh: [needRefresh, setNeedRefresh],
    offlineReady: [offlineReady, setOfflineReady],
    updateServiceWorker,
  } = useRegisterSW({
    onRegisteredSW(_url, registration) {
      // Check for a new app build every hour while the tab stays open.
      if (registration) setInterval(() => void registration.update(), 60 * 60 * 1000);
    },
  });

  if (needRefresh) {
    return (
      <div className="toast" role="status">
        <span>A new version of the app is available.</span>
        <button type="button" className="btn btn-primary" onClick={() => void updateServiceWorker(true)}>
          Reload
        </button>
        <button type="button" className="btn" onClick={() => setNeedRefresh(false)}>
          Later
        </button>
      </div>
    );
  }
  if (offlineReady) {
    return (
      <div className="toast" role="status">
        <span>The app is ready to work offline.</span>
        <button type="button" className="btn" onClick={() => setOfflineReady(false)}>
          OK
        </button>
      </div>
    );
  }
  return null;
}
