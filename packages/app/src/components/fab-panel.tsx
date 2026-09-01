import { useRef, useState, useEffect } from 'react';
import { BrandMark } from './brand';

interface FabPanelProps {
  isOpen: boolean;
  onToggle: () => void;
}

export function FabPanel({ isOpen, onToggle }: FabPanelProps) {
  const [position, setPosition] = useState({ x: 0, y: 0 });
  const [size, setSize] = useState({ width: 320, height: 400 });
  const [isDragging, setIsDragging] = useState(false);
  const [isResizing, setIsResizing] = useState(false);
  const [dragOffset, setDragOffset] = useState({ x: 0, y: 0 });
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!isOpen) return;

    // Position panel in bottom right
    const padding = 16;
    const windowHeight = window.innerHeight;
    const windowWidth = window.innerWidth;

    setPosition({
      x: windowWidth - size.width - padding,
      y: windowHeight - size.height - padding - 24, // Account for status bar
    });
  }, [isOpen, size.width, size.height]);

  const handleMouseDown = (e: React.MouseEvent<HTMLDivElement>) => {
    // Only start dragging if clicking on the header
    if ((e.target as HTMLElement).closest('.fab-panel-header')) {
      setIsDragging(true);
      setDragOffset({
        x: e.clientX - position.x,
        y: e.clientY - position.y,
      });
    }
  };

  const handleResizeMouseDown = (e: React.MouseEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsResizing(true);
  };

  useEffect(() => {
    if (!isDragging && !isResizing) return;

    const handleMouseMove = (e: MouseEvent) => {
      if (isDragging) {
        setPosition({
          x: e.clientX - dragOffset.x,
          y: e.clientY - dragOffset.y,
        });
      } else if (isResizing) {
        const newWidth = Math.max(240, e.clientX - position.x);
        const newHeight = Math.max(200, e.clientY - position.y);
        setSize({ width: newWidth, height: newHeight });
      }
    };

    const handleMouseUp = () => {
      setIsDragging(false);
      setIsResizing(false);
    };

    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);

    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };
  }, [isDragging, isResizing, dragOffset, position.x, position.y]);

  if (!isOpen) return null;

  return (
    <>
      {/* Backdrop to close panel when clicking outside */}
      <div
        className="fixed inset-0 z-40"
        onClick={onToggle}
        aria-hidden
      />

      {/* Panel */}
      <div
        ref={panelRef}
        className="fab-panel-gradient fixed z-50 flex flex-col rounded-lg bg-popover shadow-lg"
        style={{
          left: `${position.x}px`,
          top: `${position.y}px`,
          width: `${size.width}px`,
          height: `${size.height}px`,
        }}
        onMouseDown={handleMouseDown}
      >
        {/* Header */}
        <div className="fab-panel-header flex shrink-0 cursor-move items-center gap-2 border-b border-border px-3 py-2">
          <BrandMark className="h-4 w-4" />
          <h2 className="text-xs font-semibold">Quick Access</h2>
          <button
            type="button"
            onClick={onToggle}
            className="ml-auto rounded p-1 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
            aria-label="Close panel"
          >
            ×
          </button>
        </div>

        {/* Content */}
        <div className="min-h-0 flex-1 overflow-auto p-3">
          <p className="text-sm text-muted-foreground">Panel content</p>
        </div>

        {/* Resize handle */}
        <div
          onMouseDown={handleResizeMouseDown}
          className="absolute bottom-0 right-0 h-4 w-4 cursor-se-resize select-none"
          aria-label="Resize panel"
        >
          <div className="absolute bottom-0 right-0 border-b-[6px] border-l-[6px] border-l-transparent border-b-muted-foreground/40" />
        </div>
      </div>
    </>
  );
}
