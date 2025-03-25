import React from 'react';
import type { CursorPosition } from '../../types';

interface RemoteCursorProps {
  cursor: CursorPosition;
  color: string;
}

export function RemoteCursor({ cursor, color }: RemoteCursorProps) {
  const style = {
    position: 'absolute',
    background: color,
    width: '2px',
    height: '18px',
    transform: 'translateY(-1px)',
    pointerEvents: 'none',
    zIndex: 1,
    transition: 'all 0.1s ease',
  } as const;

  const labelStyle = {
    position: 'absolute',
    top: '-20px',
    left: '0',
    padding: '2px 6px',
    borderRadius: '4px',
    fontSize: '12px',
    color: '#fff',
    background: color,
    whiteSpace: 'nowrap',
    pointerEvents: 'none',
  } as const;

  return (
    <div style={style}>
      <div style={labelStyle}>{cursor.userName}</div>
    </div>
  );
}