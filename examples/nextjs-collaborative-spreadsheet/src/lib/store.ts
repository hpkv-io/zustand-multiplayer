import type { WithMultiplayer } from '@hpkv/zustand-multiplayer';
import { multiplayer } from '@hpkv/zustand-multiplayer';
import { create } from 'zustand';

export interface Cell {
  value: string;
  formula?: string;
  isEditing?: boolean;
  editingBy?: string;
  style?: {
    bold?: boolean;
    italic?: boolean;
    underline?: boolean;
    backgroundColor?: string;
    textColor?: string;
    fontSize?: number;
    textAlign?: 'left' | 'center' | 'right';
  };
}

export interface User {
  id: string;
  name: string;
  color: string;
  selectedCell?: string;
}

interface SpreadsheetState {
  cells: Record<string, Cell>;
  users: Record<string, User>;
  currentUser: User | null;
  selectedCell: string | null;
  copiedCell: Cell | null;
  history: Array<{
    timestamp: number;
    userId: string;
    action: string;
    cellId: string;
    oldValue?: string;
    newValue?: string;
  }>;

  setCurrentUser: (name: string) => void;
  selectCell: (cellId: string | null) => void;
  updateCell: (cellId: string, value: string, formula?: string) => void;
  startEditing: (cellId: string) => void;
  stopEditing: (cellId: string) => void;
  updateCellStyle: (cellId: string, style: Cell['style']) => void;
  copyCell: (cellId: string) => void;
  pasteCell: (cellId: string) => void;
  clearCell: (cellId: string) => void;
  addToHistory: (action: string, cellId: string, oldValue?: string, newValue?: string) => void;
  evaluateFormula: (formula: string) => string;
  getCellValue: (cellId: string) => string;
}

const generateUserColor = (): string => {
  const colors = [
    '#FF6B6B',
    '#4ECDC4',
    '#45B7D1',
    '#96CEB4',
    '#FECA57',
    '#FF9FF3',
    '#54A0FF',
    '#5F27CD',
    '#48DBFB',
    '#00D2D3',
  ];
  return colors[Math.floor(Math.random() * colors.length)];
};

const getCellCoordinates = (cellId: string): { col: number; row: number } => {
  const match = cellId.match(/^([A-Z]+)(\d+)$/);
  if (!match) return { col: 0, row: 0 };

  const col =
    match[1].split('').reduce((acc, char, i, arr) => {
      return acc + (char.charCodeAt(0) - 64) * Math.pow(26, arr.length - i - 1);
    }, 0) - 1;
  const row = parseInt(match[2]) - 1;

  return { col, row };
};

const getCellId = (col: number, row: number): string => {
  let colStr = '';
  col++;
  while (col > 0) {
    col--;
    colStr = String.fromCharCode(65 + (col % 26)) + colStr;
    col = Math.floor(col / 26);
  }
  return `${colStr}${row + 1}`;
};

export const useSpreadsheetStore = create<WithMultiplayer<SpreadsheetState>>()(
  multiplayer(
    (set, get) => ({
      cells: {},
      users: {},
      currentUser: null,
      selectedCell: null,
      copiedCell: null,
      history: [],

      setCurrentUser: (name: string) => {
        const userId = `user-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
        const user = {
          id: userId,
          name,
          color: generateUserColor(),
        };
        set(state => ({
          ...state,
          currentUser: user,
          users: {
            ...state.users,
            [userId]: user,
          },
        }));
      },

      selectCell: (cellId: string | null) => {
        const state = get();
        if (!state.currentUser) return;

        set(prevState => ({
          ...prevState,
          selectedCell: cellId,
          users: {
            ...prevState.users,
            [state.currentUser!.id]: {
              ...prevState.users[state.currentUser!.id],
              selectedCell: cellId || undefined,
            },
          },
        }));
      },

      updateCell: (cellId: string, value: string, formula?: string) => {
        const state = get();
        if (!state.currentUser) return;

        const oldValue = state.cells[cellId]?.value || '';

        let evaluatedValue = value;
        if (formula && formula.startsWith('=')) {
          evaluatedValue = get().evaluateFormula(formula);
        }

        set(prevState => ({
          ...prevState,
          cells: {
            ...prevState.cells,
            [cellId]: {
              ...prevState.cells[cellId],
              value: evaluatedValue,
              formula: formula || undefined,
              isEditing: false,
              editingBy: undefined,
            },
          },
        }));

        get().addToHistory('update', cellId, oldValue, evaluatedValue);
      },

      startEditing: (cellId: string) => {
        const state = get();
        if (!state.currentUser) return;

        set(prevState => ({
          ...prevState,
          cells: {
            ...prevState.cells,
            [cellId]: {
              ...prevState.cells[cellId],
              isEditing: true,
              editingBy: state.currentUser!.name,
            },
          },
        }));
      },

      stopEditing: (cellId: string) => {
        set(prevState => ({
          ...prevState,
          cells: {
            ...prevState.cells,
            [cellId]: {
              ...prevState.cells[cellId],
              isEditing: false,
              editingBy: undefined,
            },
          },
        }));
      },

      updateCellStyle: (cellId: string, style: Cell['style']) => {
        const state = get();
        if (!state.currentUser) return;

        set(prevState => ({
          ...prevState,
          cells: {
            ...prevState.cells,
            [cellId]: {
              ...prevState.cells[cellId],
              style: {
                ...prevState.cells[cellId]?.style,
                ...style,
              },
            },
          },
        }));

        get().addToHistory('style', cellId);
      },

      copyCell: (cellId: string) => {
        const state = get();
        const cell = state.cells[cellId];
        if (!cell) return;

        set(prevState => ({
          ...prevState,
          copiedCell: cell,
        }));
      },

      pasteCell: (cellId: string) => {
        const state = get();
        if (!state.copiedCell || !state.currentUser) return;

        const oldValue = state.cells[cellId]?.value || '';

        set(prevState => ({
          ...prevState,
          cells: {
            ...prevState.cells,
            [cellId]: {
              ...state.copiedCell!,
              isEditing: false,
              editingBy: undefined,
            },
          },
        }));

        get().addToHistory('paste', cellId, oldValue, state.copiedCell.value);
      },

      clearCell: (cellId: string) => {
        const state = get();
        if (!state.currentUser) return;

        const oldValue = state.cells[cellId]?.value || '';

        set(prevState => {
          const { [cellId]: removed, ...remainingCells } = prevState.cells;
          return {
            ...prevState,
            cells: remainingCells,
          };
        });

        get().addToHistory('clear', cellId, oldValue, '');
      },

      addToHistory: (action: string, cellId: string, oldValue?: string, newValue?: string) => {
        const state = get();
        if (!state.currentUser) return;

        const historyEntry = {
          timestamp: Date.now(),
          userId: state.currentUser.id,
          action,
          cellId,
          oldValue,
          newValue,
        };

        set(prevState => ({
          ...prevState,
          history: [...prevState.history.slice(-99), historyEntry],
        }));
      },

      evaluateFormula: (formula: string) => {
        const state = get();

        if (!formula.startsWith('=')) {
          return formula;
        }

        let expression = formula.substring(1).toUpperCase();

        // Handle SUM function first (before replacing cell references)
        if (expression.startsWith('SUM(') && expression.endsWith(')')) {
          const range = expression.substring(4, expression.length - 1);
          if (range.includes(':')) {
            const [start, end] = range.split(':');
            const startCoords = getCellCoordinates(start);
            const endCoords = getCellCoordinates(end);

            let sum = 0;
            for (let row = startCoords.row; row <= endCoords.row; row++) {
              for (let col = startCoords.col; col <= endCoords.col; col++) {
                const cellId = getCellId(col, row);
                const value = parseFloat(state.getCellValue(cellId)) || 0;
                sum += value;
              }
            }
            return sum.toString();
          }
        }

        // Handle AVERAGE function
        if (expression.startsWith('AVERAGE(') && expression.endsWith(')')) {
          const range = expression.substring(8, expression.length - 1);
          if (range.includes(':')) {
            const [start, end] = range.split(':');
            const startCoords = getCellCoordinates(start);
            const endCoords = getCellCoordinates(end);

            let sum = 0;
            let count = 0;
            for (let row = startCoords.row; row <= endCoords.row; row++) {
              for (let col = startCoords.col; col <= endCoords.col; col++) {
                const cellId = getCellId(col, row);
                const value = parseFloat(state.getCellValue(cellId));
                if (!isNaN(value)) {
                  sum += value;
                  count++;
                }
              }
            }
            return count > 0 ? (sum / count).toString() : '0';
          }
        }

        // Handle COUNT function
        if (expression.startsWith('COUNT(') && expression.endsWith(')')) {
          const range = expression.substring(6, expression.length - 1);
          if (range.includes(':')) {
            const [start, end] = range.split(':');
            const startCoords = getCellCoordinates(start);
            const endCoords = getCellCoordinates(end);

            let count = 0;
            for (let row = startCoords.row; row <= endCoords.row; row++) {
              for (let col = startCoords.col; col <= endCoords.col; col++) {
                const cellId = getCellId(col, row);
                const value = state.getCellValue(cellId);
                if (value) count++;
              }
            }
            return count.toString();
          }
        }

        // Now handle individual cell references for arithmetic expressions
        const cellRefPattern = /([A-Z]+\d+)/g;
        const cellRefs = expression.match(cellRefPattern) || [];

        for (const cellRef of cellRefs) {
          const cellValue = state.getCellValue(cellRef);
          const numValue = parseFloat(cellValue) || 0;
          expression = expression.replace(cellRef, numValue.toString());
        }

        // Evaluate arithmetic expressions
        try {
          const safeExpression = expression.replace(/[^0-9+\-*/().\s]/g, '');
          const result = Function(`"use strict"; return (${safeExpression})`)();
          return result.toString();
        } catch (error) {
          return '#ERROR';
        }
      },

      getCellValue: (cellId: string) => {
        const state = get();
        return state.cells[cellId]?.value || '';
      },
    }),
    {
      namespace: 'collaborative-spreadsheet',
      tokenGenerationUrl: `${process.env.NEXT_PUBLIC_SERVER_URL}/api/generate-token`,
      apiBaseUrl: process.env.NEXT_PUBLIC_HPKV_API_BASE_URL!,
      sync: ['cells', 'users', 'history'],
    },
  ),
);
