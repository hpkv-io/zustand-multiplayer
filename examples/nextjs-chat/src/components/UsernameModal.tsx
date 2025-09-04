import React, { useState } from 'react';
import styles from './UsernameModal.module.css';

interface UsernameModalProps {
  onSubmit: (username: string) => void;
}

const UsernameModal: React.FC<UsernameModalProps> = ({ onSubmit }) => {
  const [username, setUsername] = useState('');

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (username.trim()) {
      onSubmit(username.trim());
    }
  };

  return (
    <div className={styles['modal-overlay']}>
      <div className={styles['modal']}>
        <h2>Welcome to Chat!</h2>
        <p>Please enter your username to continue</p>
        <form onSubmit={handleSubmit}>
          <input
            type="text"
            value={username}
            onChange={e => setUsername(e.target.value)}
            placeholder="Enter your username"
            className={styles['username-input']}
            autoFocus
          />
          <button type="submit" disabled={!username.trim()} className={styles['submit-button']}>
            Join Chat
          </button>
        </form>
      </div>
    </div>
  );
};

export default UsernameModal;
