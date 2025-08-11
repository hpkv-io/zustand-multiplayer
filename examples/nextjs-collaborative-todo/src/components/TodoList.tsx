import React from 'react';
import { useTodoStore } from '../lib/store';
import styles from './TodoList.module.css';

interface TodoListProps {
  filter: 'all' | 'active' | 'completed';
}

const TodoList: React.FC<TodoListProps> = ({ filter }) => {
  const todos = useTodoStore(state => state.todos);
  const toggleTodo = useTodoStore(state => state.toggleTodo);
  const removeTodo = useTodoStore(state => state.removeTodo);

  const filteredTodos = Object.values(todos).filter(todo => {
    if (filter === 'all') return true;
    if (filter === 'active') return !todo.completed;
    if (filter === 'completed') return todo.completed;
    return true;
  });

  return (
    <ul className={styles['todo-list']}>
      {filteredTodos.map(todo => (
        <li
          key={todo.id ?? Date.now().toString()}
          className={`${styles['todo-item']} ${todo.completed ? styles['completed'] : ''}`}
        >
          <input
            type="checkbox"
            checked={!!todo.completed}
            onChange={() => toggleTodo(todo.id)}
            className={styles['todo-checkbox']}
          />
          <span className={styles['todo-text']}>{todo.text}</span>
          <button
            className={styles['delete-button']}
            onClick={() => removeTodo(todo.id)}
            aria-label="Delete task"
          >
            &times;
          </button>
        </li>
      ))}
      {filteredTodos.length === 0 && (
        <li className={styles['empty-message']}>
          {filter === 'all'
            ? 'No tasks yet. Add one above!'
            : filter === 'active'
              ? 'No active tasks.'
              : 'No completed tasks.'}
        </li>
      )}
    </ul>
  );
};

export default TodoList;
