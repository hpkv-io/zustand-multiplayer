import type { WithMultiplayer } from '@hpkv/zustand-multiplayer';
import { multiplayer } from '@hpkv/zustand-multiplayer';
import { create } from 'zustand';

interface Message {
  id: string;
  text: string;
  userId: string;
  username: string;
  timestamp: number;
}

interface ChatState {
  messages: Record<string, Message>;
  currentUser: { id: string; username: string } | null;
  sendMessage: (text: string) => void;
  setCurrentUser: (username: string) => void;
}

export const useChatStore = create<WithMultiplayer<ChatState>>()(
  multiplayer(
    set => ({
      messages: {},
      currentUser: null,

      sendMessage: (text: string) =>
        set(state => {
          if (!state.currentUser) return state;

          const id = `${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
          const message: Message = {
            id,
            text,
            userId: state.currentUser.id,
            username: state.currentUser.username,
            timestamp: Date.now(),
          };

          return {
            ...state,
            messages: {
              ...state.messages,
              [id]: message,
            },
          };
        }),

      setCurrentUser: (username: string) =>
        set(state => ({
          ...state,
          currentUser: {
            id: `user-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`,
            username,
          },
        })),
    }),
    {
      namespace: 'chat-room',
      tokenGenerationUrl: `${process.env.NEXT_PUBLIC_SERVER_URL}/api/generate-token`,
      apiBaseUrl: process.env.NEXT_PUBLIC_HPKV_API_BASE_URL!,
      sync: ['messages'],
    },
  ),
);
