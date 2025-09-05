import type { NextPage } from 'next';
import Head from 'next/head';
import { DrawingApp } from '../components/DrawingApp';

const Home: NextPage = () => {
  return (
    <>
      <Head>
        <title>Collaborative Drawing Canvas | Zustand Multiplayer</title>
        <meta
          name="description"
          content="Real-time collaborative drawing canvas powered by Zustand Multiplayer"
        />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <link rel="icon" href="/favicon.ico" />
      </Head>
      <DrawingApp />
    </>
  );
};

export default Home;
