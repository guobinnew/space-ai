/**
 * PendingRef Store — 编辑器→聊天输入框的文件/代码引用传递
 *
 * 照搬 smart-code chatStore 中 setPendingCodeRef/setPendingFileRef/setPendingDirRef 的概念，
 * 独立为 zustand store，解耦编辑器与聊天 store。
 */

import { create } from 'zustand'

export type PendingCodeRef = {
  filePath: string
  fileName: string
  startLine: number
  endLine: number
}

export type PendingFileRef = {
  fileName: string
  filePath: string
}

export type PendingDirRef = {
  dirName: string
  dirPath: string
}

type PendingRefState = {
  pendingCodeRef: PendingCodeRef | null
  pendingFileRef: PendingFileRef | null
  pendingDirRef: PendingDirRef | null
  setPendingCodeRef: (ref: PendingCodeRef) => void
  setPendingFileRef: (ref: PendingFileRef) => void
  setPendingDirRef: (ref: PendingDirRef) => void
  clearPendingCodeRef: () => void
  clearPendingFileRef: () => void
  clearPendingDirRef: () => void
}

export const usePendingRefStore = create<PendingRefState>((set) => ({
  pendingCodeRef: null,
  pendingFileRef: null,
  pendingDirRef: null,
  setPendingCodeRef: (ref) => set({ pendingCodeRef: ref }),
  setPendingFileRef: (ref) => set({ pendingFileRef: ref }),
  setPendingDirRef: (ref) => set({ pendingDirRef: ref }),
  clearPendingCodeRef: () => set({ pendingCodeRef: null }),
  clearPendingFileRef: () => set({ pendingFileRef: null }),
  clearPendingDirRef: () => set({ pendingDirRef: null }),
}))
