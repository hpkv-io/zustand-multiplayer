import React, { useEffect, useState } from 'react';
import FormulaBar from './FormulaBar';
import SpreadsheetGrid from './SpreadsheetGrid';
import Toolbar from './Toolbar';
import UserList from './UserList';
import { useSpreadsheetStore } from '@/lib/store';
import styles from '@/styles/SpreadsheetApp.module.css';

const SpreadsheetApp: React.FC = () => {
  const [username, setUsername] = useState('');
  const [isJoined, setIsJoined] = useState(false);
  const { setCurrentUser, multiplayer } = useSpreadsheetStore();

  const handleJoin = (e: React.FormEvent) => {
    e.preventDefault();
    if (username.trim()) {
      setCurrentUser(username.trim());
      setIsJoined(true);
    }
  };

  if (!isJoined) {
    return (
      <div className={styles.joinContainer}>
        <div className={styles.joinCard}>
          <h2>Join Collaborative Spreadsheet</h2>
          <form onSubmit={handleJoin}>
            <input
              type="text"
              placeholder="Enter your name"
              value={username}
              onChange={e => setUsername(e.target.value)}
              className={styles.usernameInput}
              maxLength={20}
              autoFocus
            />
            <button type="submit" className={styles.joinButton}>
              Join Session
            </button>
          </form>
        </div>
      </div>
    );
  }

  return (
    <div className={styles.container}>
      <header className={styles.header}>
        <h1 className={styles.title}>Collaborative Spreadsheet</h1>
        <div className={styles.connectionStatus}>
          <span
            className={`${styles.statusIndicator} ${
              multiplayer.connectionState === 'CONNECTED' ? styles.connected : styles.disconnected
            }`}
          />
          {multiplayer.connectionState}
        </div>
        <UserList />
      </header>
      <Toolbar />
      <FormulaBar />
      <div className={styles.spreadsheetContainer}>
        <SpreadsheetGrid />
      </div>
    </div>
  );
};

export default SpreadsheetApp;
