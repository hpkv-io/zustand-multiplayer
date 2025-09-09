import React from 'react';
import { useSpreadsheetStore } from '@/lib/store';
import styles from '@/styles/UserList.module.css';

const UserList: React.FC = () => {
  const { users, currentUser } = useSpreadsheetStore();

  return (
    <div className={styles.userList}>
      <span className={styles.label}>Active Users:</span>
      <div className={styles.users}>
        {Object.values(users).map(user => (
          <div
            key={user.id}
            className={`${styles.user} ${user.id === currentUser?.id ? styles.currentUser : ''}`}
            style={{ borderColor: user.color }}
          >
            <div className={styles.userAvatar} style={{ backgroundColor: user.color }}>
              {user.name ? user.name.charAt(0).toUpperCase() : '?'}
            </div>
            <span className={styles.userName}>
              {user.name || 'Unknown'}
              {user.id === currentUser?.id && ' (You)'}
            </span>
            {user.selectedCell && <span className={styles.userCell}>{user.selectedCell}</span>}
          </div>
        ))}
      </div>
    </div>
  );
};

export default UserList;
