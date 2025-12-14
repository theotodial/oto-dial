import Sidebar from './Sidebar';

function DashboardLayout({ children }) {
  return (
    <div className="h-screen w-screen flex overflow-hidden bg-gray-100 dark:bg-slate-900">
      <Sidebar />
      <div className="flex-1 overflow-auto bg-white dark:bg-slate-800">
        {children}
      </div>
    </div>
  );
}

export default DashboardLayout;
