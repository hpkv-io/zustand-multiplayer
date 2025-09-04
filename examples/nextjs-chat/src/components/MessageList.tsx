import React, { useEffect, useRef } from 'react';
import { useChatStore } from '../lib/store';
import styles from './MessageList.module.css';

const MessageList: React.FC = () => {
  const { messages, currentUser } = useChatStore();
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const sortedMessages = Object.values(messages).sort((a, b) => a.timestamp - b.timestamp);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [sortedMessages]);

  if (sortedMessages.length === 0) {
    return (
      <div className={styles['message-list']}>
        <div className={styles['empty-state']}>No messages yet. Start the conversation!</div>
      </div>
    );
  }

  return (
    <div className={styles['message-list']}>
      {sortedMessages.map(message => {
        const isOwnMessage = currentUser?.id === message.userId;
        return (
          <div
            key={message.id}
            className={`${styles['message']} ${isOwnMessage ? styles['own-message'] : styles['other-message']}`}
          >
            <div className={styles['message-header']}>
              <span className={styles['message-username']}>{message.username}</span>
              <span className={styles['message-time']}>
                {new Date(message.timestamp).toLocaleTimeString()}
              </span>
            </div>
            <div className={styles['message-text']}>{message.text}</div>
          </div>
        );
      })}
      <div ref={messagesEndRef} />
    </div>
  );
};

export default MessageList;
