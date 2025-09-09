import { Inter } from 'next/font/google';
import Head from 'next/head';
import SpreadsheetApp from '@/components/SpreadsheetApp';
import styles from '@/styles/index.module.css';

const inter = Inter({
  subsets: ['latin'],
  variable: '--font-inter',
});

export default function Home() {
  return (
    <>
      <Head>
        <title>Collaborative Spreadsheet</title>
        <meta
          content="Real-time collaborative spreadsheet powered by Zustand Multiplayer"
          name="description"
        />
        <meta content="width=device-width, initial-scale=1" name="viewport" />
        <link href="/favicon.ico" rel="icon" />
      </Head>
      <div className={`${styles.page} ${inter.variable}`}>
        <main className={styles.main}>
          <SpreadsheetApp />
        </main>
      </div>
    </>
  );
}
