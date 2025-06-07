import React, {  } from 'react';

import { useTodoStore } from '../lib/store';

import styles from './ConnectionStatus.module.css';
import { ConnectionState } from '@hpkv/websocket-client';

const ConnectionStatus: React.FC = () => {
  const multiplayer = useTodoStore((state) => state.multiplayer);

  return (
    <div className={styles['connection-status']}>
      <div
        className={`${styles['status-indicator']} ${styles[multiplayer.connectionState === ConnectionState.CONNECTED ? 'connected' : 'disconnected']}`}
      />
      <span>{multiplayer.connectionState}</span>
    </div>
  );
};

export default ConnectionStatus;
