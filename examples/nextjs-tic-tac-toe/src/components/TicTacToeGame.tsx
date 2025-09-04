import { useGameStore } from '../lib/store';
import ConnectionStatus from './ConnectionStatus';
import GameBoard from './GameBoard';
import styles from './TicTacToeGame.module.css';

export default function TicTacToeGame() {
  const { resetGame } = useGameStore();

  return (
    <div className={styles.gameContainer}>
      <header className={styles.header}>
        <h1>Multiplayer Tic-Tac-Toe</h1>
        <p>Open this page in multiple tabs to play together!</p>
        <ConnectionStatus />
      </header>

      <main className={styles.main}>
        <GameBoard />

        <div className={styles.controls}>
          <button onClick={resetGame} className={styles.resetButton}>
            New Game
          </button>
        </div>
      </main>

      <footer className={styles.footer}>
        <p>
          Built with{' '}
          <a
            href="https://github.com/hpkv-io/zustand-multiplayer"
            target="_blank"
            rel="noopener noreferrer"
          >
            Zustand Multiplayer
          </a>
        </p>
      </footer>
    </div>
  );
}
