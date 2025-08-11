import React, { useState } from 'react';
import { useTodoStore } from '../lib/store';
import styles from './TodoInput.module.css';

const TodoInput: React.FC = () => {
  const [text, setText] = useState('');
  const addTodo = useTodoStore(state => state.addTodo);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (text.trim()) {
      addTodo(text.trim());
      setText('');
    }
  };

  return (
    <div className={styles['add-task-section']}>
      <form onSubmit={handleSubmit} className={styles['todo-form']}>
        <input
          type="text"
          value={text}
          onChange={e => setText(e.target.value)}
          placeholder="Add a new task..."
          className={styles['todo-input']}
          autoFocus
        />
        <button type="submit" className={styles['todo-submit']}>
          <span className={styles['plus-icon']}>+</span>
        </button>
      </form>
    </div>
  );
};

export default TodoInput;
