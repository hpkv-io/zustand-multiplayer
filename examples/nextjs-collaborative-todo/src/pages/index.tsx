import { Roboto } from 'next/font/google';
import Head from 'next/head';
import TodoApp from '@/components/TodoApp';
import styles from '@/styles/index.module.css';

const roboto = Roboto({
  weight: ['400', '500', '700'],
  subsets: ['latin'],
  variable: '--font-roboto',
});

export default function Home() {
  return (
    <>
      <Head>
        <title>ToDo App</title>
        <meta name="description" content="A clean, minimalistic ToDo app with a modern design" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <link rel="icon" href="/favicon.ico" />
      </Head>
      <div className={`${styles.page} ${roboto.variable}`}>
        <main className={styles.main}>
          <TodoApp />
        </main>
      </div>
    </>
  );
}
