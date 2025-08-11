import { useState } from 'react';
import { ChatRoom } from './components/ChatRoom';
import { ConnectionStatus } from './components/ConnectionStatus';
import { UserList } from './components/UserList';
import { UsernameModal } from './components/UsernameModal';
import { useChatStore } from './store/chatStore';
import './styles/App.css';

function App() {
  const { currentUser, setCurrentUser } = useChatStore();
  const [hasJoined, setHasJoined] = useState(false);

  const handleUsernameSubmit = (username: string) => {
    setCurrentUser(username);
    setHasJoined(true);
  };

  if (!hasJoined || !currentUser) {
    return <UsernameModal onSubmit={handleUsernameSubmit} />;
  }

  return (
    <div className="app">
      <div className="app-header">
        <h1 className="app-title">Real-time Chat</h1>
        <ConnectionStatus />
      </div>
      <div className="app-content">
        <div className="sidebar">
          <UserList />
        </div>
        <div className="main-content">
          <ChatRoom />
        </div>
      </div>
    </div>
  );
}

export default App;
