import React from 'react';
import { useChatStore } from '../lib/store';
import styles from './ConnectionStatus.module.css';

const ConnectionStatus: React.FC = () => {
  const { multiplayer } = useChatStore();

  const getStatusColor = () => {
    switch (multiplayer.connectionState) {
      case 'CONNECTED':
        return 'green';
      case 'CONNECTING':
      case 'RECONNECTING':
        return 'orange';
      case 'DISCONNECTED':
        return 'red';
      default:
        return 'gray';
    }
  };

  return (
    <div className={styles['connection-status']}>
      <span className={styles['status-indicator']} style={{ backgroundColor: getStatusColor() }} />
      <span className={styles['status-text']}>
        {multiplayer.connectionState === 'CONNECTED' && 'Connected'}
        {multiplayer.connectionState === 'CONNECTING' && 'Connecting...'}
        {multiplayer.connectionState === 'RECONNECTING' && 'Reconnecting...'}
        {multiplayer.connectionState === 'DISCONNECTED' && 'Disconnected'}
      </span>
    </div>
  );
};

export default ConnectionStatus;
