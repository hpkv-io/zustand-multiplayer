import React from 'react';
import { useTodoStore } from '../lib/store';
import styles from './ConnectionStatus.module.css';

const ConnectionStatus: React.FC = () => {
  const { connectionState } = useTodoStore(state => state.multiplayer);

  return (
    <div className={styles['connection-status']}>
      <div
        className={`${styles['status-indicator']} ${styles[connectionState === 'CONNECTED' ? 'connected' : 'disconnected']}`}
      />
      <span>{connectionState}</span>
    </div>
  );
};

export default ConnectionStatus;
