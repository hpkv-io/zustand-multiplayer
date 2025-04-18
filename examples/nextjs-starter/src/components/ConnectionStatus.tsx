import React, { useEffect, useState } from 'react';

import { useTodoStore } from '../lib/store';

import styles from './ConnectionStatus.module.css';

const ConnectionStatus: React.FC = () => {
  const [isConnected, setIsConnected] = useState(false);
  const { multiplayer } = useTodoStore();

  useEffect(() => {
    // Check status immediately on mount
    if (multiplayer) {
      setIsConnected(multiplayer.isConnected());
    }

    // Setup polling to check connection status periodically
    const checkConnectionInterval = setInterval(() => {
      if (multiplayer) {
        setIsConnected(multiplayer.isConnected());
      }
    }, 1000); // Check every second

    // Clean up interval on unmount
    return () => clearInterval(checkConnectionInterval);
  }, [multiplayer]);

  return (
    <div className={styles['connection-status']}>
      <div
        className={`${styles['status-indicator']} ${styles[isConnected ? 'connected' : 'disconnected']}`}
      />
      <span>{isConnected ? 'Connected' : 'Disconnected'}</span>
    </div>
  );
};

export default ConnectionStatus;
