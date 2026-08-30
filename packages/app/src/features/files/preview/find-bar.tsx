import React, { useState } from 'react';
import { LuChevronUp, LuChevronDown, LuX, LuCaseSensitive, LuRegex } from 'react-icons/lu';

export type FindBarProps = {
  isOpen: boolean;
  onClose: () => void;
  onSearch: (query: string, opts: { matchCase: boolean; useRegex: boolean }) => void;
  onNext: () => void;
  onPrev: () => void;
  matchCount?: number;
  currentIndex?: number;
};

export const FindBar: React.FC<FindBarProps> = ({
  isOpen,
  onClose,
  onSearch,
  onNext,
  onPrev,
  matchCount = 0,
  currentIndex = 0,
}) => {
  const [query, setQuery] = useState('');
  const [matchCase, setMatchCase] = useState(false);
  const [useRegex, setUseRegex] = useState(false);

  if (!isOpen) return null;

  const handleChange = (val: string) => {
    setQuery(val);
    onSearch(val, { matchCase, useRegex });
  };

  const toggleCase = () => {
    const next = !matchCase;
    setMatchCase(next);
    onSearch(query, { matchCase: next, useRegex });
  };

  const toggleRegex = () => {
    const next = !useRegex;
    setUseRegex(next);
    onSearch(query, { matchCase, useRegex: next });
  };

  return (
    <div className="absolute top-2 right-4 z-40 flex items-center gap-2 px-3 py-1.5 bg-background/95 backdrop-blur border border-border rounded-md shadow-lg animate-in fade-in slide-in-from-top-2 duration-150 text-xs">
      <input
        type="text"
        value={query}
        onChange={(e) => handleChange(e.target.value)}
        placeholder="Find..."
        autoFocus
        className="w-36 bg-background border border-border rounded px-2 py-0.5 text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
      />

      <span className="text-muted-foreground font-mono text-[11px] min-w-[50px] text-center select-none">
        {matchCount > 0 ? `${currentIndex + 1} of ${matchCount}` : 'No results'}
      </span>

      <div className="flex items-center gap-0.5 border-l border-r border-border px-1">
        <button
          type="button"
          onClick={toggleCase}
          className={`p-1 rounded transition-colors ${
            matchCase ? 'bg-primary/20 text-primary font-bold' : 'text-muted-foreground hover:text-foreground'
          }`}
          title="Match Case"
        >
          <LuCaseSensitive className="w-3.5 h-3.5" />
        </button>
        <button
          type="button"
          onClick={toggleRegex}
          className={`p-1 rounded transition-colors ${
            useRegex ? 'bg-primary/20 text-primary font-bold' : 'text-muted-foreground hover:text-foreground'
          }`}
          title="Use Regular Expression"
        >
          <LuRegex className="w-3.5 h-3.5" />
        </button>
      </div>

      <div className="flex items-center gap-0.5">
        <button
          type="button"
          onClick={onPrev}
          disabled={matchCount === 0}
          className="p-1 text-muted-foreground hover:text-foreground disabled:opacity-30 rounded transition-colors"
          title="Previous Match"
        >
          <LuChevronUp className="w-3.5 h-3.5" />
        </button>
        <button
          type="button"
          onClick={onNext}
          disabled={matchCount === 0}
          className="p-1 text-muted-foreground hover:text-foreground disabled:opacity-30 rounded transition-colors"
          title="Next Match"
        >
          <LuChevronDown className="w-3.5 h-3.5" />
        </button>
      </div>

      <button
        type="button"
        onClick={onClose}
        className="p-1 text-muted-foreground hover:text-foreground rounded transition-colors ml-1"
        title="Close (Esc)"
      >
        <LuX className="w-3.5 h-3.5" />
      </button>
    </div>
  );
};
