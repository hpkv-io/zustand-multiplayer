import React from 'react';
import { useDrawingStore } from '../lib/store';
import { ConnectionStatus } from './ConnectionStatus';
import { DrawingCanvas } from './DrawingCanvas';
import { Toolbar } from './Toolbar';
import { UserList } from './UserList';
import { UsernameModal } from './UsernameModal';

export function DrawingApp() {
  const { currentUser } = useDrawingStore();

  return (
    <div className="min-h-screen bg-gray-100 p-4">
      <UsernameModal />

      {currentUser && (
        <>
          <div className="max-w-7xl mx-auto">
            <div className="mb-6">
              <div className="flex justify-between items-center mb-4">
                <h1 className="text-3xl font-bold text-gray-800">Collaborative Drawing Canvas</h1>
                <ConnectionStatus />
              </div>
              <p className="text-gray-600">
                Draw together in real-time! Your changes are synchronized instantly across all
                connected users.
              </p>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
              <div className="lg:col-span-3">
                <DrawingCanvas width={800} height={600} />
              </div>

              <div className="space-y-4">
                <UserList />
                <Toolbar />
              </div>
            </div>

            <div className="mt-6 text-center text-sm text-gray-500">
              <p>
                Tip: Open this page in multiple browser windows to see real-time collaboration in
                action!
              </p>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
