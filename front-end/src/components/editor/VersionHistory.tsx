import React from 'react';
import { formatDistanceToNow } from 'date-fns';
import { History, RotateCcw } from 'lucide-react';
import { useStore } from '../../store/useStore';
import { socket } from '../../lib/socket';
import type { DocumentVersion } from '../../types';

export function VersionHistory() {
  const { currentDocument, currentUser } = useStore();
  const [versions, setVersions] = React.useState<DocumentVersion[]>([]);
  const [selectedVersion, setSelectedVersion] = React.useState<DocumentVersion | null>(null);

  React.useEffect(() => {
    if (!currentDocument?.id) return;

    // Fetch version history
    socket.emit('document:getVersions', { documentId: currentDocument.id }, (versions: DocumentVersion[]) => {
      setVersions(versions);
    });

    socket.on('document:versionAdded', (version: DocumentVersion) => {
      setVersions(prev => [version, ...prev]);
    });

    return () => {
      socket.off('document:versionAdded');
    };
  }, [currentDocument?.id]);

  const handleRestoreVersion = (version: DocumentVersion) => {
    if (!currentDocument?.id || !currentUser) return;

    socket.emit('document:restore', {
      documentId: currentDocument.id,
      versionId: version.id,
      userId: currentUser.id,
    });
  };

  return (
    <div className="h-full flex flex-col">
      <div className="p-4 border-b border-border">
        <div className="flex items-center space-x-2 text-card-foreground">
          <History className="h-5 w-5" />
          <h2 className="font-medium">Version History</h2>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto">
        {versions.map((version) => (
          <div
            key={version.id}
            className={`p-4 border-b border-border hover:bg-muted/50 cursor-pointer transition-colors ${
              selectedVersion?.id === version.id ? 'bg-muted' : ''
            }`}
            onClick={() => setSelectedVersion(version)}
          >
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm font-medium text-card-foreground">
                {version.author.name}
              </span>
              <span className="text-xs text-muted-foreground">
                {formatDistanceToNow(new Date(version.createdAt), { addSuffix: true })}
              </span>
            </div>
            <p className="text-xs text-muted-foreground line-clamp-2">{version.description}</p>
            {selectedVersion?.id === version.id && (
              <div className="mt-2 flex items-center space-x-2">
                <button
                  onClick={() => handleRestoreVersion(version)}
                  className="flex items-center space-x-1 px-2 py-1 text-xs rounded-md bg-primary text-primary-foreground hover:bg-primary/90 transition-colors"
                >
                  <RotateCcw className="h-3 w-3" />
                  <span>Restore</span>
                </button>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}