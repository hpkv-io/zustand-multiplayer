import type { WithMultiplayer } from '@hpkv/zustand-multiplayer';
import { multiplayer } from '@hpkv/zustand-multiplayer';
import { create } from 'zustand';

type Player = 'X' | 'O';
type Cell = Player | null;
type Board = Cell[];

interface GameState {
  board: Board;
  currentPlayer: Player;
  winner: Player | 'draw' | null;
  gameActive: boolean;
  makeMove: (index: number) => void;
  resetGame: () => void;
}

const checkWinner = (board: Board): Player | 'draw' | null => {
  const winPatterns = [
    [0, 1, 2],
    [3, 4, 5],
    [6, 7, 8], // rows
    [0, 3, 6],
    [1, 4, 7],
    [2, 5, 8], // columns
    [0, 4, 8],
    [2, 4, 6], // diagonals
  ];

  for (const pattern of winPatterns) {
    const [a, b, c] = pattern;
    if (board[a] && board[a] === board[b] && board[a] === board[c]) {
      return board[a] as Player;
    }
  }

  if (board.every(cell => cell !== null)) {
    return 'draw';
  }

  return null;
};

export const useGameStore = create<WithMultiplayer<GameState>>()(
  multiplayer(
    set => ({
      board: Array(9).fill(null),
      currentPlayer: 'X',
      winner: null,
      gameActive: true,

      makeMove: (index: number) =>
        set(state => {
          if (!state.gameActive || state.board[index] || state.winner) {
            return state;
          }

          const newBoard = [...state.board];
          newBoard[index] = state.currentPlayer;

          const winner = checkWinner(newBoard);
          const gameActive = winner === null;

          return {
            ...state,
            board: newBoard,
            currentPlayer: state.currentPlayer === 'X' ? 'O' : 'X',
            winner,
            gameActive,
          };
        }),

      resetGame: () =>
        set(state => ({
          ...state,
          board: Array(9).fill(null),
          currentPlayer: 'X',
          winner: null,
          gameActive: true,
        })),
    }),
    {
      namespace: 'tic-tac-toe-game',
      tokenGenerationUrl: `${process.env.NEXT_PUBLIC_SERVER_URL}/api/generate-token`,
      apiBaseUrl: process.env.NEXT_PUBLIC_HPKV_API_BASE_URL!,
    },
  ),
);
