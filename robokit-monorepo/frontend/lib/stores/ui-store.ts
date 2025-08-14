import { create } from 'zustand';
import { devtools } from 'zustand/middleware';

interface UIState {
  sidebarOpen: boolean;
  currentView: 'dashboard' | 'upload' | 'datasets' | 'visualization';
  uploadProgress: Record<string, number>;
  selectedDataset: string | null;
  toggleSidebar: () => void;
  setSidebarOpen: (open: boolean) => void;
  setCurrentView: (view: UIState['currentView']) => void;
  updateUploadProgress: (fileId: string, progress: number) => void;
  setSelectedDataset: (datasetId: string | null) => void;
}

const useUIStoreBase = create<UIState>()(
  devtools(
    (set) => ({
      sidebarOpen: false,
      currentView: 'dashboard',
      uploadProgress: {},
      selectedDataset: null,
      toggleSidebar: () => 
        set((state) => ({ sidebarOpen: !state.sidebarOpen })),
      setSidebarOpen: (open) => set({ sidebarOpen: open }),
      setCurrentView: (view) => 
        set({ currentView: view }),
      updateUploadProgress: (fileId, progress) =>
        set((state) => ({
          uploadProgress: { ...state.uploadProgress, [fileId]: progress }
        })),
      setSelectedDataset: (datasetId) =>
        set({ selectedDataset: datasetId }),
    }),
    { name: 'ui-store' }
  )
);

export const useUIStore = useUIStoreBase;