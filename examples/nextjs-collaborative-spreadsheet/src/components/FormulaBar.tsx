import React, { useState, useEffect } from 'react';
import { useSpreadsheetStore } from '@/lib/store';
import styles from '@/styles/FormulaBar.module.css';

const FormulaBar: React.FC = () => {
  const { cells, selectedCell, updateCell } = useSpreadsheetStore();
  const [formulaValue, setFormulaValue] = useState('');

  useEffect(() => {
    if (selectedCell) {
      const cell = cells[selectedCell];
      setFormulaValue(cell?.formula || cell?.value || '');
    } else {
      setFormulaValue('');
    }
  }, [selectedCell, cells]);

  const handleFormulaChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setFormulaValue(e.target.value);
  };

  const handleFormulaSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (selectedCell) {
      updateCell(
        selectedCell,
        formulaValue,
        formulaValue.startsWith('=') ? formulaValue : undefined,
      );
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      handleFormulaSubmit(e as any);
    } else if (e.key === 'Escape') {
      if (selectedCell) {
        const cell = cells[selectedCell];
        setFormulaValue(cell?.formula || cell?.value || '');
      }
    }
  };

  return (
    <div className={styles.formulaBar}>
      <div className={styles.cellIndicator}>{selectedCell || 'Select a cell'}</div>
      <div className={styles.functionButton}>fx</div>
      <form onSubmit={handleFormulaSubmit} className={styles.formulaForm}>
        <input
          type="text"
          value={formulaValue}
          onChange={handleFormulaChange}
          onKeyDown={handleKeyDown}
          className={styles.formulaInput}
          placeholder={
            selectedCell
              ? 'Enter value or formula (e.g., =A1+B1, =SUM(A1:A10))'
              : 'Select a cell to edit'
          }
          disabled={!selectedCell}
        />
      </form>
    </div>
  );
};

export default FormulaBar;
