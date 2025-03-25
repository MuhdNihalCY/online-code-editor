import React, { useEffect, useRef } from 'react';
import Editor, { useMonaco } from '@monaco-editor/react';
import { useStore } from '../../store/useStore';
import { useParams } from 'react-router-dom';
import { socket } from '../../lib/socket';
import { RemoteCursor } from './RemoteCursor';
import type { editor } from 'monaco-editor';

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

  useEffect(() => {
    if (!id || !currentUser) return;

    socket.connect();
    socket.emit('document:join', { documentId: id, userId: currentUser.id });

    return () => {
      socket.emit('document:leave', { documentId: id, userId: currentUser.id });
      socket.disconnect();
    };
  }, [id, currentUser]);

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
      socket.emit('cursor:update', {
        userId: currentUser.id,
        userName: currentUser.name,
        position,
        documentId: id,
      });
    });
  };

  const handleEditorChange = (value: string | undefined) => {
    if (!value || !currentUser || !id) return;

    socket.emit('document:change', {
      content: value,
      documentId: id,
      userId: currentUser.id,
      version: currentDocument?.version ?? 1,
    });
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