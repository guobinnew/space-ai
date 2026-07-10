import { useState, useEffect, useCallback, useRef, useLayoutEffect } from 'react'
import { createPortal } from 'react-dom'
import { filesystemApi, type DirEntry } from '../../api/filesystem'
import { useEditorStore } from '../../stores/editorStore'
import { usePendingRefStore } from '../../stores/pendingRefStore'
import type { GitFileStatus } from '../../api/git'
import { useTranslation } from '../../i18n'
import { Modal } from '../shared/Modal'
import { Tooltip } from '../shared/Tooltip'

type ExplorerMode = 'tree' | 'search'

type TreeNode = DirEntry & {
  children?: TreeNode[]
  expanded?: boolean
  loaded?: boolean
}

type ContextMenuState = {
  x: number
  y: number
  node: DirEntry
} | null

const FILE_WATCH_INTERVAL_MS = 5000

export function FileExplorer({ width, root: rootProp }: { width?: number; root?: string | null } = {}) {
  const storeRoot = useEditorStore((s) => s.explorerRoot)
  const root = rootProp !== undefined ? rootProp : storeRoot
  const openFile = useEditorStore((s) => s.openFile)
  const closeFile = useEditorStore((s) => s.closeFile)
  const activeFilePath = useEditorStore((s) => s.activeFilePath)
  const gitBranch = useEditorStore((s) => s.gitBranch)
  const gitStatusMap = useEditorStore((s) => s.gitStatusMap)
  const [tree, setTree] = useState<TreeNode[]>([])
  const [isReloading, setIsReloading] = useState(false)
  const [contextMenu, setContextMenu] = useState<ContextMenuState>(null)
  const contextMenuRef = useRef<HTMLDivElement>(null)
  const [deleteConfirm, setDeleteConfirm] = useState<DirEntry | null>(null)
  const t = useTranslation()
  const setPendingFileRef = usePendingRefStore((s) => s.setPendingFileRef)
  const setPendingDirRef = usePendingRefStore((s) => s.setPendingDirRef)
  const treeRef = useRef(tree)
  treeRef.current = tree

  const TOOLBAR_COMPACT_THRESHOLD = 250
  const isCompact = width !== undefined && width < TOOLBAR_COMPACT_THRESHOLD
  const [overflowOpen, setOverflowOpen] = useState(false)
  const overflowBtnRef = useRef<HTMLButtonElement>(null)
  const overflowMenuRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!isCompact) setOverflowOpen(false)
  }, [isCompact])

  useEffect(() => {
    if (!overflowOpen) return
    const handleClick = (e: MouseEvent) => {
      if (
        overflowMenuRef.current && !overflowMenuRef.current.contains(e.target as Node) &&
        overflowBtnRef.current && !overflowBtnRef.current.contains(e.target as Node)
      ) {
        setOverflowOpen(false)
      }
    }
    const handleEsc = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOverflowOpen(false)
    }
    document.addEventListener('mousedown', handleClick)
    document.addEventListener('keydown', handleEsc)
    return () => {
      document.removeEventListener('mousedown', handleClick)
      document.removeEventListener('keydown', handleEsc)
    }
  }, [overflowOpen])

  const [mode, setMode] = useState<ExplorerMode>('tree')
  const [searchQuery, setSearchQuery] = useState('')
  const [searchResults, setSearchResults] = useState<DirEntry[]>([])
  const [isSearching, setIsSearching] = useState(false)
  const searchTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const searchInputRef = useRef<HTMLInputElement>(null)

  const [caseSensitive, setCaseSensitive] = useState(false)
  const [wholeWord, setWholeWord] = useState(false)
  const [useRegex, setUseRegex] = useState(false)

  const [newItemType, setNewItemType] = useState<'file' | 'folder' | null>(null)
  const [newItemName, setNewItemName] = useState('')
  const newItemInputRef = useRef<HTMLInputElement>(null)

  const [renameTarget, setRenameTarget] = useState<DirEntry | null>(null)
  const [renameName, setRenameName] = useState('')
  const renameInputRef = useRef<HTMLInputElement>(null)

  const [draggedNode, setDraggedNode] = useState<DirEntry | null>(null)
  const draggedNodeRef = useRef<DirEntry | null>(null)
  const [dropTargetPath, setDropTargetPath] = useState<string | null>(null)

  const loadDirectory = useCallback(async (dirPath: string): Promise<TreeNode[]> => {
    try {
      const result = await filesystemApi.browse(dirPath, { includeFiles: true })
      return result.entries.map((e) => ({
        ...e,
        expanded: false,
        loaded: false,
        children: e.isDirectory ? [] : undefined,
      }))
    } catch {
      return []
    }
  }, [])

  useEffect(() => {
    if (!root) {
      setTree([])
      return
    }
    void loadDirectory(root).then(setTree)
  }, [root, loadDirectory])

  const pendingRevealPath = useEditorStore((s) => s.pendingRevealPath)
  const clearPendingReveal = useEditorStore((s) => s.clearPendingReveal)

  useEffect(() => {
    if (!pendingRevealPath || !root) return

    const normalizedRoot = root.replace(/\\/g, '/')
    const normalizedPath = pendingRevealPath.replace(/\\/g, '/')

    if (!normalizedPath.startsWith(normalizedRoot + '/')) {
      clearPendingReveal()
      return
    }

    const relativePath = normalizedPath.slice(normalizedRoot.length + 1)
    const segments = relativePath.split('/')
    segments.pop()

    if (segments.length === 0) {
      clearPendingReveal()
      return
    }

    const expandChain = async (currentTree: TreeNode[], pathSegments: string[], parentPath: string): Promise<TreeNode[]> => {
      if (pathSegments.length === 0) return currentTree

      const [currentSegment, ...restSegments] = pathSegments
      const currentPath = parentPath ? `${parentPath}/${currentSegment}` : `${normalizedRoot}/${currentSegment}`

      return Promise.all(currentTree.map(async (node) => {
        if (node.name !== currentSegment || !node.isDirectory) return node

        let children = node.children
        if (!node.loaded) {
          children = await loadDirectory(node.path)
        }

        const expandedChildren = children ? await expandChain(children, restSegments, currentPath) : []

        return {
          ...node,
          expanded: true,
          loaded: true,
          children: expandedChildren,
        }
      }))
    }

    void expandChain(tree, segments, '').then((newTree) => {
      setTree(newTree)
      clearPendingReveal()
    })
  }, [pendingRevealPath, root, tree, loadDirectory, clearPendingReveal])

  useEffect(() => {
    if (!root) return

    const timer = setInterval(() => {
      const currentTree = treeRef.current

      void (async () => {
        let rootChanged = false
        let mergedTree: TreeNode[] = currentTree ?? []

        try {
          const result = await filesystemApi.browse(root, { includeFiles: true })
          const freshNames = result.entries.map(e => e.name)
          const currentNames = mergedTree.map(c => c.name)

          const rootAdded = freshNames.filter(n => !currentNames.includes(n))
          const rootRemoved = currentNames.filter(n => !freshNames.includes(n))

          if (rootAdded.length > 0 || rootRemoved.length > 0) {
            rootChanged = true
            const newTree: TreeNode[] = []
            for (const entry of result.entries) {
              const existing = mergedTree.find(c => c.name === entry.name)
              if (existing) {
                newTree.push(existing)
              } else {
                newTree.push({
                  ...entry,
                  expanded: false,
                  loaded: false,
                  children: entry.isDirectory ? [] : undefined,
                })
              }
            }
            mergedTree = newTree
          }
        } catch {
          // ignore browse errors
        }

        if (mergedTree.length === 0) {
          if (rootChanged) setTree(mergedTree)
          return
        }

        const expandedDirs: string[] = []
        const collectExpandedDirs = (nodes: TreeNode[]) => {
          for (const node of nodes) {
            if (node.isDirectory && node.expanded) {
              expandedDirs.push(node.path)
              if (node.children) collectExpandedDirs(node.children)
            }
          }
        }
        collectExpandedDirs(mergedTree)
        if (!rootChanged && expandedDirs.length === 0) return

        let changed = rootChanged
        const checkAndMerge = async (nodes: TreeNode[]): Promise<TreeNode[]> => {
          return Promise.all(nodes.map(async (node) => {
            if (!node.isDirectory || !node.expanded) return node

            const processedChildren = node.children ? await checkAndMerge(node.children) : undefined

            try {
              const result = await filesystemApi.browse(node.path, { includeFiles: true })
              const freshNames = result.entries.map(e => e.name)
              const currentNames = (node.children ?? []).map(c => c.name)

              const added = freshNames.filter(n => !currentNames.includes(n))
              const removed = currentNames.filter(n => !freshNames.includes(n))

              if (added.length > 0 || removed.length > 0) {
                changed = true
                const newChildren: TreeNode[] = []

                for (const entry of result.entries) {
                  const existing = (processedChildren ?? node.children ?? []).find(c => c.name === entry.name)
                  if (existing) {
                    newChildren.push(existing)
                  } else {
                    newChildren.push({
                      ...entry,
                      expanded: false,
                      loaded: false,
                      children: entry.isDirectory ? [] : undefined,
                    })
                  }
                }

                return { ...node, children: newChildren }
              }

              return processedChildren ? { ...node, children: processedChildren } : node
            } catch {
              return processedChildren ? { ...node, children: processedChildren } : node
            }
          }))
        }

        const newTree = await checkAndMerge(mergedTree)
        if (changed) {
          setTree(newTree)
        }
      })()
    }, FILE_WATCH_INTERVAL_MS)

    return () => clearInterval(timer)
  }, [root])

  useEffect(() => {
    if (mode !== 'search') return
    if (!searchQuery.trim()) {
      setSearchResults([])
      return
    }

    setIsSearching(true)
    if (searchTimerRef.current) clearTimeout(searchTimerRef.current)
    searchTimerRef.current = setTimeout(async () => {
      try {
        const result = await filesystemApi.search(searchQuery.trim(), root ?? undefined)
        let files = result.entries.filter((e) => !e.isDirectory)

        if (useRegex) {
          try {
            const re = new RegExp(searchQuery, caseSensitive ? '' : 'i')
            files = files.filter((f) => re.test(f.name))
          } catch {
            // invalid regex
          }
        }

        if (wholeWord && !useRegex) {
          const word = caseSensitive ? searchQuery.trim() : searchQuery.trim().toLowerCase()
          files = files.filter((f) => {
            const name = caseSensitive ? f.name : f.name.toLowerCase()
            return name === word
          })
        }

        if (caseSensitive && !useRegex && !wholeWord) {
          files = files.filter((f) => f.name.includes(searchQuery))
        }

        setSearchResults(files)
      } catch {
        setSearchResults([])
      } finally {
        setIsSearching(false)
      }
    }, 300)
    return () => { if (searchTimerRef.current) clearTimeout(searchTimerRef.current) }
  }, [searchQuery, mode, root, caseSensitive, wholeWord, useRegex])

  useEffect(() => {
    if (mode === 'search') {
      searchInputRef.current?.focus()
    }
  }, [mode])

  useEffect(() => {
    if (!contextMenu) return
    const handleClickOutside = (e: MouseEvent) => {
      if (contextMenuRef.current && !contextMenuRef.current.contains(e.target as Node)) {
        setContextMenu(null)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [contextMenu])

  const [menuPos, setMenuPos] = useState<{ left: number; top: number }>({ left: 0, top: 0 })
  useLayoutEffect(() => {
    if (!contextMenu || !contextMenuRef.current) return
    const el = contextMenuRef.current
    const rect = el.getBoundingClientRect()
    const margin = 8
    let left = contextMenu.x
    let top = contextMenu.y
    if (left + rect.width > window.innerWidth - margin) {
      left = Math.max(margin, window.innerWidth - rect.width - margin)
    }
    if (top + rect.height > window.innerHeight - margin) {
      top = Math.max(margin, contextMenu.y - rect.height)
      if (top + rect.height > window.innerHeight - margin) {
        top = Math.max(margin, window.innerHeight - rect.height - margin)
      }
    }
    setMenuPos({ left, top })
  }, [contextMenu])

  const handleCopyPath = useCallback(async (filePath: string) => {
    try {
      await navigator.clipboard.writeText(filePath)
    } catch {
      const textarea = document.createElement('textarea')
      textarea.value = filePath
      textarea.style.position = 'fixed'
      textarea.style.opacity = '0'
      document.body.appendChild(textarea)
      textarea.select()
      document.execCommand('copy')
      document.body.removeChild(textarea)
    }
    setContextMenu(null)
  }, [])

  const handleOpenExternal = useCallback(async (filePath: string) => {
    try {
      const { openPath } = await import('@tauri-apps/plugin-opener')
      await openPath(filePath)
    } catch (e) {
      console.warn('[FileExplorer] openExternal failed:', e)
    }
    setContextMenu(null)
  }, [])

  const handleAddToConversation = useCallback((node: DirEntry) => {
    setPendingFileRef({ fileName: node.name, filePath: node.path })
    setContextMenu(null)
  }, [setPendingFileRef])

  const handleAddDirToConversation = useCallback((node: DirEntry) => {
    setPendingDirRef({ dirName: node.name, dirPath: node.path })
    setContextMenu(null)
  }, [setPendingDirRef])

  const handleRefresh = useCallback(async () => {
    if (!root || isReloading) return
    setIsReloading(true)
    try {
      const expandedPaths = new Set<string>()
      const collectExpanded = (nodes: TreeNode[]) => {
        for (const node of nodes) {
          if (node.isDirectory && node.expanded) {
            expandedPaths.add(node.path)
            if (node.children) {
              collectExpanded(node.children)
            }
          }
        }
      }
      collectExpanded(tree)

      const fresh = await loadDirectory(root)

      const restoreExpanded = async (nodes: TreeNode[]): Promise<TreeNode[]> => {
        return Promise.all(nodes.map(async (node) => {
          if (node.isDirectory && expandedPaths.has(node.path)) {
            const children = await loadDirectory(node.path)
            const restoredChildren = await restoreExpanded(children)
            return { ...node, expanded: true, loaded: true, children: restoredChildren }
          }
          return node
        }))
      }

      const restored = await restoreExpanded(fresh)
      setTree(restored)
    } finally {
      setIsReloading(false)
    }
  }, [root, isReloading, loadDirectory, tree])

  const handleDelete = useCallback(async (node: DirEntry) => {
    const norm = (p: string) => p.replace(/\\/g, '/').toLowerCase()
    const normTarget = norm(node.path)

    useEditorStore.setState((s) => {
      const remaining = s.openFiles.filter((f) => {
        const normF = norm(f.path)
        const match = normF === normTarget
        const dirMatch = node.isDirectory && normF.startsWith(normTarget + '/')
        if (match || dirMatch) {
          return false
        }
        return true
      })
      if (remaining.length === s.openFiles.length) {
        return s
      }
      let newActive = s.activeFilePath
      if (newActive) {
        const normActive = norm(newActive)
        const activeRemoved =
          normActive === normTarget ||
          (node.isDirectory && normActive.startsWith(normTarget + '/'))
        if (activeRemoved) {
          newActive = remaining.length > 0 ? remaining[remaining.length - 1]!.path : null
        }
      }
      return { openFiles: remaining, activeFilePath: newActive }
    })

    try {
      await filesystemApi.deletePath(node.path)
      await handleRefresh()
    } catch (err) {
      console.error('Failed to delete:', err)
    }
    setDeleteConfirm(null)
  }, [handleRefresh])

  const handleRename = useCallback(async () => {
    const newName = renameName.trim()
    if (!newName || !renameTarget) return
    if (newName === renameTarget.name) {
      setRenameTarget(null)
      setRenameName('')
      return
    }
    const parentDir = renameTarget.path.replace(/[/\\][^/\\]+$/, '')
    const destPath = parentDir + '/' + newName
    try {
      await filesystemApi.movePath(renameTarget.path, destPath)
      const editorState = useEditorStore.getState()
      if (!renameTarget.isDirectory) {
        if (editorState.activeFilePath === renameTarget.path) {
          closeFile(renameTarget.path)
          await openFile(destPath, { preview: true })
        }
      } else {
        for (const f of editorState.openFiles) {
          if (f.path.startsWith(renameTarget.path + '/') || f.path.startsWith(renameTarget.path + '\\')) {
            closeFile(f.path)
            const newFilePath = destPath + f.path.slice(renameTarget.path.length)
            await openFile(newFilePath, { preview: true })
          }
        }
      }
      await handleRefresh()
    } catch (err) {
      console.error('Failed to rename:', err)
    }
    setRenameTarget(null)
    setRenameName('')
  }, [renameTarget, renameName, closeFile, openFile, handleRefresh])

  const toggleExpand = useCallback(async (node: TreeNode, parentPath: string[]) => {
    if (!node.isDirectory) return

    const nodePath = [...parentPath, node.name]

    const loadChildren = async (nodes: TreeNode[], path: string[]): Promise<TreeNode[]> => {
      if (path.length === 0) return nodes
      const [head, ...rest] = path
      return Promise.all(nodes.map(async (n) => {
        if (n.name !== head) return n
        if (rest.length === 0) {
          if (!n.loaded && n.isDirectory) {
            const children = await loadDirectory(n.path)
            return { ...n, expanded: true, loaded: true, children }
          }
          return { ...n, expanded: !n.expanded }
        }
        if (n.isDirectory) {
          const children = await loadChildren(n.children ?? [], rest)
          return { ...n, children }
        }
        return n
      }))
    }

    const newTree = await loadChildren(tree, nodePath)
    setTree(newTree)
  }, [tree, loadDirectory])

  const collapseAll = useCallback(() => {
    const collapse = (nodes: TreeNode[]): TreeNode[] =>
      nodes.map((n) => ({
        ...n,
        expanded: false,
        children: n.children ? collapse(n.children) : n.children,
      }))
    setTree(collapse(tree))
  }, [tree])

  const handleCreateItem = useCallback(async () => {
    const name = newItemName.trim()
    if (!name || !root) return
    const fullPath = root + (root.endsWith('/') || root.endsWith('\\') ? '' : '/') + name
    try {
      if (newItemType === 'file') {
        await filesystemApi.writeFile(fullPath, '')
      } else if (newItemType === 'folder') {
        await filesystemApi.createDir(fullPath)
      }
      await handleRefresh()
    } catch (err) {
      console.error('Failed to create:', err)
    }
    setNewItemType(null)
    setNewItemName('')
  }, [newItemType, newItemName, root, handleRefresh])

  const handleDragStart = useCallback((node: DirEntry) => {
    draggedNodeRef.current = node
    setDraggedNode(node)
  }, [])

  const handleDragOver = useCallback((e: React.DragEvent, targetPath: string) => {
    e.preventDefault()
    e.dataTransfer.dropEffect = 'move'
    setDropTargetPath(targetPath)
  }, [])

  const handleDragLeave = useCallback(() => {
    setDropTargetPath(null)
  }, [])

  const handleDrop = useCallback(async (e: React.DragEvent, targetDirPath: string) => {
    e.preventDefault()
    setDropTargetPath(null)
    const source = draggedNodeRef.current
    if (!source) return

    const sourcePath = source.path.replace(/\\/g, '/')
    const destDir = targetDirPath.replace(/\\/g, '/')
    if (sourcePath === destDir || destDir.startsWith(sourcePath + '/')) {
      draggedNodeRef.current = null
      setDraggedNode(null)
      return
    }

    const destPath = destDir + '/' + source.name
    try {
      await filesystemApi.movePath(source.path, destPath)
      if (!source.isDirectory) {
        const editorState = useEditorStore.getState()
        if (editorState.activeFilePath === source.path) {
          closeFile(source.path)
          await openFile(destPath, { preview: true })
        }
      }
      await handleRefresh()
    } catch (err) {
      console.error('Failed to move:', err)
    }
    draggedNodeRef.current = null
    setDraggedNode(null)
  }, [closeFile, openFile, handleRefresh])

  const handleDragEnd = useCallback(() => {
    draggedNodeRef.current = null
    setDraggedNode(null)
    setDropTargetPath(null)
  }, [])

  if (!root) {
    return (
      <div className="flex flex-col items-center justify-center h-full p-4 text-center">
        <span className="material-symbols-outlined text-[24px] text-[var(--color-text-tertiary)] mb-2">folder_off</span>
        <p className="text-xs text-[var(--color-text-tertiary)]">{t('editor.noWorkspace')}</p>
      </div>
    )
  }

  return (
    <div className="flex flex-col h-full overflow-hidden">
      <div className="shrink-0 px-3 py-2 border-b border-[var(--color-border)] bg-[var(--color-surface-container)]">
        <div className="flex items-center gap-1.5 min-w-0">
          <span className="material-symbols-outlined text-[14px] text-[var(--color-text-tertiary)]">folder_open</span>
          <Tooltip content={root}>
            <span className="text-[11px] font-medium text-[var(--color-text-secondary)] truncate">
              {root.split(/[/\\]/).pop() || root}
            </span>
          </Tooltip>
          {gitBranch && (
            <>
              <span className="text-[10px] text-[var(--color-text-tertiary)]">·</span>
              <Tooltip content={gitBranch}>
                <span className="text-[10px] text-[var(--color-brand)] shrink-0">
                  {gitBranch}
                </span>
              </Tooltip>
            </>
          )}
          <div className="ml-auto flex items-center gap-1 shrink-0">
            {isCompact ? (
              <div className="relative">
                <button
                  ref={overflowBtnRef}
                  onClick={() => setOverflowOpen((v) => !v)}
                  className="flex items-center justify-center w-5 h-5 rounded text-[var(--color-text-tertiary)] hover:text-[var(--color-brand)] hover:bg-[var(--color-surface-hover)] transition-colors"
                >
                  <span className="material-symbols-outlined text-[13px]">more_horiz</span>
                </button>
                {overflowOpen && createPortal(
                  <div
                    ref={overflowMenuRef}
                    className="fixed z-[200] py-1 rounded-lg bg-[var(--color-surface)] border border-[var(--color-border)] shadow-[var(--shadow-dropdown)] min-w-[160px]"
                    style={{
                      top: (overflowBtnRef.current?.getBoundingClientRect().bottom ?? 0) + 4,
                      left: Math.max(8, (overflowBtnRef.current?.getBoundingClientRect().right ?? 0) - 160),
                    }}
                  >
                    <button
                      onClick={() => { setMode((m) => m === 'tree' ? 'search' : 'tree'); setOverflowOpen(false) }}
                      className="w-full flex items-center gap-2 px-3 py-1.5 text-[12px] text-[var(--color-text-secondary)] hover:bg-[var(--color-surface-hover)] hover:text-[var(--color-text-primary)] transition-colors"
                    >
                      <span className="material-symbols-outlined text-[13px]">
                        {mode === 'tree' ? 'search' : 'folder_open'}
                      </span>
                      {mode === 'tree' ? t('fileExplorer.searchMode') : t('fileExplorer.treeMode')}
                    </button>
                    <button
                      onClick={() => { collapseAll(); setOverflowOpen(false) }}
                      className="w-full flex items-center gap-2 px-3 py-1.5 text-[12px] text-[var(--color-text-secondary)] hover:bg-[var(--color-surface-hover)] hover:text-[var(--color-text-primary)] transition-colors"
                    >
                      <span className="material-symbols-outlined text-[13px]">unfold_less</span>
                      {t('fileExplorer.collapseAll')}
                    </button>
                    <button
                      onClick={() => { setNewItemType('file'); setNewItemName(''); setOverflowOpen(false) }}
                      className="w-full flex items-center gap-2 px-3 py-1.5 text-[12px] text-[var(--color-text-secondary)] hover:bg-[var(--color-surface-hover)] hover:text-[var(--color-text-primary)] transition-colors"
                    >
                      <span className="material-symbols-outlined text-[13px]">note_add</span>
                      {t('fileExplorer.newFile')}
                    </button>
                    <button
                      onClick={() => { setNewItemType('folder'); setNewItemName(''); setOverflowOpen(false) }}
                      className="w-full flex items-center gap-2 px-3 py-1.5 text-[12px] text-[var(--color-text-secondary)] hover:bg-[var(--color-surface-hover)] hover:text-[var(--color-text-primary)] transition-colors"
                    >
                      <span className="material-symbols-outlined text-[13px]">create_new_folder</span>
                      {t('fileExplorer.newFolder')}
                    </button>
                    <button
                      onClick={() => { handleRefresh(); setOverflowOpen(false) }}
                      disabled={isReloading}
                      className="w-full flex items-center gap-2 px-3 py-1.5 text-[12px] text-[var(--color-text-secondary)] hover:bg-[var(--color-surface-hover)] hover:text-[var(--color-text-primary)] transition-colors disabled:opacity-50"
                    >
                      <span className={`material-symbols-outlined text-[13px] ${isReloading ? 'animate-spin' : ''}`}>
                        sync
                      </span>
                      {t('fileExplorer.refresh')}
                    </button>
                  </div>,
                  document.body
                )}
              </div>
            ) : (
              <>
                <Tooltip content={mode === 'tree' ? t('fileExplorer.searchMode') : t('fileExplorer.treeMode')}>
                  <button
                    onClick={() => setMode((m) => m === 'tree' ? 'search' : 'tree')}
                    className="flex items-center justify-center w-5 h-5 rounded text-[var(--color-text-tertiary)] hover:text-[var(--color-brand)] hover:bg-[var(--color-surface-hover)] transition-colors"
                  >
                    <span className="material-symbols-outlined text-[13px]">
                      {mode === 'tree' ? 'search' : 'folder_open'}
                    </span>
                  </button>
                </Tooltip>
                <Tooltip content={t('fileExplorer.collapseAll')}>
                  <button
                    onClick={collapseAll}
                    className="flex items-center justify-center w-5 h-5 rounded text-[var(--color-text-tertiary)] hover:text-[var(--color-brand)] hover:bg-[var(--color-surface-hover)] transition-colors"
                  >
                    <span className="material-symbols-outlined text-[13px]">unfold_less</span>
                  </button>
                </Tooltip>
                <Tooltip content={t('fileExplorer.newFile')}>
                  <button
                    onClick={() => { setNewItemType('file'); setNewItemName('') }}
                    className="flex items-center justify-center w-5 h-5 rounded text-[var(--color-text-tertiary)] hover:text-[var(--color-brand)] hover:bg-[var(--color-surface-hover)] transition-colors"
                  >
                    <span className="material-symbols-outlined text-[13px]">note_add</span>
                  </button>
                </Tooltip>
                <Tooltip content={t('fileExplorer.newFolder')}>
                  <button
                    onClick={() => { setNewItemType('folder'); setNewItemName('') }}
                    className="flex items-center justify-center w-5 h-5 rounded text-[var(--color-text-tertiary)] hover:text-[var(--color-brand)] hover:bg-[var(--color-surface-hover)] transition-colors"
                  >
                    <span className="material-symbols-outlined text-[13px]">create_new_folder</span>
                  </button>
                </Tooltip>
                <Tooltip content={t('fileExplorer.refresh')}>
                  <button
                    onClick={handleRefresh}
                    disabled={isReloading}
                    className="flex items-center justify-center w-5 h-5 rounded text-[var(--color-text-tertiary)] hover:text-[var(--color-brand)] hover:bg-[var(--color-surface-hover)] transition-colors disabled:opacity-50"
                  >
                    <span className={`material-symbols-outlined text-[13px] ${isReloading ? 'animate-spin' : ''}`}>
                      sync
                    </span>
                  </button>
                </Tooltip>
              </>
            )}
          </div>
        </div>
      </div>

      {mode === 'search' && (
        <div className="shrink-0 px-3 py-2 border-b border-[var(--color-border)]">
          <div className="flex items-center gap-1 rounded-md bg-[var(--color-surface-container)] px-2 py-1">
            <span className="material-symbols-outlined text-[13px] text-[var(--color-text-tertiary)]">search</span>
            <input
              ref={searchInputRef}
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder={t('fileExplorer.searchPlaceholder')}
              className="flex-1 min-w-0 bg-transparent text-[12px] text-[var(--color-text-primary)] outline-none placeholder:text-[var(--color-text-tertiary)]"
            />
            <Tooltip content={t('fileExplorer.caseSensitive')}>
              <button
                onClick={() => setCaseSensitive((v) => !v)}
                className={`flex items-center justify-center w-5 h-5 rounded text-[10px] font-bold shrink-0 transition-colors ${
                  caseSensitive
                    ? 'text-[var(--color-brand)] bg-[var(--color-surface-selected)]'
                    : 'text-[var(--color-text-tertiary)] hover:text-[var(--color-text-primary)]'
                }`}
              >
                Aa
              </button>
            </Tooltip>
            <Tooltip content={t('fileExplorer.wholeWord')}>
              <button
                onClick={() => setWholeWord((v) => !v)}
                className={`flex items-center justify-center w-5 h-5 rounded text-[10px] font-bold shrink-0 transition-colors ${
                  wholeWord
                    ? 'text-[var(--color-brand)] bg-[var(--color-surface-selected)]'
                    : 'text-[var(--color-text-tertiary)] hover:text-[var(--color-text-primary)]'
                }`}
              >
                ab
              </button>
            </Tooltip>
            <Tooltip content={t('fileExplorer.useRegex')}>
              <button
                onClick={() => setUseRegex((v) => !v)}
                className={`flex items-center justify-center w-5 h-5 rounded text-[10px] font-bold font-mono shrink-0 transition-colors ${
                  useRegex
                    ? 'text-[var(--color-brand)] bg-[var(--color-surface-selected)]'
                    : 'text-[var(--color-text-tertiary)] hover:text-[var(--color-text-primary)]'
                }`}
              >
                .*
              </button>
            </Tooltip>
            {searchQuery && (
              <button
                onClick={() => setSearchQuery('')}
                className="flex items-center justify-center w-4 h-4 rounded text-[var(--color-text-tertiary)] hover:text-[var(--color-text-primary)] shrink-0"
              >
                <span className="material-symbols-outlined text-[12px]">close</span>
              </button>
            )}
          </div>
        </div>
      )}

      <div
        className="flex-1 overflow-y-auto overflow-x-hidden py-1"
        onDragOver={(e) => {
          e.preventDefault()
          e.dataTransfer.dropEffect = 'move'
        }}
        onDrop={(e) => {
          e.preventDefault()
          const source = draggedNodeRef.current
          if (source && root) {
            const destPath = root.replace(/\\/g, '/') + '/' + source.name
            if (source.path.replace(/\\/g, '/') !== destPath) {
              void (async () => {
                try {
                  await filesystemApi.movePath(source.path, destPath)
                  await handleRefresh()
                } catch (err) {
                  console.error('Failed to move:', err)
                }
                draggedNodeRef.current = null
                setDraggedNode(null)
                setDropTargetPath(null)
              })()
            }
          }
        }}
      >
        {mode === 'tree' && (
          <>
            {tree.length === 0 && (
              <p className="px-3 py-4 text-[11px] text-[var(--color-text-tertiary)] text-center">{t('editor.emptyDir')}</p>
            )}
            {tree.map((node) => (
              <TreeNodeItem
                key={node.path}
                node={node}
                path={[node.name]}
                depth={0}
                onToggle={toggleExpand}
                onFileClick={(filePath) => void openFile(filePath, { preview: true })}
                onFileDoubleClick={(filePath) => void openFile(filePath)}
                onContextMenu={(e, n) => {
                  e.preventDefault()
                  setContextMenu({ x: e.clientX, y: e.clientY, node: n })
                }}
                activeFilePath={activeFilePath}
                gitStatusMap={gitStatusMap}
                draggedNode={draggedNode}
                dropTargetPath={dropTargetPath}
                onDragStart={handleDragStart}
                onDragOver={handleDragOver}
                onDragLeave={handleDragLeave}
                onDrop={handleDrop}
                onDragEnd={handleDragEnd}
              />
            ))}
          </>
        )}

        {mode === 'search' && (
          <>
            {isSearching && (
              <p className="px-3 py-4 text-[11px] text-[var(--color-text-tertiary)] text-center">{t('fileExplorer.searching')}</p>
            )}
            {!isSearching && searchQuery && searchResults.length === 0 && (
              <p className="px-3 py-4 text-[11px] text-[var(--color-text-tertiary)] text-center">{t('fileExplorer.noResults')}</p>
            )}
            {!isSearching && !searchQuery && (
              <p className="px-3 py-4 text-[11px] text-[var(--color-text-tertiary)] text-center">{t('fileExplorer.searchHint')}</p>
            )}
            {searchResults.map((entry) => (
              <Tooltip key={entry.path} content={entry.path} side="right" className="w-full">
              <button
                onClick={() => void openFile(entry.path, { preview: true })}
                onDoubleClick={() => void openFile(entry.path)}
                onContextMenu={(e) => {
                  e.preventDefault()
                  setContextMenu({ x: e.clientX, y: e.clientY, node: entry })
                }}
                className={`w-full flex items-center gap-1.5 py-[3px] px-3 text-left text-[12px] transition-colors ${
                  entry.path === activeFilePath
                    ? 'bg-[var(--color-surface-selected)] text-[var(--color-text-primary)] border-l-2 border-[var(--color-brand)] pl-[10px]'
                    : 'text-[var(--color-text-secondary)] hover:bg-[var(--color-surface-hover)] border-l-2 border-transparent'
                }`}
              >
                <FileIcon fileName={entry.name} />
                <span className="truncate flex-1 min-w-0">{entry.name}</span>
                <span className="text-[10px] text-[var(--color-text-tertiary)] shrink-0 truncate max-w-[120px]">
                  {entry.path.replace(/[/\\][^/\\]*$/, '')}
                </span>
              </button>
              </Tooltip>
            ))}
          </>
        )}
        {contextMenu && (
          <div
            ref={contextMenuRef}
            className="fixed z-50 min-w-[160px] py-1 rounded-md shadow-lg border border-[var(--color-border)] bg-[var(--color-surface-container)]"
            style={{ left: menuPos.left, top: menuPos.top }}
          >
            {!contextMenu.node.isDirectory ? (
              <button
                onClick={() => handleAddToConversation(contextMenu.node)}
                className="w-full flex items-center gap-2 px-3 py-1.5 text-[12px] text-[var(--color-text-secondary)] hover:bg-[var(--color-surface-hover)] hover:text-[var(--color-text-primary)] transition-colors"
              >
                <span className="material-symbols-outlined text-[14px]">chat</span>
                {t('fileExplorer.addToConversation')}
              </button>
            ) : (
              <button
                onClick={() => handleAddDirToConversation(contextMenu.node)}
                className="w-full flex items-center gap-2 px-3 py-1.5 text-[12px] text-[var(--color-text-secondary)] hover:bg-[var(--color-surface-hover)] hover:text-[var(--color-text-primary)] transition-colors"
              >
                <span className="material-symbols-outlined text-[14px]">chat</span>
                {t('fileExplorer.addDirToConversation')}
              </button>
            )}
            {!contextMenu.node.isDirectory && contextMenu.node.name.toLowerCase().endsWith('.html') && (
              <button
                onClick={() => void handleOpenExternal(contextMenu.node!.path)}
                className="w-full flex items-center gap-2 px-3 py-1.5 text-[12px] text-[var(--color-text-secondary)] hover:bg-[var(--color-surface-hover)] hover:text-[var(--color-text-primary)] transition-colors"
              >
                <span className="material-symbols-outlined text-[14px]">language</span>
                {t('fileExplorer.openInBrowser')}
              </button>
            )}
            <button
              onClick={() => {
                setRenameTarget(contextMenu!.node)
                setRenameName(contextMenu!.node.name)
                setContextMenu(null)
              }}
              className="w-full flex items-center gap-2 px-3 py-1.5 text-[12px] text-[var(--color-text-secondary)] hover:bg-[var(--color-surface-hover)] hover:text-[var(--color-text-primary)] transition-colors"
            >
              <span className="material-symbols-outlined text-[14px]">edit</span>
              {t('fileExplorer.rename')}
            </button>
            <button
              onClick={() => void handleCopyPath(contextMenu.node.path)}
              className="w-full flex items-center gap-2 px-3 py-1.5 text-[12px] text-[var(--color-text-secondary)] hover:bg-[var(--color-surface-hover)] hover:text-[var(--color-text-primary)] transition-colors"
            >
              <span className="material-symbols-outlined text-[14px]">content_copy</span>
              {t('fileExplorer.copyPath')}
            </button>
            <div className="my-1 border-t border-[var(--color-border)]" />
            <button
              onClick={() => { setDeleteConfirm(contextMenu!.node); setContextMenu(null) }}
              className="w-full flex items-center gap-2 px-3 py-1.5 text-[12px] text-[var(--color-error)] hover:bg-[var(--color-surface-hover)] transition-colors"
            >
              <span className="material-symbols-outlined text-[14px]">delete</span>
              {t('fileExplorer.delete')}
            </button>
          </div>
        )}
        {deleteConfirm && (
          <Modal
            open
            onClose={() => setDeleteConfirm(null)}
            title={t('fileExplorer.deleteConfirmTitle')}
            footer={
              <>
                <button
                  onClick={() => setDeleteConfirm(null)}
                  className="px-3 py-1.5 text-[12px] rounded-md border border-[var(--color-border)] text-[var(--color-text-secondary)] hover:bg-[var(--color-surface-hover)] transition-colors"
                >
                  {t('fileExplorer.deleteCancel')}
                </button>
                <button
                  onClick={() => void handleDelete(deleteConfirm)}
                  className="px-3 py-1.5 text-[12px] rounded-md bg-[var(--color-error)] text-white hover:opacity-90 transition-colors"
                >
                  {t('fileExplorer.deleteConfirm')}
                </button>
              </>
            }
          >
            <p className="text-[13px] text-[var(--color-text-primary)]">
              {deleteConfirm.isDirectory
                ? t('fileExplorer.deleteFolderMessage', { name: deleteConfirm.name })
                : t('fileExplorer.deleteFileMessage', { name: deleteConfirm.name })}
            </p>
          </Modal>
        )}
        {newItemType && (
          <Modal
            open
            onClose={() => { setNewItemType(null); setNewItemName('') }}
            title={newItemType === 'file' ? t('fileExplorer.newFile') : t('fileExplorer.newFolder')}
            footer={
              <>
                <button
                  onClick={() => { setNewItemType(null); setNewItemName('') }}
                  className="px-3 py-1.5 text-[12px] rounded-md border border-[var(--color-border)] text-[var(--color-text-secondary)] hover:bg-[var(--color-surface-hover)] transition-colors"
                >
                  {t('fileExplorer.deleteCancel')}
                </button>
                <button
                  onClick={() => void handleCreateItem()}
                  disabled={!newItemName.trim()}
                  className="px-3 py-1.5 text-[12px] rounded-md bg-[var(--color-brand)] text-white hover:opacity-90 transition-colors disabled:opacity-50"
                >
                  {t('fileExplorer.create')}
                </button>
              </>
            }
          >
            <input
              ref={newItemInputRef}
              type="text"
              value={newItemName}
              onChange={(e) => setNewItemName(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter' && newItemName.trim()) void handleCreateItem() }}
              placeholder={newItemType === 'file' ? t('fileExplorer.fileNamePlaceholder') : t('fileExplorer.folderNamePlaceholder')}
              className="w-full px-3 py-2 text-[13px] rounded-md bg-[var(--color-surface-container)] text-[var(--color-text-primary)] outline-none border border-[var(--color-border)] focus:border-[var(--color-brand)] placeholder:text-[var(--color-text-tertiary)]"
              autoFocus
            />
          </Modal>
        )}
        {renameTarget && (
          <Modal
            open
            onClose={() => { setRenameTarget(null); setRenameName('') }}
            title={t('fileExplorer.renameTitle')}
            footer={
              <>
                <button
                  onClick={() => { setRenameTarget(null); setRenameName('') }}
                  className="px-3 py-1.5 text-[12px] rounded-md border border-[var(--color-border)] text-[var(--color-text-secondary)] hover:bg-[var(--color-surface-hover)] transition-colors"
                >
                  {t('fileExplorer.deleteCancel')}
                </button>
                <button
                  onClick={() => void handleRename()}
                  disabled={!renameName.trim() || renameName.trim() === renameTarget.name}
                  className="px-3 py-1.5 text-[12px] rounded-md bg-[var(--color-brand)] text-white hover:opacity-90 transition-colors disabled:opacity-50"
                >
                  {t('fileExplorer.renameConfirm')}
                </button>
              </>
            }
          >
            <input
              ref={renameInputRef}
              type="text"
              value={renameName}
              onChange={(e) => setRenameName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && renameName.trim() && renameName.trim() !== renameTarget.name) {
                  void handleRename()
                }
              }}
              placeholder={t('fileExplorer.renamePlaceholder')}
              className="w-full px-3 py-2 text-[13px] rounded-md bg-[var(--color-surface-container)] text-[var(--color-text-primary)] outline-none border border-[var(--color-border)] focus:border-[var(--color-brand)] placeholder:text-[var(--color-text-tertiary)]"
              autoFocus
            />
          </Modal>
        )}
      </div>
    </div>
  )
}

function TreeNodeItem({
  node,
  path,
  depth,
  onToggle,
  onFileClick,
  onFileDoubleClick,
  onContextMenu,
  activeFilePath,
  gitStatusMap,
  draggedNode,
  dropTargetPath,
  onDragStart,
  onDragOver,
  onDragLeave,
  onDrop,
  onDragEnd,
}: {
  node: TreeNode
  path: string[]
  depth: number
  onToggle: (node: TreeNode, parentPath: string[]) => void
  onFileClick: (filePath: string) => void
  onFileDoubleClick: (filePath: string) => void
  onContextMenu: (e: React.MouseEvent, node: TreeNode) => void
  activeFilePath: string | null
  gitStatusMap: Map<string, GitFileStatus>
  draggedNode: DirEntry | null
  dropTargetPath: string | null
  onDragStart: (node: DirEntry) => void
  onDragOver: (e: React.DragEvent, targetPath: string) => void
  onDragLeave: () => void
  onDrop: (e: React.DragEvent, targetDirPath: string) => void
  onDragEnd: () => void
}) {
  const isActive = !node.isDirectory && node.path === activeFilePath
  const paddingLeft = 8 + depth * 14
  const gitStatus = !node.isDirectory ? gitStatusMap.get(node.path) : undefined
  const isDropTarget = node.isDirectory && dropTargetPath === node.path
  const isDragged = draggedNode?.path === node.path

  const handleClick = () => {
    if (node.isDirectory) {
      onToggle(node, path.slice(0, -1))
    } else {
      onFileClick(node.path)
    }
  }

  const handleDoubleClick = () => {
    if (!node.isDirectory) {
      onFileDoubleClick(node.path)
    }
  }

  return (
    <>
      <div
        draggable
        onClick={handleClick}
        onDoubleClick={handleDoubleClick}
        onContextMenu={(e) => onContextMenu(e, node)}
        onDragStart={(e) => {
          e.stopPropagation()
          e.dataTransfer.effectAllowed = 'move'
          e.dataTransfer.setData('text/plain', node.path)
          onDragStart(node)
        }}
        onDragEnd={(e) => {
          e.stopPropagation()
          onDragEnd()
        }}
        {...(node.isDirectory ? {
          onDragOver: (e: React.DragEvent) => {
            e.preventDefault()
            e.stopPropagation()
            onDragOver(e, node.path)
          },
          onDragLeave: (e: React.DragEvent) => {
            e.stopPropagation()
            onDragLeave()
          },
          onDrop: (e: React.DragEvent) => {
            e.preventDefault()
            e.stopPropagation()
            onDrop(e, node.path)
          },
        } : {})}
        className={`w-full flex items-center gap-1 py-[3px] pr-2 text-left text-[12px] transition-colors cursor-default select-none
          ${isDragged ? 'opacity-40' : ''}
          ${isDropTarget
            ? 'bg-[var(--color-surface-selected)] ring-1 ring-inset ring-[var(--color-brand)] border-l-2 border-[var(--color-brand)]'
            : isActive
              ? 'bg-[var(--color-surface-selected)] text-[var(--color-text-primary)] border-l-2 border-[var(--color-brand)]'
              : 'text-[var(--color-text-secondary)] hover:bg-[var(--color-surface-hover)] border-l-2 border-transparent'
          }`}
        style={{ paddingLeft: (isActive || isDropTarget) ? paddingLeft - 2 : paddingLeft }}
        title={node.path}
      >
        {node.isDirectory ? (
          <>
            <span className="material-symbols-outlined shrink-0 text-[var(--color-text-tertiary)]" style={{ fontSize: '13px', fontVariationSettings: node.expanded ? "'FILL' 0" : "'FILL' 1" }}>
              {node.expanded ? 'folder_open' : 'folder'}
            </span>
            <span className="truncate flex-1 min-w-0">{node.name}</span>
          </>
        ) : (
          <>
            <FileIcon fileName={node.name} />
            <span className={`truncate flex-1 min-w-0 ${isActive ? 'font-medium' : ''}`}>{node.name}</span>
            {gitStatus && (
              <GitStatusBadge status={gitStatus} />
            )}
          </>
        )}
      </div>
      {node.isDirectory && node.expanded && node.children?.map((child) => (
        <TreeNodeItem
          key={child.path}
          node={child}
          path={[...path, child.name]}
          depth={depth + 1}
          onToggle={onToggle}
          onFileClick={onFileClick}
          onFileDoubleClick={onFileDoubleClick}
          onContextMenu={onContextMenu}
          activeFilePath={activeFilePath}
          gitStatusMap={gitStatusMap}
          draggedNode={draggedNode}
          dropTargetPath={dropTargetPath}
          onDragStart={onDragStart}
          onDragOver={onDragOver}
          onDragLeave={onDragLeave}
          onDrop={onDrop}
          onDragEnd={onDragEnd}
        />
      ))}
    </>
  )
}

function GitStatusBadge({ status }: { status: GitFileStatus }) {
  const config: Record<GitFileStatus, { label: string; color: string }> = {
    modified:         { label: 'M', color: 'text-[var(--color-warning)]' },
    staged:           { label: 'M', color: 'text-[var(--color-success)]' },
    'staged-modified':{ label: 'M', color: 'text-[var(--color-warning)]' },
    added:            { label: 'A', color: 'text-[var(--color-success)]' },
    deleted:          { label: 'D', color: 'text-[var(--color-error)]' },
    untracked:        { label: 'U', color: 'text-[var(--color-text-tertiary)]' },
    renamed:          { label: 'R', color: 'text-[var(--color-brand)]' },
    copied:           { label: 'C', color: 'text-[var(--color-brand)]' },
  }
  const { label, color } = config[status] ?? config.modified!
  return (
    <span className={`shrink-0 text-[10px] font-mono font-bold leading-none ${color}`}>
      {label}
    </span>
  )
}

function FileIcon({ fileName }: { fileName: string }) {
  const ext = fileName.split('.').pop()?.toLowerCase() || ''
  const baseClass = 'material-symbols-outlined shrink-0 text-[var(--color-text-tertiary)]'
  const iconStyle = { fontSize: '13px' }
  if (ext === 'pdf') {
    return (
      <span className={baseClass} style={iconStyle}>
        picture_as_pdf
      </span>
    )
  }
  if (['png', 'jpg', 'jpeg', 'gif', 'webp', 'svg', 'bmp', 'avif', 'ico'].includes(ext)) {
    return (
      <span className={baseClass} style={iconStyle}>
        image
      </span>
    )
  }
  const iconMap: Record<string, string> = {
    ts: 'code', tsx: 'code',
    js: 'javascript', jsx: 'javascript',
    json: 'data_object',
    md: 'description',
    py: 'terminal',
    css: 'palette', scss: 'palette', less: 'palette',
    html: 'html',
    yaml: 'settings', yml: 'settings', toml: 'settings',
    sh: 'terminal', bash: 'terminal',
    sql: 'database',
    go: 'code', rs: 'code', java: 'code',
  }
  const icon = iconMap[ext] || 'description'
  return (
    <span className={baseClass} style={iconStyle}>
      {icon}
    </span>
  )
}
