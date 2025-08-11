export interface Message {
  id: string;
  text: string;
  userId: string;
  username: string;
  timestamp: number;
  color: string;
}

export interface User {
  id: string;
  username: string;
  color: string;
  lastSeen: number;
}

export interface ChatRoom {
  id: string;
  name: string;
  description?: string;
}
