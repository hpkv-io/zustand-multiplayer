import Head from 'next/head';
import TicTacToeGame from '../components/TicTacToeGame';

export default function Home() {
  return (
    <>
      <Head>
        <title>Multiplayer Tic-Tac-Toe</title>
        <meta
          name="description"
          content="A multiplayer tic-tac-toe game built with Next.js and Zustand Multiplayer middleware"
        />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <link rel="icon" href="/favicon.ico" />
      </Head>
      <TicTacToeGame />
    </>
  );
}
