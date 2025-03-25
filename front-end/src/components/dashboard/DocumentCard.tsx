import React from 'react';
import { useNavigate } from 'react-router-dom';
import { FileCode, Users, Clock } from 'lucide-react';
import type { Document } from '../../types';
import { cn } from '../../lib/utils';

interface DocumentCardProps {
  document: Document;
}

export function DocumentCard({ document }: DocumentCardProps) {
  const navigate = useNavigate();
  const lastEditedDate = new Date(document.lastEdited).toLocaleDateString();

  return (
    <div
      onClick={() => navigate(`/editor/${document.id}`)}
      className="group p-4 bg-card rounded-lg border border-border hover:border-primary/50 cursor-pointer transition-all"
    >
      <div className="flex items-start justify-between">
        <div className="flex items-center space-x-3">
          <div className="p-2 rounded-md bg-primary/10 text-primary">
            <FileCode className="h-5 w-5" />
          </div>
          <div>
            <h3 className="font-medium text-card-foreground group-hover:text-primary transition-colors">
              {document.name}
            </h3>
            <p className="text-sm text-muted-foreground">{document.language}</p>
          </div>
        </div>
      </div>

      <div className="mt-4 flex items-center justify-between text-sm text-muted-foreground">
        <div className="flex items-center space-x-2">
          <Users className="h-4 w-4" />
          <span>{document.collaborators.length} collaborators</span>
        </div>
        <div className="flex items-center space-x-2">
          <Clock className="h-4 w-4" />
          <span>Last edited {lastEditedDate}</span>
        </div>
      </div>
    </div>
  );
}