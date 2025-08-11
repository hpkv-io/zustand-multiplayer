import React, { useState } from 'react';
import ConnectionStatus from './ConnectionStatus';
import styles from './TodoApp.module.css';
import TodoInput from './TodoInput';
import TodoList from './TodoList';

const TodoApp: React.FC = () => {
  const [filter, setFilter] = useState<'all' | 'active' | 'completed'>('all');

  return (
    <div className={styles['todo-app']}>
      <h1 className={styles['page-title']}>Collaborative ToDo List App</h1>
      <ConnectionStatus />

      <div className={styles['todo-card']}>
        <div className={styles['filters']}>
          <button
            className={`${styles['filter-button']} ${filter === 'all' ? styles['filter-active'] : ''}`}
            onClick={() => setFilter('all')}
          >
            All
          </button>
          <button
            className={`${styles['filter-button']} ${filter === 'active' ? styles['filter-active'] : ''}`}
            onClick={() => setFilter('active')}
          >
            Active
          </button>
          <button
            className={`${styles['filter-button']} ${filter === 'completed' ? styles['filter-active'] : ''}`}
            onClick={() => setFilter('completed')}
          >
            Completed
          </button>
        </div>

        <TodoList filter={filter} />

        <TodoInput />

        <div className={styles['powered-badge']}>
          Powered by{' '}
          <span className={styles['highlight']}>
            <a href="https://zustand.docs.pmnd.rs/">Zustand</a>
          </span>{' '}
          and
          <span className={styles['highlight']}>
            <a href="https://hpkv.io">HPKV</a>
          </span>{' '}
          multiplayer middleware
        </div>
      </div>
    </div>
  );
};

export default TodoApp;
