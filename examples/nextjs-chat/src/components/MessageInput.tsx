import React, { useState } from 'react';
import { useChatStore } from '../lib/store';
import styles from './MessageInput.module.css';

const MessageInput: React.FC = () => {
  const [message, setMessage] = useState('');
  const { sendMessage, currentUser } = useChatStore();

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();

    if (!message.trim() || !currentUser) return;

    sendMessage(message);
    setMessage('');
  };

  return (
    <form onSubmit={handleSubmit} className={styles['message-input-form']}>
      <input
        type="text"
        value={message}
        onChange={e => setMessage(e.target.value)}
        placeholder={currentUser ? 'Type a message...' : 'Enter username to start chatting'}
        disabled={!currentUser}
        className={styles['message-input']}
      />
      <button
        type="submit"
        disabled={!currentUser || !message.trim()}
        className={styles['send-button']}
      >
        Send
      </button>
    </form>
  );
};

export default MessageInput;
