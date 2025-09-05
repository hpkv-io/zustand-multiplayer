import React from 'react';
import { useDrawingStore } from '../lib/store';

export function ConnectionStatus() {
  const { connectionState } = useDrawingStore(state => state.multiplayer);
  const connectionStatus = connectionState || 'disconnected';

  const getStatusColor = () => {
    switch (connectionStatus) {
      case 'CONNECTED':
        return 'bg-green-500';
      case 'CONNECTING':
      case 'RECONNECTING':
        return 'bg-yellow-500';
      default:
        return 'bg-red-500';
    }
  };

  const getStatusText = () => {
    switch (connectionStatus) {
      case 'CONNECTED':
        return 'Connected';
      case 'CONNECTING':
        return 'Connecting...';
      case 'RECONNECTING':
        return 'Reconnecting...';
      default:
        return 'Disconnected';
    }
  };

  return (
    <div className="flex items-center space-x-2 text-sm">
      <div
        className={`w-3 h-3 rounded-full ${getStatusColor()}`}
        title={`Connection status: ${getStatusText()}`}
      />
      <span className="text-gray-600">{getStatusText()}</span>
    </div>
  );
}
