import React from 'react';

interface WaitingIndicatorProps {
  timeout?: number;
}

export const WaitingIndicator: React.FC<WaitingIndicatorProps> = ({ timeout }) => {
  return (
    <div className="flex justify-start">
      <div className="flex items-center gap-3 px-4 py-3 bg-white dark:bg-stone-800 rounded-2xl rounded-bl-md border border-stone-200 dark:border-stone-700">
        <div className="flex items-center gap-1">
          <span className="w-1.5 h-1.5 bg-stone-400 dark:bg-stone-500 rounded-full animate-bounce [animation-delay:-0.3s]" />
          <span className="w-1.5 h-1.5 bg-stone-400 dark:bg-stone-500 rounded-full animate-bounce [animation-delay:-0.15s]" />
          <span className="w-1.5 h-1.5 bg-stone-400 dark:bg-stone-500 rounded-full animate-bounce" />
        </div>
        {timeout && (
          <span className="text-xs text-stone-400 dark:text-stone-500 tabular-nums">
            {timeout}s
          </span>
        )}
      </div>
    </div>
  );
};
