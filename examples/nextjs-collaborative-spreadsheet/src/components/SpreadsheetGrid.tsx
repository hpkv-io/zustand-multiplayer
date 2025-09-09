import React, { useState, useRef, useEffect } from 'react';
import { useSpreadsheetStore } from '@/lib/store';
import styles from '@/styles/SpreadsheetGrid.module.css';

const COLS = 26;
const ROWS = 50;

const getCellId = (col: number, row: number): string => {
  return `${String.fromCharCode(65 + col)}${row + 1}`;
};

const SpreadsheetGrid: React.FC = () => {
  const {
    cells,
    users,
    currentUser,
    selectedCell,
    selectCell,
    updateCell,
    startEditing,
    stopEditing,
    copyCell,
    pasteCell,
    clearCell,
  } = useSpreadsheetStore();

  const [editingCell, setEditingCell] = useState<string | null>(null);
  const [editValue, setEditValue] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (editingCell && inputRef.current) {
      inputRef.current.focus();
      inputRef.current.select();
    }
  }, [editingCell]);

  const handleCellClick = (cellId: string) => {
    if (editingCell && editingCell !== cellId) {
      finishEditing();
    }
    selectCell(cellId);
  };

  const handleCellDoubleClick = (cellId: string) => {
    if (!currentUser) return;

    const cell = cells[cellId];
    if (cell?.isEditing && cell.editingBy !== currentUser.name) {
      return;
    }

    setEditingCell(cellId);
    setEditValue(cell?.formula || cell?.value || '');
    startEditing(cellId);
  };

  const finishEditing = () => {
    if (editingCell) {
      updateCell(editingCell, editValue, editValue.startsWith('=') ? editValue : undefined);
      stopEditing(editingCell);
      setEditingCell(null);
      setEditValue('');
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent, cellId: string) => {
    if (e.key === 'Enter') {
      if (editingCell) {
        finishEditing();
        const [col, row] = [cellId.charCodeAt(0) - 65, parseInt(cellId.slice(1)) - 1];
        if (row < ROWS - 1) {
          const nextCellId = getCellId(col, row + 1);
          selectCell(nextCellId);
        }
      } else {
        handleCellDoubleClick(cellId);
      }
    } else if (e.key === 'Escape') {
      if (editingCell) {
        stopEditing(editingCell);
        setEditingCell(null);
        setEditValue('');
      }
    } else if (e.key === 'Tab') {
      e.preventDefault();
      if (editingCell) {
        finishEditing();
      }
      const [col, row] = [cellId.charCodeAt(0) - 65, parseInt(cellId.slice(1)) - 1];
      if (col < COLS - 1) {
        const nextCellId = getCellId(col + 1, row);
        selectCell(nextCellId);
      }
    } else if (e.ctrlKey || e.metaKey) {
      if (e.key === 'c') {
        e.preventDefault();
        copyCell(cellId);
      } else if (e.key === 'v') {
        e.preventDefault();
        pasteCell(cellId);
      } else if (e.key === 'x') {
        e.preventDefault();
        copyCell(cellId);
        clearCell(cellId);
      }
    } else if (e.key === 'Delete' || e.key === 'Backspace') {
      if (!editingCell) {
        e.preventDefault();
        clearCell(cellId);
      }
    } else if (!editingCell && e.key.length === 1 && !e.ctrlKey && !e.metaKey) {
      handleCellDoubleClick(cellId);
      setEditValue(e.key);
    }
  };

  const getCellStyle = (cellId: string) => {
    const cell = cells[cellId];
    const style: React.CSSProperties = {};

    if (cell?.style) {
      if (cell.style.bold) style.fontWeight = 'bold';
      if (cell.style.italic) style.fontStyle = 'italic';
      if (cell.style.underline) style.textDecoration = 'underline';
      if (cell.style.backgroundColor) style.backgroundColor = cell.style.backgroundColor;
      if (cell.style.textColor) style.color = cell.style.textColor;
      if (cell.style.fontSize) style.fontSize = `${cell.style.fontSize}px`;
      if (cell.style.textAlign) style.textAlign = cell.style.textAlign;
    }

    return style;
  };

  const getUserSelection = (cellId: string) => {
    const selectingUsers = Object.values(users).filter(
      user => user.selectedCell === cellId && user.id !== currentUser?.id,
    );
    return selectingUsers;
  };

  return (
    <div className={styles.gridContainer}>
      <table className={styles.spreadsheet}>
        <thead>
          <tr>
            <th className={styles.cornerCell}></th>
            {Array.from({ length: COLS }, (_, i) => (
              <th key={i} className={styles.columnHeader}>
                {String.fromCharCode(65 + i)}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {Array.from({ length: ROWS }, (_, rowIndex) => (
            <tr key={rowIndex}>
              <td className={styles.rowHeader}>{rowIndex + 1}</td>
              {Array.from({ length: COLS }, (_, colIndex) => {
                const cellId = getCellId(colIndex, rowIndex);
                const cell = cells[cellId];
                const isSelected = selectedCell === cellId;
                const isEditing = editingCell === cellId;
                const selectingUsers = getUserSelection(cellId);

                return (
                  <td
                    key={cellId}
                    className={`${styles.cell} ${isSelected ? styles.selected : ''} ${
                      cell?.isEditing && cell.editingBy !== currentUser?.name ? styles.locked : ''
                    }`}
                    style={{
                      ...getCellStyle(cellId),
                      ...(selectingUsers.length > 0 && {
                        boxShadow: selectingUsers.map(u => `0 0 0 2px ${u.color}`).join(', '),
                      }),
                    }}
                    onClick={() => handleCellClick(cellId)}
                    onDoubleClick={() => handleCellDoubleClick(cellId)}
                    onKeyDown={e => handleKeyDown(e, cellId)}
                    tabIndex={0}
                  >
                    {isEditing ? (
                      <input
                        ref={inputRef}
                        type="text"
                        value={editValue}
                        onChange={e => setEditValue(e.target.value)}
                        onBlur={finishEditing}
                        onKeyDown={e => handleKeyDown(e, cellId)}
                        className={styles.cellInput}
                      />
                    ) : (
                      <div className={styles.cellContent}>
                        {cell?.value || ''}
                        {cell?.isEditing && cell.editingBy !== currentUser?.name && (
                          <span className={styles.editingIndicator}>
                            {cell.editingBy} is editing...
                          </span>
                        )}
                      </div>
                    )}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
};

export default SpreadsheetGrid;
