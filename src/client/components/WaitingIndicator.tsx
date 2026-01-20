import React from 'react';

interface WaitingIndicatorProps {
  timeout?: number;
}

export const WaitingIndicator: React.FC<WaitingIndicatorProps> = ({ timeout }) => {
  return (
    <div className="flex items-center gap-3 px-4 py-3 w-fit">
      <div className="flex items-center gap-1">
        <span className="w-2 h-2 bg-zinc-400 dark:bg-zinc-600 rounded-full animate-bounce [animation-delay:-0.3s]" />
        <span className="w-2 h-2 bg-zinc-400 dark:bg-zinc-600 rounded-full animate-bounce [animation-delay:-0.15s]" />
        <span className="w-2 h-2 bg-zinc-400 dark:bg-zinc-600 rounded-full animate-bounce" />
      </div>
      <span className="text-sm text-zinc-500 dark:text-zinc-400 italic">
        Listening for voice input...
      </span>
      {timeout && (
        <span className="text-xs text-zinc-400 dark:text-zinc-500">
          ({timeout}s)
        </span>
      )}
    </div>
  );
};
