import React from 'react';
import { useChatStore } from '../store/chatStore';
import '../styles/ConnectionStatus.css';

export const ConnectionStatus: React.FC = () => {
  const { multiplayer } = useChatStore();
  const connectionState = multiplayer?.connectionState || 'DISCONNECTED';

  const getStatusColor = () => {
    switch (connectionState) {
      case 'CONNECTED':
        return '#4CAF50';
      case 'CONNECTING':
      case 'RECONNECTING':
        return '#FFC107';
      case 'DISCONNECTED':
        return '#F44336';
      default:
        return '#999';
    }
  };

  const getStatusText = () => {
    switch (connectionState) {
      case 'CONNECTED':
        return 'Connected';
      case 'CONNECTING':
        return 'Connecting...';
      case 'RECONNECTING':
        return 'Reconnecting...';
      case 'DISCONNECTED':
        return 'Disconnected';
      default:
        return 'Unknown';
    }
  };

  return (
    <div className="connection-status">
      <div className="status-indicator" style={{ backgroundColor: getStatusColor() }} />
      <span className="status-text">{getStatusText()}</span>
    </div>
  );
};
