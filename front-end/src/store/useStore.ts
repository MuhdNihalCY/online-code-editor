import { create } from 'zustand';
import { immer } from 'zustand/middleware/immer';
import type { User, Document, CursorPosition } from '../types';

interface EditorState {
  currentUser: User | null;
  currentDocument: Document | null;
  collaborators: User[];
  cursorPositions: CursorPosition[];
  isConnected: boolean;
  theme: 'light' | 'dark';
  actions: {
    setCurrentUser: (user: User | null) => void;
    setCurrentDocument: (document: Document | null) => void;
    updateDocument: (update: Partial<Document>) => void;
    updateCollaborators: (collaborators: User[]) => void;
    updateCursorPosition: (cursor: CursorPosition) => void;
    setConnectionStatus: (status: boolean) => void;
    toggleTheme: () => void;
  };
}

export const useStore = create<EditorState>()(
  immer((set) => ({
    currentUser: null,
    currentDocument: null,
    collaborators: [],
    cursorPositions: [],
    isConnected: false,
    theme: 'light',
    actions: {
      setCurrentUser: (user) =>
        set((state) => {
          state.currentUser = user;
        }),
      setCurrentDocument: (document) =>
        set((state) => {
          state.currentDocument = document;
        }),
      updateDocument: (update) =>
        set((state) => {
          if (state.currentDocument) {
            Object.assign(state.currentDocument, update);
          }
        }),
      updateCollaborators: (collaborators) =>
        set((state) => {
          state.collaborators = collaborators;
        }),
      updateCursorPosition: (cursor) =>
        set((state) => {
          const index = state.cursorPositions.findIndex(
            (pos) => pos.userId === cursor.userId
          );
          if (index !== -1) {
            state.cursorPositions[index] = cursor;
          } else {
            state.cursorPositions.push(cursor);
          }
        }),
      setConnectionStatus: (status) =>
        set((state) => {
          state.isConnected = status;
        }),
      toggleTheme: () =>
        set((state) => {
          state.theme = state.theme === 'light' ? 'dark' : 'light';
        }),
    },
  }))
);