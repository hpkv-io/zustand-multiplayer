import React from 'react';
import { useChatStore } from '../store/chatStore';
import '../styles/UserList.css';

export const UserList: React.FC = () => {
  const { users, currentUser } = useChatStore();

  const sortedUsers = Object.values(users)
    .filter(v => v.username)
    .sort((a, b) => {
      if (a.id === currentUser?.id) return -1;
      if (b.id === currentUser?.id) return 1;
      return b.lastSeen - a.lastSeen;
    });

  return (
    <div className="user-list">
      <h3 className="user-list-title">Online Users ({sortedUsers.length})</h3>
      <div className="users">
        {sortedUsers.map(user => (
          <div key={user.id} className="user-item">
            <div className="user-avatar" style={{ backgroundColor: user.color }}>
              {user.username[0].toUpperCase()}
            </div>
            <div className="user-info">
              <span className="username">
                {user.username}
                {user.id === currentUser?.id && ' (You)'}
              </span>
            </div>
            <div className="user-status-dot"></div>
          </div>
        ))}
      </div>
    </div>
  );
};
