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
      <form className={styles['todo-form']} onSubmit={handleSubmit}>
        <input
          autoFocus
          className={styles['todo-input']}
          placeholder="Add a new task..."
          type="text"
          value={text}
          onChange={e => setText(e.target.value)}
        />
        <button className={styles['todo-submit']} type="submit">
          <span className={styles['plus-icon']}>+</span>
        </button>
      </form>
    </div>
  );
};

export default TodoInput;
