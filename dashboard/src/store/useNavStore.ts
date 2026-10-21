import { create } from 'zustand';

// Dar ekranda (lg altı) kenar çubuğu çekmece olarak açılır; Topbar'daki menü düğmesi ile Sidebar bu durumu paylaşır.
interface NavState {
  open: boolean;
  setOpen: (open: boolean) => void;
}

export const useNavStore = create<NavState>((set) => ({
  open: false,
  setOpen: (open) => set({ open }),
}));
