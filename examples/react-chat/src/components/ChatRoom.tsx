import React, { useEffect, useRef } from 'react';
import { useChatStore } from '../store/chatStore';
import { ChatMessage } from './ChatMessage';
import { MessageInput } from './MessageInput';
import '../styles/ChatRoom.css';

export const ChatRoom: React.FC = () => {
  const { messages, currentUser, updateUserActivity, removeInactiveUsers } = useChatStore();
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  useEffect(() => {
    const activityInterval = setInterval(() => {
      updateUserActivity();
    }, 10000);

    const cleanupInterval = setInterval(() => {
      removeInactiveUsers();
    }, 15000);

    return () => {
      clearInterval(activityInterval);
      clearInterval(cleanupInterval);
    };
  }, [updateUserActivity, removeInactiveUsers]);

  const sortedMessages = Object.values(messages).sort((a, b) => a.timestamp - b.timestamp);

  return (
    <div className="chat-room">
      <div className="chat-header">
        <h2>Chat Room</h2>
        <span className="header-subtitle">Real-time messaging with Zustand Multiplayer</span>
      </div>
      <div className="messages-container">
        {sortedMessages.length === 0 ? (
          <div className="empty-state">
            <p>No messages yet. Start the conversation!</p>
          </div>
        ) : (
          sortedMessages.map(message => (
            <ChatMessage
              key={message.id}
              message={message}
              isOwnMessage={message.userId === currentUser?.id}
            />
          ))
        )}
        <div ref={messagesEndRef} />
      </div>
      <MessageInput />
    </div>
  );
};
