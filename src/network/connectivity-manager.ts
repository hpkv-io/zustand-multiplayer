/**
 * Connectivity change listener function type
 */
export type ConnectivityListener = (isOnline: boolean) => void;

/**
 * Cleanup function type
 */
export type CleanupFunction = () => void;

/**
 * Browser connectivity manager that works in both browser and Node.js environments
 * Manages network connectivity state and provides event listeners with proper cleanup
 */
export class BrowserConnectivityManager {
  private isOnline: boolean;
  private listeners: Set<ConnectivityListener> = new Set();
  private isBrowser: boolean;
  private isDestroyed: boolean = false;

  constructor() {
    // Detect if we're in a browser environment
    this.isBrowser = typeof window !== 'undefined' && typeof navigator !== 'undefined';

    if (this.isBrowser) {
      this.isOnline = navigator.onLine;
      window.addEventListener('online', this.handleOnline);
      window.addEventListener('offline', this.handleOffline);
    } else {
      // In Node.js environment, assume we're always online
      this.isOnline = true;
    }
  }

  private handleOnline = (): void => {
    if (this.isDestroyed) return;
    
    this.isOnline = true;
    this.notifyListeners(true);
  };

  private handleOffline = (): void => {
    if (this.isDestroyed) return;
    
    this.isOnline = false;
    this.notifyListeners(false);
  };

  private notifyListeners(isOnline: boolean): void {
    if (this.isDestroyed) return;

    for (const listener of this.listeners) {
      try {
        listener(isOnline);
      } catch (error) {
        // Use console.warn instead of console.error for listener errors
        // as these are not critical to the application functioning
        console.warn('Error in connectivity listener:', error);
      }
    }
  }

  /**
   * Adds a connectivity change listener
   * @param listener Function to call when connectivity changes
   * @returns Cleanup function to remove the listener
   */
  addListener(listener: ConnectivityListener): CleanupFunction {
    if (this.isDestroyed) {
      console.warn('Attempting to add listener to destroyed connectivity manager');
      return () => {}; // Return no-op cleanup function
    }

    this.listeners.add(listener);
    
    return () => {
      this.listeners.delete(listener);
    };
  }

  /**
   * Gets the current online status
   * @returns True if online, false if offline
   */
  getIsOnline(): boolean {
    return this.isOnline;
  }

  /**
   * Gets the number of active listeners (for debugging/monitoring)
   * @returns Number of active listeners
   */
  getListenerCount(): number {
    return this.listeners.size;
  }

  /**
   * Checks if the manager has been destroyed
   * @returns True if destroyed, false otherwise
   */
  getIsDestroyed(): boolean {
    return this.isDestroyed;
  }

  /**
   * Destroys the connectivity manager and cleans up all resources
   * This method is idempotent and safe to call multiple times
   */
  destroy(): void {
    if (this.isDestroyed) {
      return; // Already destroyed, nothing to do
    }

    this.isDestroyed = true;

    if (this.isBrowser) {
      window.removeEventListener('online', this.handleOnline);
      window.removeEventListener('offline', this.handleOffline);
    }
    
    // Clear all listeners to prevent memory leaks
    this.listeners.clear();
  }
} 