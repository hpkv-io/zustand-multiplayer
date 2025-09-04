import { multiplayer } from '@hpkv/zustand-multiplayer';
import { create } from 'zustand';

// Generate a unique session ID for each browser tab/window
const generateSessionId = () => {
  return Math.random().toString(36).substring(2) + Date.now().toString(36);
};

const generateUserColor = () => {
  const colors = [
    '#FF6B6B',
    '#4ECDC4',
    '#45B7D1',
    '#96CEB4',
    '#FFEAA7',
    '#DDA0DD',
    '#98D8C8',
    '#FD79A8',
    '#A29BFE',
    '#FDCB6E',
    '#6C5CE7',
    '#00B894',
  ];
  return colors[Math.floor(Math.random() * colors.length)];
};

// Each tab/window gets its own unique session
const userId = generateSessionId();
const userColor = generateUserColor();
const userName = `User ${userId.substring(0, 4)}`;

export const useCursorStore = create(
  multiplayer(
    (set, get) => ({
      cursors: {},

      updateCursor: (x, y) => {
        set(state => ({
          cursors: {
            ...state.cursors,
            [userId]: {
              id: userId,
              name: userName,
              color: userColor,
              x,
              y,
              lastUpdate: Date.now(),
            },
          },
        }));
      },

      removeCursor: () => {
        set(state => {
          const newCursors = { ...state.cursors };
          delete newCursors[userId];
          return { cursors: newCursors };
        });
      },

      // Clean up stale cursors (users who left)
      cleanupStaleCursors: () => {
        const now = Date.now();
        set(state => {
          const newCursors = {};
          Object.entries(state.cursors).forEach(([id, cursor]) => {
            if (now - cursor.lastUpdate < 10000) {
              // Keep cursors active in last 10 seconds
              newCursors[id] = cursor;
            }
          });
          return { cursors: newCursors };
        });
      },

      // Local state
      userId,
      userName,
      userColor,
    }),
    {
      namespace: 'live-cursors-demo',
      apiBaseUrl: import.meta.env.VITE_HPKV_API_BASE_URL,
      tokenGenerationUrl: '/api/generate-token',
      sync: ['cursors'], // Only sync cursor data
      zFactor: 1, // Optimize for cursor updates
    },
  ),
);
