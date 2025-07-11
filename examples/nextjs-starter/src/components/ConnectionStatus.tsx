import React, {  } from 'react';

import { useTodoStore } from '../lib/store';

import styles from './ConnectionStatus.module.css';
import { ConnectionState } from '@hpkv/websocket-client';

const ConnectionStatus: React.FC = () => {
  const {connectionState} = useTodoStore((state) => state.multiplayer);

  return (
    <div className={styles['connection-status']}>
      <div
        className={`${styles['status-indicator']} ${styles[connectionState === ConnectionState.CONNECTED ? 'connected' : 'disconnected']}`}
      />
      <span>{connectionState}</span>
    </div>
  );
};

export default ConnectionStatus;
