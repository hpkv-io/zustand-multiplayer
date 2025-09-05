import type { WithMultiplayer } from '@hpkv/zustand-multiplayer';
import { multiplayer } from '@hpkv/zustand-multiplayer';
import { create } from 'zustand';

export interface Point {
  x: number;
  y: number;
}

export interface StrokeChunk {
  id: string;
  strokeId: string;
  chunkIndex: number;
  points: Point[];
  color: string;
  thickness: number;
  timestamp: number;
  userId: string;
  username: string;
}

export interface Cursor {
  x: number;
  y: number;
  userId: string;
  username: string;
  color: string;
  timestamp: number;
}

export interface ActiveStroke {
  userId: string;
  username: string;
  points: Point[];
  color: string;
  thickness: number;
  timestamp: number;
}

interface DrawingState {
  strokes: Record<string, StrokeChunk>;
  cursors: Record<string, Cursor>;
  activeStrokes: Record<string, ActiveStroke>;
  currentUser: { id: string; username: string; color: string } | null;
  currentStroke: Point[];
  currentColor: string;
  currentThickness: number;
  isDrawing: boolean;
  cursorTimeouts: Record<string, NodeJS.Timeout>;

  setCurrentUser: (username: string) => void;
  startDrawing: (point: Point) => void;
  addPointToStroke: (point: Point) => void;
  finishStroke: () => void;
  setColor: (color: string) => void;
  setThickness: (thickness: number) => void;
  updateCursor: (point: Point) => void;
  clearCanvas: () => void;
}

const CHUNK_SIZE = 8;

const generateColor = (): string => {
  const colors = [
    '#FF6B6B',
    '#4ECDC4',
    '#45B7D1',
    '#96CEB4',
    '#FECA57',
    '#FF9FF3',
    '#54A0FF',
    '#5F27CD',
  ];
  return colors[Math.floor(Math.random() * colors.length)];
};

const chunkPoints = (points: Point[], chunkSize: number): Point[][] => {
  const chunks: Point[][] = [];
  for (let i = 0; i < points.length; i += chunkSize) {
    chunks.push(points.slice(i, i + chunkSize));
  }
  return chunks;
};

export const useDrawingStore = create<WithMultiplayer<DrawingState>>()(
  multiplayer(
    (set, get) => ({
      strokes: {},
      cursors: {},
      activeStrokes: {},
      currentUser: null,
      currentStroke: [],
      currentColor: '#000000',
      currentThickness: 3,
      isDrawing: false,
      cursorTimeouts: {},

      setCurrentUser: (username: string) => {
        const color = generateColor();
        set(state => ({
          ...state,
          currentUser: {
            id: `user-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`,
            username,
            color,
          },
          currentColor: color,
        }));
      },

      startDrawing: (point: Point) => {
        const state = get();
        if (!state.currentUser) return;

        set(prevState => ({
          ...prevState,
          currentStroke: [point],
          isDrawing: true,
          activeStrokes: {
            ...prevState.activeStrokes,
            [state.currentUser!.id]: {
              userId: state.currentUser!.id,
              username: state.currentUser!.username,
              points: [point],
              color: state.currentColor,
              thickness: state.currentThickness,
              timestamp: Date.now(),
            },
          },
        }));
      },

      addPointToStroke: (point: Point) => {
        const state = get();
        if (!state.currentUser) return;

        const newStroke = [...state.currentStroke, point];
        set(prevState => ({
          ...prevState,
          currentStroke: newStroke,
          activeStrokes: {
            ...prevState.activeStrokes,
            [state.currentUser!.id]: {
              ...prevState.activeStrokes[state.currentUser!.id],
              points: newStroke,
              timestamp: Date.now(),
            },
          },
        }));
      },

      finishStroke: () => {
        const state = get();
        if (!state.currentUser || state.currentStroke.length === 0) {
          const { [state.currentUser?.id || '']: _removed, ...remainingActiveStrokes } =
            get().activeStrokes;
          set(prevState => ({
            ...prevState,
            isDrawing: false,
            currentStroke: [],
            activeStrokes: remainingActiveStrokes,
          }));
          return;
        }

        const strokeId = `stroke-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
        const chunks = chunkPoints(state.currentStroke, CHUNK_SIZE);
        const newStrokes: Record<string, StrokeChunk> = {};

        chunks.forEach((chunkPoints, index) => {
          const chunkId = `${strokeId}-chunk-${index}`;
          newStrokes[chunkId] = {
            id: chunkId,
            strokeId,
            chunkIndex: index,
            points: chunkPoints,
            color: state.currentColor,
            thickness: state.currentThickness,
            timestamp: Date.now(),
            userId: state.currentUser!.id,
            username: state.currentUser!.username,
          };
        });

        const { [state.currentUser.id]: _removed, ...remainingActiveStrokes } = state.activeStrokes;

        set(prevState => ({
          ...prevState,
          strokes: {
            ...prevState.strokes,
            ...newStrokes,
          },
          currentStroke: [],
          isDrawing: false,
          activeStrokes: remainingActiveStrokes,
        }));
      },

      setColor: (color: string) => {
        set(state => ({
          ...state,
          currentColor: color,
        }));
      },

      setThickness: (thickness: number) => {
        set(state => ({
          ...state,
          currentThickness: thickness,
        }));
      },

      updateCursor: (point: Point) => {
        const state = get();
        if (!state.currentUser) return;

        const cursorId = state.currentUser.id;

        // Clear existing timeout for this cursor
        if (state.cursorTimeouts[cursorId]) {
          clearTimeout(state.cursorTimeouts[cursorId]);
        }

        set(prevState => ({
          ...prevState,
          cursors: {
            ...prevState.cursors,
            [cursorId]: {
              x: point.x,
              y: point.y,
              userId: state.currentUser!.id,
              username: state.currentUser!.username,
              color: state.currentUser!.color,
              timestamp: Date.now(),
            },
          },
          cursorTimeouts: {
            ...prevState.cursorTimeouts,
            [cursorId]: setTimeout(() => {
              set(state => {
                const { [cursorId]: _removed, ...remainingCursors } = state.cursors;
                const { [cursorId]: _removedTimeout, ...remainingTimeouts } = state.cursorTimeouts;
                return {
                  ...state,
                  cursors: remainingCursors,
                  cursorTimeouts: remainingTimeouts,
                };
              });
            }, 30000),
          },
        }));
      },

      clearCanvas: () => {
        set(state => ({
          ...state,
          strokes: {},
        }));
      },
    }),
    {
      namespace: 'drawing-canvas',
      tokenGenerationUrl: `${process.env.NEXT_PUBLIC_SERVER_URL}/api/generate-token`,
      apiBaseUrl: process.env.NEXT_PUBLIC_HPKV_API_BASE_URL!,
      sync: ['strokes', 'cursors', 'activeStrokes'],
    },
  ),
);
