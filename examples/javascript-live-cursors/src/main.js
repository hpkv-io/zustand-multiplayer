import { multiplayer } from '@hpkv/zustand-multiplayer';
import { createStore } from 'zustand/vanilla';

// Generate a unique session ID for each browser tab/window
const generateSessionId = () => {
  return Math.random().toString(36).substring(2) + Date.now().toString(36);
};

const generateUserColor = () => {
  const colors = [
    '#FF6B6B',
    '#4ECDC4',
    '#45B7D1',
    '#96CEB4',
    '#FFEAA7',
    '#DDA0DD',
    '#98D8C8',
    '#FD79A8',
    '#A29BFE',
    '#FDCB6E',
    '#6C5CE7',
    '#00B894',
  ];
  return colors[Math.floor(Math.random() * colors.length)];
};

// Each tab/window gets its own unique session
const userId = generateSessionId();
const userColor = generateUserColor();
const userName = `User ${userId.substring(0, 4)}`;

const cursorStore = createStore(
  multiplayer(
    (set, get) => ({
      cursors: {},

      updateCursor: (x, y) => {
        set(state => ({
          cursors: {
            ...state.cursors,
            [userId]: {
              id: userId,
              name: userName,
              color: userColor,
              x,
              y,
              lastUpdate: Date.now(),
            },
          },
        }));
      },

      removeCursor: () => {
        set(state => {
          const newCursors = { ...state.cursors };
          delete newCursors[userId];
          return { cursors: newCursors };
        });
      },

      // Clean up stale cursors (users who left)
      cleanupStaleCursors: () => {
        const now = Date.now();
        set(state => {
          const newCursors = {};
          Object.entries(state.cursors).forEach(([id, cursor]) => {
            if (now - cursor.lastUpdate < 10000) {
              // Keep cursors active in last 10 seconds
              newCursors[id] = cursor;
            }
          });
          return { cursors: newCursors };
        });
      },

      // Local state
      userId,
      userName,
      userColor,
    }),
    {
      namespace: 'live-cursors-demo',
      apiBaseUrl: import.meta.env.VITE_HPKV_API_BASE_URL,
      tokenGenerationUrl: '/api/generate-token',
      sync: ['cursors'], // Only sync cursor data
      zFactor: 1, // Optimize for cursor updates
    },
  ),
);

class LiveCursorsApp {
  constructor() {
    this.unsubscribe = null;
    this.canvasElement = null;
    this.heartbeatInterval = null;
    this.cleanupInterval = null;
    this.lastX = 0;
    this.lastY = 0;
    this.isActive = false;
    this.cursorElements = new Map(); // Track cursor DOM elements
    this.init();
  }

  init() {
    this.render();
    this.attachEventListeners();

    this.unsubscribe = cursorStore.subscribe(() => {
      this.updateCursors();
      this.updateActiveUsers();
      this.updateConnectionStatus();
    });

    // Setup intervals for heartbeat and cleanup
    this.heartbeatInterval = setInterval(() => {
      if (this.isActive) {
        cursorStore.getState().updateCursor(this.lastX, this.lastY);
      }
    }, 3000);

    this.cleanupInterval = setInterval(() => {
      cursorStore.getState().cleanupStaleCursors();
    }, 5000);

    // Remove cursor on page unload
    window.addEventListener('beforeunload', () => {
      cursorStore.getState().removeCursor();
    });
  }

  render() {
    const app = document.getElementById('app');
    app.innerHTML = `
      <div class="app">
        <div class="header">
          <h1>Live Cursors Demo</h1>
          <p class="subtitle">Move your mouse to see real-time cursor synchronization</p>
        </div>

        <div class="canvas-container">
          <div class="live-cursors-canvas" id="cursors-canvas">
            <!-- Cursors will be rendered here -->
            <div class="your-info" id="your-info" style="display: none;">
              <span class="user-badge" id="your-badge">
                ${userName} (You)
              </span>
            </div>
          </div>
          
          <div class="active-users" id="active-users">
            <div class="users-grid" id="users-grid">
              <!-- Users will be rendered here -->
            </div>
            <span class="users-count" id="users-count">0 active</span>
          </div>
        </div>

        <div class="status-bar" id="status-bar">
          <div class="connection-status" id="connection-status">
            <div class="status-indicator disconnected"></div>
            <span id="connection-text">Disconnected</span>
          </div>
        </div>

        <div class="instructions">
          <h3>Instructions:</h3>
          <ul>
            <li>Move your mouse to see your cursor tracked in real-time</li>
            <li>Open multiple browser tabs to see live synchronization</li>
          </ul>
        </div>
      </div>
    `;

    this.canvasElement = document.getElementById('cursors-canvas');
    this.setupMouseTracking();
  }

  setupMouseTracking() {
    const handleMouseMove = e => {
      if (!this.canvasElement) return;

      const rect = this.canvasElement.getBoundingClientRect();
      const x = ((e.clientX - rect.left) / rect.width) * 100;
      const y = ((e.clientY - rect.top) / rect.height) * 100;

      this.lastX = x;
      this.lastY = y;
      this.isActive = true;
      cursorStore.getState().updateCursor(x, y);
    };

    const handleMouseLeave = () => {
      this.isActive = false;
      cursorStore.getState().removeCursor();
    };

    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseleave', handleMouseLeave);

    // Store references for cleanup
    this.handleMouseMove = handleMouseMove;
    this.handleMouseLeave = handleMouseLeave;
  }

  attachEventListeners() {
    // Event listeners are set up in setupMouseTracking and init
  }

  updateCursors() {
    const state = cursorStore.getState();
    const cursorsContainer = document.getElementById('cursors-canvas');
    const yourInfo = document.getElementById('your-info');
    const yourBadge = document.getElementById('your-badge');

    if (!cursorsContainer) return;

    // Show/hide your info
    if (state.cursors[userId]) {
      if (yourInfo) {
        yourInfo.style.display = 'block';
        if (yourBadge) {
          yourBadge.style.backgroundColor = userColor;
        }
      }
    } else {
      if (yourInfo) {
        yourInfo.style.display = 'none';
      }
    }

    // Get current cursor IDs (excluding own cursor)
    const currentCursorIds = new Set(Object.keys(state.cursors).filter(id => id !== userId));

    // Remove cursors that are no longer present
    for (const [id, element] of this.cursorElements) {
      if (!currentCursorIds.has(id)) {
        element.remove();
        this.cursorElements.delete(id);
      }
    }

    // Update existing cursors and create new ones
    Object.entries(state.cursors).forEach(([id, cursor]) => {
      if (id !== userId) {
        this.updateOrCreateCursorElement(cursor, cursorsContainer);
      }
    });
  }

  updateOrCreateCursorElement(cursor, container) {
    let cursorElement = this.cursorElements.get(cursor.id);

    if (!cursorElement) {
      // Create new cursor element
      cursorElement = document.createElement('div');
      cursorElement.className = 'cursor-container';
      cursorElement.innerHTML = `
        <svg class="cursor-icon" fill="${cursor.color}" height="24" viewBox="0 0 24 24" width="24" xmlns="http://www.w3.org/2000/svg">
          <path d="M3 3L10.07 19.97L12.58 12.58L19.97 10.07L3 3Z" />
        </svg>
        <span class="cursor-label" style="background-color: ${cursor.color}">
          ${cursor.name}
        </span>
      `;
      container.appendChild(cursorElement);
      this.cursorElements.set(cursor.id, cursorElement);
    }

    // Update position
    cursorElement.style.left = `${cursor.x}%`;
    cursorElement.style.top = `${cursor.y}%`;
  }

  updateActiveUsers() {
    const state = cursorStore.getState();
    const usersGrid = document.getElementById('users-grid');
    const usersCount = document.getElementById('users-count');

    if (!usersGrid || !usersCount) return;

    const activeCursorsCount = Object.keys(state.cursors).length;
    usersCount.textContent = `${activeCursorsCount} active`;

    usersGrid.innerHTML = '';

    Object.values(state.cursors).forEach(cursor => {
      const userIndicator = document.createElement('div');
      userIndicator.className = `user-indicator ${cursor.id === userId ? 'current-user' : ''}`;
      userIndicator.style.backgroundColor = cursor.color;
      userIndicator.title = cursor.name;

      const initials = document.createElement('span');
      initials.textContent = cursor.name.substring(0, 2).toUpperCase();
      userIndicator.appendChild(initials);

      usersGrid.appendChild(userIndicator);
    });
  }

  updateConnectionStatus() {
    const state = cursorStore.getState();
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

    if (this.heartbeatInterval) {
      clearInterval(this.heartbeatInterval);
    }

    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
    }

    if (this.handleMouseMove) {
      window.removeEventListener('mousemove', this.handleMouseMove);
    }

    if (this.handleMouseLeave) {
      window.removeEventListener('mouseleave', this.handleMouseLeave);
    }

    // Clean up cursor elements
    for (const element of this.cursorElements.values()) {
      element.remove();
    }
    this.cursorElements.clear();

    cursorStore.getState().removeCursor();
  }
}

new LiveCursorsApp();
