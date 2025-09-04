import { multiplayer } from '@hpkv/zustand-multiplayer';
import { createStore } from 'zustand/vanilla';

const chatStore = createStore(
  multiplayer(
    set => ({
      messages: {},
      currentUser: null,

      sendMessage: text =>
        set(state => {
          if (!state.currentUser) return state;

          const id = `${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
          const message = {
            id,
            text,
            userId: state.currentUser.id,
            username: state.currentUser.username,
            timestamp: Date.now(),
          };

          return {
            ...state,
            messages: {
              ...state.messages,
              [id]: message,
            },
          };
        }),

      setCurrentUser: username =>
        set(state => ({
          ...state,
          currentUser: {
            id: `user-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`,
            username,
          },
        })),
    }),
    {
      namespace: 'chat-room',
      tokenGenerationUrl: '/api/generate-token',
      apiBaseUrl: import.meta.env.VITE_HPKV_API_BASE_URL,
      sync: ['messages'],
    },
  ),
);

class ChatApp {
  constructor() {
    this.unsubscribe = null;
    this.showUsernameModal = true;
    this.init();
  }

  init() {
    this.render();
    this.attachEventListeners();

    this.unsubscribe = chatStore.subscribe(() => {
      this.updateMessages();
      this.updateConnectionStatus();
      this.updateUserInfo();
    });
  }

  render() {
    const app = document.getElementById('app');
    app.innerHTML = `
      <div class="chat-app">
        <h1 class="page-title">Real-time Chat</h1>
        
        <div class="connection-status" id="connection-status">
          <div class="status-indicator disconnected"></div>
          <span id="connection-text">Disconnected</span>
        </div>
        
        <div class="chat-container">
          <div class="user-info" id="user-info" style="display: none;">
            Chatting as: <span class="username" id="current-username"></span>
          </div>
          
          <div class="message-list" id="message-list">
            <div class="empty-message">No messages yet. Start the conversation!</div>
          </div>
          
          <div class="message-input-container">
            <form class="message-form" id="message-form">
              <input
                type="text"
                class="message-input"
                id="message-input"
                placeholder="Type your message..."
                disabled
              />
              <button type="submit" class="send-button" disabled>
                <span class="send-icon">→</span>
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
      
      <div class="modal-overlay" id="username-modal" style="display: flex;">
        <div class="modal">
          <h2>Enter Your Username</h2>
          <p>Choose a username to start chatting:</p>
          <form class="username-form" id="username-form">
            <input
              type="text"
              class="username-input"
              id="username-input"
              placeholder="Your username"
              autofocus
            />
            <button type="submit" class="join-button">Join Chat</button>
          </form>
        </div>
      </div>
    `;
  }

  attachEventListeners() {
    // Username form
    const usernameForm = document.getElementById('username-form');
    usernameForm.addEventListener('submit', e => {
      e.preventDefault();
      const input = document.getElementById('username-input');
      const username = input.value.trim();

      if (username) {
        chatStore.getState().setCurrentUser(username);
        this.showUsernameModal = false;
        document.getElementById('username-modal').style.display = 'none';

        // Enable message input
        const messageInput = document.getElementById('message-input');
        const sendButton = document.querySelector('.send-button');
        messageInput.disabled = false;
        sendButton.disabled = false;
        messageInput.focus();
      }
    });

    // Message form
    const messageForm = document.getElementById('message-form');
    messageForm.addEventListener('submit', e => {
      e.preventDefault();
      const input = document.getElementById('message-input');
      const text = input.value.trim();

      if (text && chatStore.getState().currentUser) {
        chatStore.getState().sendMessage(text);
        input.value = '';
      }
    });

    // Auto-scroll to bottom when new messages arrive
    this.setupAutoScroll();
  }

  setupAutoScroll() {
    const messageList = document.getElementById('message-list');

    // Create a MutationObserver to watch for new messages
    const observer = new MutationObserver(() => {
      messageList.scrollTop = messageList.scrollHeight;
    });

    observer.observe(messageList, { childList: true, subtree: true });
  }

  updateMessages() {
    const state = chatStore.getState();
    const messages = Object.values(state.messages).sort((a, b) => a.timestamp - b.timestamp);

    const messageList = document.getElementById('message-list');

    if (messages.length === 0) {
      messageList.innerHTML =
        '<div class="empty-message">No messages yet. Start the conversation!</div>';
    } else {
      messageList.innerHTML = messages
        .map(message => {
          const isOwnMessage = state.currentUser && message.userId === state.currentUser.id;
          const timeString = new Date(message.timestamp).toLocaleTimeString([], {
            hour: '2-digit',
            minute: '2-digit',
          });

          return `
            <div class="message ${isOwnMessage ? 'own-message' : 'other-message'}">
              <div class="message-header">
                <span class="message-username">${message.username}</span>
                <span class="message-time">${timeString}</span>
              </div>
              <div class="message-text">${this.escapeHtml(message.text)}</div>
            </div>
          `;
        })
        .join('');
    }
  }

  updateConnectionStatus() {
    const state = chatStore.getState();
    const connectionState = state.multiplayer?.connectionState;
    const isConnected = connectionState === 'CONNECTED';

    const indicator = document.querySelector('.status-indicator');
    const text = document.getElementById('connection-text');

    if (indicator && text) {
      indicator.className = `status-indicator ${isConnected ? 'connected' : 'disconnected'}`;
      text.textContent = connectionState || 'Disconnected';
    }
  }

  updateUserInfo() {
    const state = chatStore.getState();
    const userInfo = document.getElementById('user-info');
    const username = document.getElementById('current-username');

    if (state.currentUser && userInfo && username) {
      userInfo.style.display = 'block';
      username.textContent = state.currentUser.username;
    }
  }

  escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }

  destroy() {
    if (this.unsubscribe) {
      this.unsubscribe();
    }
  }
}

new ChatApp();
