import React from 'react';
import ActiveUsers from './components/ActiveUsers';
import LiveCursors from './components/LiveCursors';
import StatusBar from './components/StatusBar';
import { useCursorStore } from './store';
import './App.css';

const App = () => {
  const { multiplayer } = useCursorStore();

  return (
    <div className="app">
      <div className="header">
        <h1>Live Cursors Demo</h1>
        <p className="subtitle">Move your mouse to see real-time cursor synchronization</p>
      </div>

      <div className="canvas-container">
        <LiveCursors />
        <ActiveUsers />
      </div>

      <StatusBar connectionState={multiplayer.connectionState} />

      <div className="instructions">
        <h3>Instructions:</h3>
        <ul>
          <li>Move your mouse to see your cursor tracked in real-time</li>
          <li>Open multiple browser tabs to see live synchronization</li>
        </ul>
      </div>
    </div>
  );
};

export default App;
