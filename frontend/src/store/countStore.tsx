import { create } from "zustand";


export const useCountStore = create<CountStoreType>((set) => ({
    count: 0,
    setCount: (count: number) => set({ count }),
}))