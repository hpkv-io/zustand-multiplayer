import React from 'react';
import './StatusBar.css';

const StatusBar = ({ connectionState }) => {
  const getStatusColor = () => {
    switch (connectionState) {
      case 'CONNECTED':
        return '#00B894';
      case 'CONNECTING':
      case 'RECONNECTING':
        return '#FDCB6E';
      case 'DISCONNECTED':
        return '#FF6B6B';
      default:
        return '#74B9FF';
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
        return 'Initializing...';
    }
  };

  return (
    <div className="status-bar">
      <div className="status-indicator">
        <span className="status-dot" style={{ backgroundColor: getStatusColor() }} />
        <span className="status-text">{getStatusText()}</span>
      </div>

      <div className="powered-by">
        Powered by{' '}
        <a
          className="powered-link"
          href="https://zustand.docs.pmnd.rs/"
          rel="noopener noreferrer"
          target="_blank"
        >
          Zustand
        </a>
        {' + '}
        <a
          className="powered-link"
          href="https://hpkv.io"
          rel="noopener noreferrer"
          target="_blank"
        >
          HPKV
        </a>
      </div>
    </div>
  );
};

export default StatusBar;
