import React from 'react';
import { useDrawingStore } from '../lib/store';

export function Toolbar() {
  const { currentColor, currentThickness, setColor, setThickness, clearCanvas, currentUser } =
    useDrawingStore();

  const colors = [
    '#000000',
    '#FF6B6B',
    '#4ECDC4',
    '#45B7D1',
    '#96CEB4',
    '#FECA57',
    '#FF9FF3',
    '#54A0FF',
    '#5F27CD',
    '#00d2d3',
    '#ff9f43',
    '#ee5a24',
    '#0097e6',
    '#8c7ae6',
    '#2f3640',
    '#40407a',
  ];

  const thicknesses = [1, 3, 5, 8, 12];

  if (!currentUser) return null;

  return (
    <div className="bg-white p-4 rounded-lg shadow-lg border border-gray-200">
      <div className="flex flex-col space-y-4">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">Colors</label>
          <div className="flex flex-wrap gap-2">
            {colors.map(color => (
              <button
                key={color}
                onClick={() => setColor(color)}
                className={`w-8 h-8 rounded-full border-2 transition-all duration-200 ${
                  currentColor === color
                    ? 'border-gray-800 scale-110'
                    : 'border-gray-300 hover:border-gray-500'
                }`}
                style={{ backgroundColor: color }}
                title={`Select ${color}`}
              />
            ))}
          </div>
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Brush Size: {currentThickness}px
          </label>
          <div className="flex gap-2">
            {thicknesses.map(thickness => (
              <button
                key={thickness}
                onClick={() => setThickness(thickness)}
                className={`w-12 h-12 rounded-lg border-2 flex items-center justify-center transition-all duration-200 ${
                  currentThickness === thickness
                    ? 'border-blue-500 bg-blue-50'
                    : 'border-gray-300 hover:border-gray-500 bg-white'
                }`}
                title={`${thickness}px brush`}
              >
                <div
                  className="rounded-full bg-gray-800"
                  style={{
                    width: `${Math.min(thickness * 2, 20)}px`,
                    height: `${Math.min(thickness * 2, 20)}px`,
                  }}
                />
              </button>
            ))}
          </div>
        </div>

        <div className="pt-2 border-t border-gray-200">
          <button
            onClick={clearCanvas}
            className="w-full px-4 py-2 bg-red-500 text-white rounded-lg hover:bg-red-600 transition-colors duration-200 font-medium"
          >
            Clear Canvas
          </button>
        </div>
      </div>
    </div>
  );
}
