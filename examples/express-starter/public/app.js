// Import the store
import { useTodoStore } from './scripts/store.js';

document.addEventListener('DOMContentLoaded', () => {
    const todoInput = document.getElementById('todo-input');
    const addTodoBtn = document.getElementById('add-todo-btn');
    const todoList = document.getElementById('todo-list');
    const connectionStatusEl = document.getElementById('connection-status');

    // Destructure methods from the store directly
    const { getState, subscribe, multiplayer } = useTodoStore;
    // Actions are part of the state, get them via getState()
    // const { addTodo, toggleTodo, removeTodo } = getState(); // This would be a one-time get

    function renderTodos() {
        const { todos } = getState(); // Get current state
        todoList.innerHTML = ''; // Clear existing todos
        if (!todos || todos.length === 0) {
            const emptyItem = document.createElement('li');
            emptyItem.textContent = 'No todos yet. Add one!';
            todoList.appendChild(emptyItem);
            return;
        }
        todos.forEach(todo => {
            const listItem = document.createElement('li');
            
            const todoText = document.createElement('span');
            todoText.textContent = todo.text;
            if (todo.completed) {
                todoText.classList.add('completed');
            }
            todoText.addEventListener('click', () => {
                getState().toggleTodo(todo.id); // Call action from current state
            });

            const deleteBtn = document.createElement('button');
            deleteBtn.textContent = 'Delete';
            deleteBtn.classList.add('delete');
            deleteBtn.addEventListener('click', () => {
                getState().removeTodo(todo.id); // Call action from current state
            });

            listItem.appendChild(todoText);
            listItem.appendChild(deleteBtn);
            todoList.appendChild(listItem);
        });
    }

    addTodoBtn.addEventListener('click', () => {
        const text = todoInput.value.trim();
        if (text) {
            getState().addTodo(text); // Call action from current state
            todoInput.value = ''; // Clear input after adding
        }
    });

    todoInput.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') {
            addTodoBtn.click();
        }
    });

    // Subscribe to store changes and re-render
    // The listener receives the new state and previous state
    subscribe(renderTodos); // renderTodos will call getState() itself

    // Initial render
    renderTodos();

    // Connection Status
    function updateConnectionStatus() {
        if (!multiplayer) {
            connectionStatusEl.textContent = 'Multiplayer not initialized.';
            return;
        }
        const status = multiplayer.getConnectionStatus();
        if (!status) {
            connectionStatusEl.textContent = 'Status: Initializing...';
        } else if (status.isConnected) {
            connectionStatusEl.textContent = `Status: Connected`;
        }else {
            connectionStatusEl.textContent = 'Status: Disconnected';
        }
    }

    // Update status periodically and on visibility change
    setInterval(updateConnectionStatus, 2000);
    document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'visible') {
            updateConnectionStatus();
        }
    });
    updateConnectionStatus(); // Initial status update

    // Hydrate store from server on load
    if (multiplayer) {
        multiplayer.hydrate().then(() => {
            console.log('Store hydrated from server.');
        }).catch(err => {
            console.error('Error hydrating store:', err);
        });
    }
}); 