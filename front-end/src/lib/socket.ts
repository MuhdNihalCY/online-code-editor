import { io } from 'socket.io-client';
import { useStore } from '../store/useStore';

// Create a singleton Socket.IO instance
const socket = io('http://localhost:3000', {
  autoConnect: false,
  reconnection: true,
  reconnectionDelay: 1000,
  reconnectionDelayMax: 5000,
  reconnectionAttempts: 5,
});

// Socket event handlers
socket.on('connect', () => {
  useStore.getState().actions.setConnectionStatus(true);
  console.log('Connected to server');
});

socket.on('disconnect', () => {
  useStore.getState().actions.setConnectionStatus(false);
  console.log('Disconnected from server');
});

socket.on('document:change', ({ content, version }) => {
  useStore.getState().actions.updateDocument({ content, version });
});

socket.on('cursor:update', (cursor) => {
  useStore.getState().actions.updateCursorPosition(cursor);
});

socket.on('collaborator:join', (collaborator) => {
  const currentCollaborators = useStore.getState().collaborators;
  useStore.getState().actions.updateCollaborators([...currentCollaborators, collaborator]);
});

socket.on('collaborator:leave', (userId) => {
  const currentCollaborators = useStore.getState().collaborators;
  useStore.getState().actions.updateCollaborators(
    currentCollaborators.filter((c) => c.id !== userId)
  );
});

export { socket };