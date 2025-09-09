import React from 'react';
import { useSpreadsheetStore } from '@/lib/store';
import styles from '@/styles/Toolbar.module.css';

const Toolbar: React.FC = () => {
  const { selectedCell, updateCellStyle, cells } = useSpreadsheetStore();

  const handleStyleChange = (styleProperty: string, value: any) => {
    if (!selectedCell) return;
    updateCellStyle(selectedCell, { [styleProperty]: value });
  };

  const currentCellStyle = selectedCell ? cells[selectedCell]?.style : null;

  return (
    <div className={styles.toolbar}>
      <div className={styles.toolGroup}>
        <button
          className={`${styles.toolButton} ${currentCellStyle?.bold ? styles.active : ''}`}
          onClick={() => handleStyleChange('bold', !currentCellStyle?.bold)}
          title="Bold"
          disabled={!selectedCell}
        >
          <strong>B</strong>
        </button>
        <button
          className={`${styles.toolButton} ${currentCellStyle?.italic ? styles.active : ''}`}
          onClick={() => handleStyleChange('italic', !currentCellStyle?.italic)}
          title="Italic"
          disabled={!selectedCell}
        >
          <em>I</em>
        </button>
        <button
          className={`${styles.toolButton} ${currentCellStyle?.underline ? styles.active : ''}`}
          onClick={() => handleStyleChange('underline', !currentCellStyle?.underline)}
          title="Underline"
          disabled={!selectedCell}
        >
          <u>U</u>
        </button>
      </div>

      <div className={styles.separator} />

      <div className={styles.toolGroup}>
        <button
          className={`${styles.toolButton} ${currentCellStyle?.textAlign === 'left' ? styles.active : ''}`}
          onClick={() => handleStyleChange('textAlign', 'left')}
          title="Align Left"
          disabled={!selectedCell}
        >
          ⬅
        </button>
        <button
          className={`${styles.toolButton} ${currentCellStyle?.textAlign === 'center' ? styles.active : ''}`}
          onClick={() => handleStyleChange('textAlign', 'center')}
          title="Align Center"
          disabled={!selectedCell}
        >
          ⬌
        </button>
        <button
          className={`${styles.toolButton} ${currentCellStyle?.textAlign === 'right' ? styles.active : ''}`}
          onClick={() => handleStyleChange('textAlign', 'right')}
          title="Align Right"
          disabled={!selectedCell}
        >
          ➡
        </button>
      </div>

      <div className={styles.separator} />

      <div className={styles.toolGroup}>
        <label className={styles.colorPicker}>
          <span>Text:</span>
          <input
            type="color"
            value={currentCellStyle?.textColor || '#000000'}
            onChange={e => handleStyleChange('textColor', e.target.value)}
            disabled={!selectedCell}
          />
        </label>
        <label className={styles.colorPicker}>
          <span>Fill:</span>
          <input
            type="color"
            value={currentCellStyle?.backgroundColor || '#FFFFFF'}
            onChange={e => handleStyleChange('backgroundColor', e.target.value)}
            disabled={!selectedCell}
          />
        </label>
      </div>

      <div className={styles.separator} />

      <div className={styles.toolGroup}>
        <select
          className={styles.fontSizeSelect}
          value={currentCellStyle?.fontSize || 14}
          onChange={e => handleStyleChange('fontSize', parseInt(e.target.value))}
          disabled={!selectedCell}
        >
          <option value="10">10px</option>
          <option value="12">12px</option>
          <option value="14">14px</option>
          <option value="16">16px</option>
          <option value="18">18px</option>
          <option value="20">20px</option>
          <option value="24">24px</option>
        </select>
      </div>

      <div className={styles.formulaHelp}>
        <span>Formulas: =SUM(A1:B5), =AVERAGE(A1:A10), =COUNT(B1:B20), =A1+B1*2</span>
      </div>
    </div>
  );
};

export default Toolbar;
