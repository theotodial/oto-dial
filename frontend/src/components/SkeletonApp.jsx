function SkeletonApp() {
  return (
    <div className="min-h-screen bg-gray-50 dark:bg-slate-900">
      <div className="h-16 border-b border-gray-200 dark:border-slate-800 bg-white dark:bg-slate-950" />
      <div className="flex">
        <div className="hidden lg:block w-72 border-r border-gray-200 dark:border-slate-800 bg-white dark:bg-slate-950 min-h-[calc(100vh-4rem)]" />
        <div className="flex-1 p-6 space-y-6">
          <div className="h-8 w-56 rounded-lg bg-gray-200 dark:bg-slate-800 animate-pulse" />
          <div className="grid gap-4 md:grid-cols-3">
            <div className="h-28 rounded-2xl bg-gray-200 dark:bg-slate-800 animate-pulse" />
            <div className="h-28 rounded-2xl bg-gray-200 dark:bg-slate-800 animate-pulse" />
            <div className="h-28 rounded-2xl bg-gray-200 dark:bg-slate-800 animate-pulse" />
          </div>
          <div className="h-80 rounded-2xl bg-gray-200 dark:bg-slate-800 animate-pulse" />
        </div>
      </div>
    </div>
  );
}

export default SkeletonApp;
