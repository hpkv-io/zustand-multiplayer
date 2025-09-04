import React, { useEffect, useRef } from 'react';
import { useCursorStore } from '../store';
import Cursor from './Cursor';
import './LiveCursors.css';

const LiveCursors = () => {
  const canvasRef = useRef(null);
  const { cursors, updateCursor, removeCursor, cleanupStaleCursors, userId, userName, userColor } =
    useCursorStore();

  useEffect(() => {
    let lastX = 0;
    let lastY = 0;
    let isActive = false;

    const handleMouseMove = e => {
      if (!canvasRef.current) return;

      const rect = canvasRef.current.getBoundingClientRect();
      const x = ((e.clientX - rect.left) / rect.width) * 100;
      const y = ((e.clientY - rect.top) / rect.height) * 100;

      lastX = x;
      lastY = y;
      isActive = true;
      updateCursor(x, y);
    };

    const handleMouseLeave = () => {
      isActive = false;
      removeCursor();
    };

    const handleBeforeUnload = () => {
      removeCursor();
    };

    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseleave', handleMouseLeave);
    window.addEventListener('beforeunload', handleBeforeUnload);

    // Send heartbeat to keep cursor alive
    const heartbeatInterval = setInterval(() => {
      if (isActive) {
        updateCursor(lastX, lastY);
      }
    }, 3000);

    // Cleanup stale cursors periodically
    const cleanupInterval = setInterval(cleanupStaleCursors, 5000);

    // Remove cursor on unmount
    return () => {
      removeCursor();
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseleave', handleMouseLeave);
      window.removeEventListener('beforeunload', handleBeforeUnload);
      clearInterval(heartbeatInterval);
      clearInterval(cleanupInterval);
    };
  }, [updateCursor, removeCursor, cleanupStaleCursors, userId]);

  const otherCursors = Object.entries(cursors).filter(([id]) => id !== userId);

  return (
    <div ref={canvasRef} className="live-cursors-canvas">
      {/* Render other users' cursors */}
      {otherCursors.map(([id, cursor]) => (
        <Cursor key={id} cursor={cursor} />
      ))}

      {/* Your own cursor info */}
      {cursors[userId] && (
        <div className="your-info">
          <span className="user-badge" style={{ backgroundColor: userColor }}>
            {userName} (You)
          </span>
        </div>
      )}
    </div>
  );
};

export default LiveCursors;
