import React from 'react';
import { useDrawingStore } from '../lib/store';

export function UserList() {
  const { cursors, currentUser } = useDrawingStore();

  const activeUsers = Object.values(cursors).filter(
    cursor => !currentUser || cursor.userId !== currentUser.id,
  );
  const totalUsers = activeUsers.length + (currentUser ? 1 : 0);

  return (
    <div className="bg-white p-4 rounded-lg shadow-lg border border-gray-200">
      <h3 className="text-lg font-semibold text-gray-800 mb-3">Active Users ({totalUsers})</h3>
      <div className="space-y-2">
        {currentUser && (
          <div className="flex items-center space-x-2">
            <div
              className="w-4 h-4 rounded-full border-2 border-white shadow-md"
              style={{ backgroundColor: currentUser.color }}
            />
            <span className="text-sm text-gray-700">{currentUser.username} (You)</span>
          </div>
        )}
        {activeUsers.map(user => (
          <div key={user.userId} className="flex items-center space-x-2">
            <div
              className="w-4 h-4 rounded-full border-2 border-white shadow-md"
              style={{ backgroundColor: user.color }}
            />
            <span className="text-sm text-gray-700">{user.username}</span>
          </div>
        ))}
      </div>
      {totalUsers === 1 && (
        <p className="text-xs text-gray-500 mt-3 italic">
          Open this page in another browser window to collaborate!
        </p>
      )}
    </div>
  );
}
