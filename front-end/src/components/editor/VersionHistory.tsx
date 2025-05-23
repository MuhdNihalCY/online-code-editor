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
  const [currentPage, setCurrentPage] = React.useState<number>(1);
  const [totalPages, setTotalPages] = React.useState<number>(0);
  const [versionsLimit] = React.useState<number>(20); // Items per page

  React.useEffect(() => {
    if (!currentDocument?.id) {
      setVersions([]); // Clear versions if no document
      setTotalPages(0);
      setCurrentPage(1);
      return;
    }
    
    // Reset to page 1 if document ID changes but it's not the initial load for this effect with currentPage=1
    // This logic is simplified by ensuring currentPage is part of dep array and initial fetch is page 1.
    // If currentDocument.id changes, effect re-runs, currentPage is already 1 or reset below if needed.
    // A more explicit reset could be: if (prevDocId !== currentDocument.id) setCurrentPage(1);

    socket.emit(
      'document:getVersions',
      { documentId: currentDocument.id, page: currentPage, limit: versionsLimit },
      (response: { versions: DocumentVersion[]; totalVersions: number; currentPage: number; totalPages: number; error?: string }) => {
        if (response.error) {
          console.error('Error fetching versions:', response.error);
          setVersions([]);
          setTotalPages(0);
          return;
        }
        setVersions(response.versions);
        setTotalPages(response.totalPages); // Use totalPages from backend
      }
    );

    // Listener for new versions (e.g., after a restore)
    // This might need adjustment with pagination, e.g., refetch current page or go to page 1
    const handleNewVersionAdded = (newVersion: DocumentVersion) => {
      // For simplicity, refetching current page to reflect new version list.
      // Or, if the new version is always on top, prepend and adjust logic.
      // For now, let's assume a refetch or intelligent update is needed.
      // A simple way: go to page 1 to see the latest.
      setCurrentPage(1); 
      // Or, more complex: fetch current page again.
      // For this example, we'll just add it if on page 1, otherwise user can navigate
      if (currentPage === 1) {
        setVersions(prev => [newVersion, ...prev.slice(0, versionsLimit -1)]);
      }
      // To be robust, it should ideally refetch current page or handle totalPages update.
    };

    socket.on('document:versionAdded', handleNewVersionAdded); // Assuming this event is emitted by backend

    return () => {
      socket.off('document:versionAdded', handleNewVersionAdded);
    };
  }, [currentDocument?.id, currentPage, versionsLimit]);

  // Effect to reset page to 1 when document changes
  React.useEffect(() => {
    setCurrentPage(1);
    setTotalPages(0); // Reset total pages as well
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
        {versions.length === 0 && <p className="p-4 text-sm text-muted-foreground">No versions found.</p>}
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

      {totalPages > 0 && (
        <div className="p-4 border-t border-border flex items-center justify-between">
          <button
            onClick={() => setCurrentPage(prev => Math.max(1, prev - 1))}
            disabled={currentPage === 1}
            className="px-3 py-1 text-sm rounded-md border border-border hover:bg-muted disabled:opacity-50 disabled:cursor-not-allowed"
          >
            Previous
          </button>
          <span className="text-sm text-muted-foreground">
            Page {currentPage} of {totalPages}
          </span>
          <button
            onClick={() => setCurrentPage(prev => Math.min(totalPages, prev + 1))}
            disabled={currentPage === totalPages || totalPages === 0}
            className="px-3 py-1 text-sm rounded-md border border-border hover:bg-muted disabled:opacity-50 disabled:cursor-not-allowed"
          >
            Next
          </button>
        </div>
      )}
    </div>
  );
}