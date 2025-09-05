import React, { useState } from 'react';
import { useDrawingStore } from '../lib/store';

export function UsernameModal() {
  const [username, setUsername] = useState('');
  const { currentUser, setCurrentUser } = useDrawingStore();

  if (currentUser) return null;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (username.trim()) {
      setCurrentUser(username.trim());
    }
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white p-8 rounded-lg shadow-xl max-w-md w-full mx-4">
        <h2 className="text-2xl font-bold text-gray-800 mb-4 text-center">
          Join the Drawing Session
        </h2>
        <p className="text-gray-600 mb-6 text-center">
          Enter your name to start collaborating on the canvas
        </p>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label htmlFor="username" className="block text-sm font-medium text-gray-700 mb-1">
              Your Name
            </label>
            <input
              id="username"
              type="text"
              value={username}
              onChange={e => setUsername(e.target.value)}
              placeholder="Enter your name..."
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              maxLength={20}
              required
              autoFocus
            />
          </div>
          <button
            type="submit"
            className="w-full bg-blue-500 text-white py-2 px-4 rounded-lg hover:bg-blue-600 transition-colors duration-200 font-medium"
            disabled={!username.trim()}
          >
            Start Drawing
          </button>
        </form>
      </div>
    </div>
  );
}
