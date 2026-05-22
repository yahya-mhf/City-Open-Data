import Link from "next/link";

export default function NotFound() {
  return (
    <div className="min-h-screen bg-gray-50 dark:bg-night-primary flex flex-col items-center justify-center px-4">
      <div className="text-center max-w-md">
        <h1 className="text-6xl font-bold text-primary-700 dark:text-brand-500 mb-4">404</h1>
        <h2 className="text-xl font-semibold text-gray-800 dark:text-gray-100 mb-2">Page Not Found</h2>
        <p className="text-gray-500 dark:text-gray-300 mb-8">
          The page you are looking for does not exist or has been moved.
        </p>
        <div className="flex gap-4 justify-center">
          <Link
            href="/"
            className="px-5 py-2.5 bg-primary-600 text-white rounded-lg text-sm font-medium hover:bg-primary-700 transition"
          >
            Go Home
          </Link>
          <Link
            href="/maps"
            className="px-5 py-2.5 border border-gray-300 dark:border-night-border text-gray-700 dark:text-gray-200 rounded-lg text-sm font-medium hover:bg-gray-50 dark:hover:bg-night-border transition"
          >
            Thematic Maps
          </Link>
        </div>
      </div>
    </div>
  );
}
