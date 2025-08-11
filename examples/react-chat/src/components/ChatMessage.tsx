import React from 'react';
import type { Message } from '../types/chat';
import '../styles/ChatMessage.css';

interface ChatMessageProps {
  message: Message;
  isOwnMessage: boolean;
}

export const ChatMessage: React.FC<ChatMessageProps> = ({ message, isOwnMessage }) => {
  const formatTime = (timestamp: number) => {
    const date = new Date(timestamp);
    return date.toLocaleTimeString('en-US', {
      hour: 'numeric',
      minute: '2-digit',
      hour12: true,
    });
  };

  return (
    <div className={`message-container ${isOwnMessage ? 'own-message' : ''}`}>
      <div
        className="message-bubble"
        style={{ backgroundColor: isOwnMessage ? '#45B7D1' : '#f0f0f0' }}
      >
        {!isOwnMessage && (
          <div className="message-header">
            <span className="message-username" style={{ color: message.color }}>
              {message.username}
            </span>
          </div>
        )}
        <div className="message-text" style={{ color: isOwnMessage ? '#fff' : '#333' }}>
          {message.text}
        </div>
        <div className="message-time" style={{ color: isOwnMessage ? '#e0f7fa' : '#999' }}>
          {formatTime(message.timestamp)}
        </div>
      </div>
    </div>
  );
};
