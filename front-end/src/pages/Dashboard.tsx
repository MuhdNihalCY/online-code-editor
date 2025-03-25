import React, { useState } from 'react';
import { Plus, Search, Code2 } from 'lucide-react';
import { DocumentCard } from '../components/dashboard/DocumentCard';
import { useStore } from '../store/useStore';

export function Dashboard() {
  const [searchQuery, setSearchQuery] = useState('');
  const { currentUser } = useStore();

  // TODO: Replace with actual data from API
  const documents = [
    {
      id: '1',
      name: 'Main Project',
      content: '',
      language: 'TypeScript',
      lastEdited: new Date(),
      collaborators: [
        {
          id: '1',
          name: 'John Doe',
          email: 'john@example.com',
          role: 'owner',
        },
      ],
      version: 1,
    },
  ];

  const filteredDocuments = documents.filter((doc) =>
    doc.name.toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b border-border">
        <div className="container mx-auto px-4 py-6">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-3">
              <Code2 className="h-8 w-8 text-primary" />
              <h1 className="text-2xl font-bold text-foreground">CodeCollab</h1>
            </div>
            <div className="flex items-center space-x-4">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <input
                  type="text"
                  placeholder="Search documents..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-10 pr-4 py-2 w-64 bg-background border border-input rounded-md focus:ring-2 focus:ring-primary focus:border-transparent"
                />
              </div>
              <button className="flex items-center space-x-2 px-4 py-2 bg-primary text-primary-foreground rounded-md hover:bg-primary/90 transition-colors">
                <Plus className="h-4 w-4" />
                <span>New Document</span>
              </button>
            </div>
          </div>
        </div>
      </header>

      <main className="container mx-auto px-4 py-8">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {filteredDocuments.map((document) => (
            <DocumentCard key={document.id} document={document} />
          ))}
        </div>

        {filteredDocuments.length === 0 && (
          <div className="text-center py-12">
            <h3 className="text-lg font-medium text-foreground">No documents found</h3>
            <p className="text-muted-foreground">
              {searchQuery
                ? 'Try adjusting your search query'
                : 'Create a new document to get started'}
            </p>
          </div>
        )}
      </main>
    </div>
  );
}