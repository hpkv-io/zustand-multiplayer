import React, { useState } from 'react';
import '../styles/UsernameModal.css';

interface UsernameModalProps {
  onSubmit: (username: string) => void;
}

export const UsernameModal: React.FC<UsernameModalProps> = ({ onSubmit }) => {
  const [username, setUsername] = useState('');
  const [error, setError] = useState('');

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();

    if (!username.trim()) {
      setError('Please enter a username');
      return;
    }

    if (username.length < 2) {
      setError('Username must be at least 2 characters');
      return;
    }

    if (username.length > 20) {
      setError('Username must be less than 20 characters');
      return;
    }

    onSubmit(username.trim());
  };

  return (
    <div className="modal-overlay">
      <div className="modal-content">
        <div className="modal-header">
          <h2>Welcome to Chat!</h2>
          <p>Enter your username to join the conversation</p>
        </div>
        <form onSubmit={handleSubmit} className="username-form">
          <input
            type="text"
            value={username}
            onChange={e => {
              setUsername(e.target.value);
              setError('');
            }}
            placeholder="Enter your username..."
            className="username-input"
            autoFocus
            maxLength={20}
          />
          {error && <div className="error-message">{error}</div>}
          <button type="submit" className="submit-button">
            Join Chat
          </button>
        </form>
      </div>
    </div>
  );
};
