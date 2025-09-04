import React from 'react';
import { useCursorStore } from '../store';
import './ActiveUsers.css';

const ActiveUsers = () => {
  const { cursors, userId } = useCursorStore();
  const activeCursorsCount = Object.keys(cursors).length;

  return (
    <div className="active-users">
      <div className="users-grid">
        {Object.values(cursors).map(cursor => (
          <div
            key={cursor.id}
            className={`user-indicator ${cursor.id === userId ? 'current-user' : ''}`}
            style={{ backgroundColor: cursor.color }}
            title={cursor.name}
          >
            <span>{cursor.name.substring(0, 2).toUpperCase()}</span>
          </div>
        ))}
      </div>
      <span className="users-count">{activeCursorsCount} active</span>
    </div>
  );
};

export default ActiveUsers;
