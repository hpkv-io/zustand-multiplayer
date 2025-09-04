import { multiplayer } from '@hpkv/zustand-multiplayer';
import { createStore } from 'zustand/vanilla';

const todoStore = createStore(
  multiplayer(
    set => ({
      todos: {},
      addTodo: text =>
        set(state => {
          const id = Date.now().toString();
          return {
            ...state,
            todos: {
              ...state.todos,
              [id]: {
                id,
                text,
                completed: false,
              },
            },
          };
        }),
      toggleTodo: id =>
        set(state => ({
          todos: {
            ...state.todos,
            [id]: {
              ...state.todos[id],
              completed: !state.todos[id].completed,
            },
          },
        })),
      removeTodo: id =>
        set(state => ({
          todos: Object.fromEntries(Object.entries(state.todos).filter(([key]) => key !== id)),
        })),
    }),
    {
      namespace: 'todo-store',
      tokenGenerationUrl: `/api/generate-token`,
      apiBaseUrl: import.meta.env.VITE_HPKV_API_BASE_URL,
    },
  ),
);

class TodoApp {
  constructor() {
    this.filter = 'all';
    this.unsubscribe = null;
    this.init();
  }

  init() {
    this.render();
    this.attachEventListeners();

    this.unsubscribe = todoStore.subscribe(() => {
      this.updateTodoList();
      this.updateConnectionStatus();
    });
  }

  render() {
    const app = document.getElementById('app');
    app.innerHTML = `
      <div class="todo-app">
        <h1 class="page-title">Collaborative ToDo List App</h1>
        <div class="connection-status" id="connection-status">
          <div class="status-indicator disconnected"></div>
          <span id="connection-text">Disconnected</span>
        </div>
        
        <div class="todo-card">
          <div class="filters">
            <button class="filter-button filter-active" data-filter="all">All</button>
            <button class="filter-button" data-filter="active">Active</button>
            <button class="filter-button" data-filter="completed">Completed</button>
          </div>
          
          <ul class="todo-list" id="todo-list"></ul>
          
          <div class="add-task-section">
            <form class="todo-form" id="todo-form">
              <input
                type="text"
                class="todo-input"
                id="todo-input"
                placeholder="Add a new task..."
                autofocus
              />
              <button type="submit" class="todo-submit">
                <span class="plus-icon">+</span>
              </button>
            </form>
          </div>
          
          <div class="powered-badge">
            Powered by 
            <span class="highlight">
              <a href="https://zustand.docs.pmnd.rs/">Zustand</a>
            </span> 
            and
            <span class="highlight">
              <a href="https://hpkv.io">HPKV</a>
            </span> 
            multiplayer middleware
          </div>
        </div>
      </div>
    `;
  }

  attachEventListeners() {
    const form = document.getElementById('todo-form');
    form.addEventListener('submit', e => {
      e.preventDefault();
      const input = document.getElementById('todo-input');
      const text = input.value.trim();

      if (text) {
        todoStore.getState().addTodo(text);
        input.value = '';
      }
    });

    const filterButtons = document.querySelectorAll('.filter-button');
    filterButtons.forEach(button => {
      button.addEventListener('click', () => {
        this.filter = button.dataset.filter;

        filterButtons.forEach(btn => btn.classList.remove('filter-active'));
        button.classList.add('filter-active');

        this.updateTodoList();
      });
    });
  }

  updateTodoList() {
    const state = todoStore.getState();
    const todos = Object.values(state.todos);

    const filteredTodos = todos.filter(todo => {
      if (this.filter === 'all') return true;
      if (this.filter === 'active') return !todo.completed;
      if (this.filter === 'completed') return todo.completed;
      return true;
    });

    const todoList = document.getElementById('todo-list');

    if (filteredTodos.length === 0) {
      const emptyMessage =
        this.filter === 'all'
          ? 'No tasks yet. Add one above!'
          : this.filter === 'active'
            ? 'No active tasks.'
            : 'No completed tasks.';

      todoList.innerHTML = `<li class="empty-message">${emptyMessage}</li>`;
    } else {
      todoList.innerHTML = filteredTodos
        .map(
          todo => `
            <li class="todo-item ${todo.completed ? 'completed' : ''}">
              <input
                type="checkbox"
                class="todo-checkbox"
                ${todo.completed ? 'checked' : ''}
                data-id="${todo.id}"
              />
              <span class="todo-text">${todo.text}</span>
              <button class="delete-button" data-id="${todo.id}" aria-label="Delete task">
                &times;
              </button>
            </li>
          `,
        )
        .join('');

      todoList.querySelectorAll('.todo-checkbox').forEach(checkbox => {
        checkbox.addEventListener('change', () => {
          todoStore.getState().toggleTodo(checkbox.dataset.id);
        });
      });

      todoList.querySelectorAll('.delete-button').forEach(button => {
        button.addEventListener('click', () => {
          todoStore.getState().removeTodo(button.dataset.id);
        });
      });
    }
  }

  updateConnectionStatus() {
    const state = todoStore.getState();
    const connectionState = state.multiplayer?.connectionState;
    const isConnected = connectionState === 'CONNECTED';

    const indicator = document.querySelector('.status-indicator');
    const text = document.getElementById('connection-text');

    if (indicator && text) {
      indicator.className = `status-indicator ${isConnected ? 'connected' : 'disconnected'}`;
      text.textContent = connectionState || 'Disconnected';
    }
  }

  destroy() {
    if (this.unsubscribe) {
      this.unsubscribe();
    }
  }
}

new TodoApp();
