import { useGameStore } from '../lib/store';
import styles from './GameBoard.module.css';

export default function GameBoard() {
  const { board, makeMove, winner, currentPlayer, gameActive } = useGameStore();

  const handleCellClick = (index: number) => {
    makeMove(index);
  };

  return (
    <div className={styles.gameBoard}>
      <div className={styles.grid}>
        {board.map((cell, index) => (
          <button
            key={index}
            className={`${styles.cell} ${cell ? styles[cell.toLowerCase()] : ''}`}
            onClick={() => handleCellClick(index)}
            disabled={!gameActive || cell !== null}
          >
            {cell}
          </button>
        ))}
      </div>

      <div className={styles.gameInfo}>
        {winner ? (
          <div className={styles.gameStatus}>
            {winner === 'draw' ? "It's a draw!" : `Player ${winner} wins!`}
          </div>
        ) : (
          <div className={styles.gameStatus}>
            Current player:{' '}
            <span className={styles[currentPlayer.toLowerCase()]}>Player {currentPlayer}</span>
          </div>
        )}
      </div>
    </div>
  );
}
