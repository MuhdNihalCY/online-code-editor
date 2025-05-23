import React, { useEffect, useRef } from 'react';
import Editor, { useMonaco } from '@monaco-editor/react';
import { useStore } from '../../store/useStore';
import { useParams } from 'react-router-dom';
import { socket } from '../../lib/socket';
import { RemoteCursor } from './RemoteCursor';
import type { editor } from 'monaco-editor';

// Debounce utility function
function debounce<F extends (...args: any[]) => any>(func: F, waitFor: number) {
  let timeoutId: ReturnType<typeof setTimeout> | null = null;

  return (...args: Parameters<F>): Promise<ReturnType<F>> => {
    return new Promise((resolve) => {
      if (timeoutId) {
        clearTimeout(timeoutId);
      }

      timeoutId = setTimeout(() => {
        timeoutId = null;
        resolve(func(...args));
      }, waitFor);
    });
  };
}

const CURSOR_COLORS = [
  '#FF0000', '#00FF00', '#0000FF', '#FFFF00',
  '#FF00FF', '#00FFFF', '#FFA500', '#800080'
];

export function CodeEditor() {
  const { currentDocument, currentUser, cursorPositions } = useStore();
  const monaco = useMonaco();
  const editorRef = useRef<editor.IStandaloneCodeEditor | null>(null);
  const { id } = useParams();
  const decorationsRef = useRef<string[]>([]);

  const debouncedEmitChangeRef = useRef(
    debounce((value: string, docId: string, user: typeof currentUser, docVersion: number) => {
      if (!user || !docId) return; // Safety check
      socket.emit('text-change', { // Emitting 'text-change' as per instruction for debounced call
        content: value,
        docId: docId, // Using docId
        userId: user.id,
        version: docVersion,
      });
    }, 750) // 750ms debounce delay
  );

  useEffect(() => {
    if (!id || !currentUser) return;

    socket.connect();
    socket.emit('join-document', { docId: id, userId: currentUser.id });

    const handleIncomingTextChange = (data: { content: string; userId: string; version: number }) => {
      if (data.userId !== currentUser?.id) {
        editorRef.current?.setValue(data.content);
        useStore.getState().actions.updateDocument({ content: data.content, version: data.version });
      }
    };

    const handleIncomingCursorUpdate = (cursorData: { userId: string; userName: string; position: number; docId: string }) => {
      // Assuming docId check might be relevant if a user is in multiple docs, though current setup is one doc at a time.
      // For now, directly update as the component is tied to a single 'id' (docId) from useParams.
      useStore.getState().actions.updateCursorPosition(cursorData);
    };

    socket.on('text-change', handleIncomingTextChange);
    socket.on('cursor-update', handleIncomingCursorUpdate);

    return () => {
      socket.emit('document:leave', { docId: id, userId: currentUser.id });
      socket.off('text-change', handleIncomingTextChange);
      socket.off('cursor-update', handleIncomingCursorUpdate);
      socket.disconnect();
    };
  }, [id, currentUser, editorRef, monaco]); // Added editorRef and monaco to dependencies for safety, though setValue and actions should be stable.

  useEffect(() => {
    if (!monaco || !editorRef.current) return;

    // Update remote cursors
    const editor = editorRef.current;
    const decorations = cursorPositions
      .filter(cursor => cursor.userId !== currentUser?.id)
      .map((cursor, index) => {
        const position = editor.getModel()?.getPositionAt(cursor.position);
        if (!position) return null;

        const color = CURSOR_COLORS[index % CURSOR_COLORS.length];
        return {
          range: {
            startLineNumber: position.lineNumber,
            startColumn: position.column,
            endLineNumber: position.lineNumber,
            endColumn: position.column + 1,
          },
          options: {
            className: 'remote-cursor',
            beforeContentClassName: 'remote-cursor-before',
            after: {
              content: cursor.userName,
              backgroundColor: color,
              color: '#ffffff',
              margin: '0 0 0 4px',
              padding: '0 4px',
              borderRadius: '2px',
              fontSize: '12px',
            },
          },
        };
      })
      .filter((decoration): decoration is NonNullable<typeof decoration> => decoration !== null);

    decorationsRef.current = editor.deltaDecorations(decorationsRef.current, decorations);
  }, [monaco, cursorPositions, currentUser]);

  useEffect(() => {
    if (monaco) {
      monaco.editor.defineTheme('custom-dark', {
        base: 'vs-dark',
        inherit: true,
        rules: [],
        colors: {
          'editor.background': '#1a1b26',
          'editor.foreground': '#a9b1d6',
          'editor.lineHighlightBackground': '#1f202e',
          'editor.selectionBackground': '#515c7e',
          'editorCursor.foreground': '#c0caf5',
        },
      });
    }
  }, [monaco]);

  const handleEditorDidMount = (editor: editor.IStandaloneCodeEditor) => {
    editorRef.current = editor;

    editor.onDidChangeCursorPosition((e) => {
      if (!currentUser) return;

      const position = editor.getModel()?.getOffsetAt(e.position) ?? 0;
      socket.emit('cursor-move', { // Changed event name
        userId: currentUser.id,
        userName: currentUser.name,
        position,
        docId: id, // Changed payload field
      });
    });
  };

  const handleEditorChange = (value: string | undefined) => {
    if (value === undefined || !currentUser || !id) return; // Keep undefined check

    // Call the debounced function from the ref
    debouncedEmitChangeRef.current(value, id, currentUser, currentDocument?.version ?? 1);

    // Optional: Update local state immediately if needed for UI feedback (e.g., unsaved changes indicator)
    // useStore.getState().actions.updateDocument({ content: value /*, unsavedChanges: true */ });
  };

  return (
    <div className="h-full w-full relative">
      <Editor
        height="100%"
        defaultLanguage={currentDocument?.language?.toLowerCase() || 'javascript'}
        defaultValue={currentDocument?.content || '// Start coding here'}
        theme={useStore.getState().theme === 'dark' ? 'custom-dark' : 'light'}
        options={{
          fontSize: 14,
          lineHeight: 1.5,
          minimap: { enabled: true },
          scrollBeyondLastLine: false,
          automaticLayout: true,
          wordWrap: 'on',
          renderLineHighlight: 'all',
          cursorBlinking: 'smooth',
          cursorSmoothCaretAnimation: true,
          smoothScrolling: true,
          formatOnPaste: true,
          formatOnType: true,
        }}
        onMount={handleEditorDidMount}
        onChange={handleEditorChange}
      />
    </div>
  );
}