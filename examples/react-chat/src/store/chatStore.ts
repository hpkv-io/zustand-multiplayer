import type { WithMultiplayer } from '@hpkv/zustand-multiplayer';
import { multiplayer } from '@hpkv/zustand-multiplayer';
import { create } from 'zustand';
import type { Message, User } from '../types/chat';

interface ChatState {
  messages: Record<string, Message>;
  users: Record<string, User>;
  currentUser: User | null;
  addMessage: (text: string) => void;
  setCurrentUser: (username: string) => void;
  updateUserActivity: () => void;
  removeInactiveUsers: () => void;
}

const generateColor = () => {
  const colors = [
    '#FF6B6B',
    '#4ECDC4',
    '#45B7D1',
    '#96CEB4',
    '#FFEAA7',
    '#DDA0DD',
    '#98D8C8',
    '#FFB6C1',
    '#87CEEB',
    '#F7DC6F',
  ];
  return colors[Math.floor(Math.random() * colors.length)];
};

export const useChatStore = create<WithMultiplayer<ChatState>>()(
  multiplayer(
    set => ({
      messages: {},
      users: {},
      currentUser: null,

      addMessage: (text: string) =>
        set(state => {
          const currentUser = state.currentUser;
          if (!currentUser || !text.trim()) return state;

          const messageId = `${Date.now()}-${Math.random()}`;
          return {
            ...state,
            messages: {
              ...state.messages,
              [messageId]: {
                id: messageId,
                text: text.trim(),
                userId: currentUser.id,
                username: currentUser.username,
                timestamp: Date.now(),
                color: currentUser.color,
              },
            },
          };
        }),

      setCurrentUser: (username: string) =>
        set(state => {
          const userId = `user-${Date.now()}-${Math.random()}`;
          const color = generateColor();
          const user: User = {
            id: userId,
            username,
            color,
            lastSeen: Date.now(),
          };

          return {
            ...state,
            currentUser: user,
            users: {
              ...state.users,
              [userId]: user,
            },
          };
        }),

      updateUserActivity: () =>
        set(state => {
          const currentUser = state.currentUser;
          if (!currentUser) return state;

          return {
            ...state,
            users: {
              ...state.users,
              [currentUser.id]: {
                ...state.users[currentUser.id],
                lastSeen: Date.now(),
              },
            },
          };
        }),

      removeInactiveUsers: () =>
        set(state => {
          const now = Date.now();
          const INACTIVE_THRESHOLD = 30000; // 30 seconds

          const activeUsers: Record<string, User> = {};

          Object.entries(state.users).forEach(([userId, user]) => {
            if (now - user.lastSeen < INACTIVE_THRESHOLD || userId === state.currentUser?.id) {
              activeUsers[userId] = user;
            }
          });

          return {
            ...state,
            users: activeUsers,
          };
        }),
    }),
    {
      namespace: 'chat-app',
      tokenGenerationUrl: `${import.meta.env.VITE_SERVER_URL}/api/generate-token`,
      apiBaseUrl: import.meta.env.VITE_HPKV_API_BASE_URL,
      sync: ['messages', 'users'],
    },
  ),
);
