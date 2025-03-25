export interface User {
  id: string;
  name: string;
  email: string;
  avatar?: string;
  role: 'owner' | 'editor' | 'viewer';
}

export interface Document {
  id: string;
  name: string;
  content: string;
  language: string;
  lastEdited: Date;
  collaborators: User[];
  version: number;
}

export interface CursorPosition {
  userId: string;
  userName: string;
  position: number;
  documentId: string;
  selection?: {
    startLineNumber: number;
    startColumn: number;
    endLineNumber: number;
    endColumn: number;
  };
}

export interface DocumentVersion {
  id: string;
  documentId: string;
  content: string;
  description: string;
  createdAt: string;
  author: User;
  version: number;
}