import React, { useEffect, useState } from 'react';
import { useChatStore } from '../lib/store';
import styles from './ChatApp.module.css';
import ConnectionStatus from './ConnectionStatus';
import MessageInput from './MessageInput';
import MessageList from './MessageList';
import UsernameModal from './UsernameModal';

const ChatApp: React.FC = () => {
  const { currentUser, setCurrentUser } = useChatStore();
  const [showUsernameModal, setShowUsernameModal] = useState(true);

  useEffect(() => {
    if (currentUser) {
      setShowUsernameModal(false);
    }
  }, [currentUser]);

  const handleUsernameSubmit = (username: string) => {
    setCurrentUser(username);
    setShowUsernameModal(false);
  };

  return (
    <div className={styles['chat-app']}>
      <h1 className={styles['page-title']}>Real-time Chat</h1>
      <ConnectionStatus />

      <div className={styles['chat-container']}>
        {currentUser && (
          <div className={styles['user-info']}>
            Chatting as: <span className={styles['username']}>{currentUser.username}</span>
          </div>
        )}

        <MessageList />
        <MessageInput />

        <div className={styles['powered-badge']}>
          Powered by{' '}
          <span className={styles['highlight']}>
            <a href="https://zustand.docs.pmnd.rs/">Zustand</a>
          </span>{' '}
          and{' '}
          <span className={styles['highlight']}>
            <a href="https://hpkv.io">HPKV</a>
          </span>{' '}
          multiplayer middleware
        </div>
      </div>

      {showUsernameModal && <UsernameModal onSubmit={handleUsernameSubmit} />}
    </div>
  );
};

export default ChatApp;
