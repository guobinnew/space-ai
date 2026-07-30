/**
 * Memory types
 */

export type MemoryEntry = {
  id: string
  title: string
  content: string
  category: string
  createdAt: string
  updatedAt: string
}

export type MemoryStats = {
  totalEntries: number
  totalSize: number
  categories: string[]
}
