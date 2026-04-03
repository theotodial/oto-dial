import { createContext, useContext } from "react";

const MobileSidebarContext = createContext(null);

export function useMobileSidebar() {
  const ctx = useContext(MobileSidebarContext);
  return (
    ctx || {
      toggleSidebar: () => {},
      closeSidebar: () => {},
      isOpen: false,
    }
  );
}

export { MobileSidebarContext };
