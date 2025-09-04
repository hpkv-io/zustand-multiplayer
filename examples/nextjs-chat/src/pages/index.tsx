import Head from 'next/head';
import ChatApp from '../components/ChatApp';

export default function Home() {
  return (
    <>
      <Head>
        <title>Real-time Chat - Zustand Multiplayer</title>
        <meta
          name="description"
          content="A real-time chat application built with Next.js and Zustand Multiplayer middleware"
        />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <link rel="icon" href="/favicon.ico" />
      </Head>
      <ChatApp />
    </>
  );
}
