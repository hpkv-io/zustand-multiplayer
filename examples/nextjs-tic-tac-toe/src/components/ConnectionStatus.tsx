import { useGameStore } from '../lib/store';
import styles from './ConnectionStatus.module.css';

export default function ConnectionStatus() {
  const { multiplayer } = useGameStore();

  const getStatusColor = () => {
    switch (multiplayer.connectionState) {
      case 'CONNECTED':
        return styles.connected;
      case 'CONNECTING':
      case 'RECONNECTING':
        return styles.connecting;
      case 'DISCONNECTED':
        return styles.disconnected;
      default:
        return '';
    }
  };

  const getStatusText = () => {
    switch (multiplayer.connectionState) {
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
    <div className={`${styles.status} ${getStatusColor()}`}>
      <div className={styles.indicator}></div>
      <span>{getStatusText()}</span>
      {multiplayer.hasHydrated && <span className={styles.hydrated}>• Synced</span>}
    </div>
  );
}
