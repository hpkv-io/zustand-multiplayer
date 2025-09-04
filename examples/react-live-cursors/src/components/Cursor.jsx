import React from 'react';
import './Cursor.css';

const Cursor = ({ cursor }) => {
  return (
    <div
      className="cursor-container"
      style={{
        left: `${cursor.x}%`,
        top: `${cursor.y}%`,
      }}
    >
      <svg
        className="cursor-icon"
        fill={cursor.color}
        height="24"
        viewBox="0 0 24 24"
        width="24"
        xmlns="http://www.w3.org/2000/svg"
      >
        <path d="M3 3L10.07 19.97L12.58 12.58L19.97 10.07L3 3Z" />
      </svg>
      <span className="cursor-label" style={{ backgroundColor: cursor.color }}>
        {cursor.name}
      </span>
    </div>
  );
};

export default Cursor;
