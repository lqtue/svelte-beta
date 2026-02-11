/**
 * PWA utilities for service worker registration and install prompt
 */

/**
 * Register the service worker
 */
export async function registerServiceWorker(): Promise<ServiceWorkerRegistration | null> {
  if (typeof window === 'undefined' || !('serviceWorker' in navigator)) {
    return null;
  }

  try {
    const registration = await navigator.serviceWorker.register('/sw.js');
    console.log('Service Worker registered:', registration);
    return registration;
  } catch (error) {
    console.error('Service Worker registration failed:', error);
    return null;
  }
}

/**
 * Check if the app is running as an installed PWA
 */
export function isInstalledPWA(): boolean {
  if (typeof window === 'undefined') return false;

  // Check if running in standalone mode
  const isStandalone =
    window.matchMedia('(display-mode: standalone)').matches ||
    (window.navigator as any).standalone ||
    document.referrer.includes('android-app://');

  return isStandalone;
}

/**
 * Prompt user to install the PWA
 * Call this function when you want to show the install prompt
 */
export function setupInstallPrompt(
  onInstallable: (prompt: () => Promise<boolean>) => void
): () => void {
  if (typeof window === 'undefined') {
    return () => {};
  }

  let deferredPrompt: any = null;

  const handleBeforeInstallPrompt = (e: Event) => {
    // Prevent the mini-infobar from appearing on mobile
    e.preventDefault();
    // Stash the event so it can be triggered later
    deferredPrompt = e;

    // Callback with a function to trigger the prompt
    onInstallable(async () => {
      if (!deferredPrompt) return false;

      // Show the install prompt
      deferredPrompt.prompt();

      // Wait for the user to respond to the prompt
      const { outcome } = await deferredPrompt.userChoice;

      // Clear the deferredPrompt for next time
      deferredPrompt = null;

      return outcome === 'accepted';
    });
  };

  window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt);

  // Return cleanup function
  return () => {
    window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
  };
}
