"use client";

interface PageErrorProps {
  message: string;
  retry?: () => void;
}

interface PageLoaderProps {
  message?: string;
}

interface EmptyStateProps {
  message: string;
  icon?: string;
}

export function PageError({ message, retry }: PageErrorProps) {
  return (
    <div className="flex min-h-[16rem] items-center justify-center rounded-xl border border-red-200 bg-red-50 p-8 text-center dark:border-red-800 dark:bg-red-900/20">
      <div>
        <p className="text-base font-semibold text-red-700 dark:text-red-300">Unable to load data</p>
        <p className="mt-2 text-sm text-red-600 dark:text-red-400">{message}</p>
        {retry && (
          <button
            onClick={retry}
            className="mt-4 rounded-lg bg-red-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-red-700"
          >
            Retry
          </button>
        )}
      </div>
    </div>
  );
}

export function PageLoader({ message = "Loading..." }: PageLoaderProps) {
  return (
    <div className="flex min-h-[16rem] items-center justify-center text-center text-gray-500 dark:text-gray-400">
      <div>
        <div className="mx-auto mb-4 h-8 w-8 animate-spin rounded-full border-2 border-primary-200 border-t-primary-600" />
        <p className="text-sm">{message}</p>
      </div>
    </div>
  );
}

export function EmptyState({ message, icon = "No data" }: EmptyStateProps) {
  return (
    <div className="flex min-h-[12rem] items-center justify-center rounded-xl border border-gray-200 bg-white p-8 text-center dark:border-night-border dark:bg-night-secondary">
      <div>
        <p className="text-sm font-semibold text-gray-700 dark:text-gray-200">{icon}</p>
        <p className="mt-2 text-sm text-gray-500 dark:text-gray-400">{message}</p>
      </div>
    </div>
  );
}
