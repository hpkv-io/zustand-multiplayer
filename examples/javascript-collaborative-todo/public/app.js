// Global state
let currentFilter = 'all';

// DOM elements
const todoList = document.getElementById('todo-list');
const todoForm = document.getElementById('todo-form');
const todoInput = document.getElementById('todo-input');
const filterButtons = document.querySelectorAll('.filter-button');
const connectionStatus = document.getElementById('connection-status');
const connectionText = document.getElementById('connection-text');
const statusIndicator = connectionStatus.querySelector('.status-indicator');

// Subscribe to store changes
todoStore.subscribe(state => {
  renderTodos(state.todos);
  updateConnectionStatus(state.multiplayer);
});

// Initial render
const initialState = todoStore.getState();
renderTodos(initialState.todos);
updateConnectionStatus(initialState.multiplayer);

// Event listeners
todoForm.addEventListener('submit', handleAddTodo);
filterButtons.forEach(button => {
  button.addEventListener('click', handleFilterChange);
});

// Functions
function handleAddTodo(e) {
  e.preventDefault();
  const text = todoInput.value.trim();
  if (text) {
    const state = todoStore.getState();
    state.addTodo(text);
    todoInput.value = '';
  }
}

function handleFilterChange(e) {
  const filter = e.target.dataset.filter;
  currentFilter = filter;

  // Update active filter button
  filterButtons.forEach(btn => btn.classList.remove('filter-active'));
  e.target.classList.add('filter-active');

  // Re-render todos with new filter
  const state = todoStore.getState();
  renderTodos(state.todos);
}

function handleToggleTodo(id) {
  const state = todoStore.getState();
  state.toggleTodo(id);
}

function handleRemoveTodo(id) {
  const state = todoStore.getState();
  state.removeTodo(id);
}

function renderTodos(todos) {
  // Filter todos based on current filter
  const filteredTodos = todos.filter(todo => {
    if (currentFilter === 'all') return true;
    if (currentFilter === 'active') return !todo.completed;
    if (currentFilter === 'completed') return todo.completed;
    return true;
  });

  // Clear the list
  todoList.innerHTML = '';

  if (filteredTodos.length === 0) {
    const emptyMessage = document.createElement('li');
    emptyMessage.className = 'empty-message';
    emptyMessage.textContent = getEmptyMessage();
    todoList.appendChild(emptyMessage);
    return;
  }

  // Render each todo
  filteredTodos.forEach(todo => {
    const todoItem = document.createElement('li');
    todoItem.className = `todo-item ${todo.completed ? 'completed' : ''}`;

    todoItem.innerHTML = `
      <input
        type="checkbox"
        ${todo.completed ? 'checked' : ''}
        class="todo-checkbox"
        data-id="${todo.id}"
      />
      <span class="todo-text">${escapeHtml(todo.text)}</span>
      <button
        class="delete-button"
        data-id="${todo.id}"
        aria-label="Delete task"
      >
        &times;
      </button>
    `;

    // Add event listeners
    const checkbox = todoItem.querySelector('.todo-checkbox');
    const deleteButton = todoItem.querySelector('.delete-button');

    checkbox.addEventListener('change', () => handleToggleTodo(todo.id));
    deleteButton.addEventListener('click', () => handleRemoveTodo(todo.id));

    todoList.appendChild(todoItem);
  });
}

function updateConnectionStatus(multiplayer) {
  if (!multiplayer) return;

  const isConnected = multiplayer.connectionState === 'CONNECTED';

  connectionText.textContent = multiplayer.connectionState;
  statusIndicator.className = `status-indicator ${isConnected ? 'connected' : 'disconnected'}`;
}

function getEmptyMessage() {
  switch (currentFilter) {
    case 'active':
      return 'No active tasks.';
    case 'completed':
      return 'No completed tasks.';
    default:
      return 'No tasks yet. Add one below!';
  }
}

function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}
