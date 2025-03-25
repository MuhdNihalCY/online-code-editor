import React from 'react';
import { Users, GitBranch, Settings } from 'lucide-react';
import { CodeEditor } from './CodeEditor';
import { VersionHistory } from './VersionHistory';
import { useStore } from '../../store/useStore';

export function EditorLayout() {
  const { currentDocument, collaborators } = useStore();

  return (
    <div className="h-screen flex flex-col">
      {/* Header */}
      <header className="h-14 border-b border-border bg-card flex items-center justify-between px-4">
        <div className="flex items-center space-x-4">
          <h1 className="text-lg font-semibold text-card-foreground">
            {currentDocument?.name || 'Untitled'}
          </h1>
          <div className="flex items-center space-x-2 text-sm text-muted-foreground">
            <GitBranch className="h-4 w-4" />
            <span>main</span>
          </div>
        </div>
        <div className="flex items-center space-x-4">
          <div className="flex -space-x-2">
            {collaborators.map((user) => (
              <div
                key={user.id}
                className="h-8 w-8 rounded-full border-2 border-background bg-primary flex items-center justify-center text-primary-foreground font-medium"
                title={user.name}
              >
                {user.avatar ? (
                  <img
                    src={user.avatar}
                    alt={user.name}
                    className="h-full w-full rounded-full object-cover"
                  />
                ) : (
                  user.name.charAt(0)
                )}
              </div>
            ))}
            <button className="h-8 w-8 rounded-full border-2 border-background bg-muted flex items-center justify-center hover:bg-muted/80 transition-colors">
              <Users className="h-4 w-4 text-muted-foreground" />
            </button>
          </div>
          <button className="p-2 rounded-md hover:bg-muted/80 transition-colors">
            <Settings className="h-5 w-5 text-muted-foreground" />
          </button>
        </div>
      </header>

      {/* Main content */}
      <div className="flex-1 flex">
        {/* Editor */}
        <main className="flex-1 h-full">
          <CodeEditor />
        </main>

        {/* Right sidebar */}
        <aside className="w-64 border-l border-border bg-card hidden lg:block">
          <VersionHistory />
        </aside>
      </div>
    </div>
  );
}