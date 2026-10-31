import { useLayoutEffect } from 'react'
import { create } from 'zustand'

interface ModalStore {
  count: number
  register(): () => void
}

/** 通用模态层登记。原生视图只依赖模态层是否存在，不依赖具体业务弹窗。 */
export const useModal = create<ModalStore>((set) => ({
  count: 0,
  register() {
    set((state) => ({ count: state.count + 1 }))
    let removed = false
    return () => {
      if (removed) return
      removed = true
      set((state) => ({ count: state.count - 1 }))
    }
  }
}))

export function useModalLayer(): void {
  useLayoutEffect(() => useModal.getState().register(), [])
}
