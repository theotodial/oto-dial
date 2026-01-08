import Sidebar from './Sidebar';

function DashboardLayout({ children }) {
  return (
    <div className="h-screen w-screen flex overflow-hidden bg-gray-50 dark:bg-slate-900">
      <Sidebar />
      <div className="flex-1 overflow-auto bg-gray-50 dark:bg-slate-800 lg:ml-0 pt-14 lg:pt-0">
        {children}
      </div>
    </div>
  );
}

export default DashboardLayout;
