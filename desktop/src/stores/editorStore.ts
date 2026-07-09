/**
 * Editor Store — 编辑器状态管理
 *
 * 参照 smart-code stores/editorStore.ts 照搬。
 * 适配：用 console.error 替代 useUIStore.addToast（SpaceAI uiStore 无 addToast）。
 */

import { create } from 'zustand'
import { filesystemApi, MAX_PREVIEW_SIZE } from '../api/filesystem'
import { gitApi, type GitFileStatus } from '../api/git'
import { getBaseUrl } from '../api/client'

const IMAGE_EXTENSIONS = /\.(png|jpe?g|gif|webp|svg|bmp|avif|ico)$/i
const PDF_EXTENSION = /\.pdf$/i
const MARKDOWN_EXTENSION = /\.(md|markdown|mdx)$/i
const OFFICE_EXTENSIONS = /\.(docx|xlsx|pptx)$/i
const BINARY_EXTENSIONS = /\.(mp3|mp4|wav|avi|mov|mkv|flv|wmv|zip|tar|gz|bz2|xz|7z|rar|exe|dll|so|dylib|bin|dat|msi|dmg|deb|rpm|iso|img|apk|appx|msix|cab|doc|xls|ppt|woff|woff2|ttf|eot|otf|sqlite|db|wasm|class|o|a|lib|pyc|pyo)$/i

function isImageFile(filePath: string): boolean {
  return IMAGE_EXTENSIONS.test(filePath)
}

function isPdfFile(filePath: string): boolean {
  return PDF_EXTENSION.test(filePath)
}

function isMarkdownFile(filePath: string): boolean {
  return MARKDOWN_EXTENSION.test(filePath)
}

function isOfficeFile(filePath: string): boolean {
  return OFFICE_EXTENSIONS.test(filePath)
}

function getOfficeFileType(filePath: string): 'docx' | 'xlsx' | 'pptx' | null {
  const match = filePath.match(/\.(docx|xlsx|pptx)$/i)
  return match ? (match[1]!.toLowerCase() as 'docx' | 'xlsx' | 'pptx') : null
}

function isBinaryFile(filePath: string): boolean {
  return BINARY_EXTENSIONS.test(filePath)
}

export type EditorFile = {
  path: string
  name: string
  content: string
  originalContent: string
  isDirty: boolean
  language: string
  fileType: 'text' | 'image' | 'pdf' | 'markdown' | 'docx' | 'xlsx' | 'pptx' | 'binary'
  previewUrl?: string
  tooLarge?: boolean
  isPreview?: boolean
}

export type GitLineChange = 'added' | 'modified' | 'deleted'

export type GitDiffInfo = {
  lineChanges: Map<number, GitLineChange>
  deletedLines: Array<{ afterLine: number; count: number }>
}

type EditorStore = {
  openFiles: EditorFile[]
  activeFilePath: string | null
  explorerRoot: string | null
  isLoading: boolean
  gitStatusMap: Map<string, GitFileStatus>
  gitBranch: string | null
  isGitRepo: boolean
  pendingRevealPath: string | null

  setExplorerRoot: (root: string | null) => void
  openFile: (filePath: string, options?: { preview?: boolean }) => Promise<void>
  pinFile: (filePath: string) => void
  closeFile: (filePath: string) => void
  setActiveFile: (filePath: string | null) => void
  updateFileContent: (filePath: string, content: string) => void
  saveFile: (filePath: string) => Promise<void>
  saveActiveFile: () => Promise<void>
  closeAllFiles: () => void
  refreshGitStatus: () => Promise<void>
  getFileGitStatus: (filePath: string) => GitFileStatus | undefined
  computeLocalDiff: (filePath: string) => GitDiffInfo
  syncFileFromDisk: (filePath: string, content: string) => void
  revealFileInExplorer: (filePath: string) => void
  clearPendingReveal: () => void
  destroy: () => void
}

function getLanguageFromPath(filePath: string): string {
  const ext = filePath.split('.').pop()?.toLowerCase() || ''
  const map: Record<string, string> = {
    ts: 'typescript', tsx: 'typescriptreact',
    js: 'javascript', jsx: 'javascriptreact',
    cjs: 'javascript', mjs: 'javascript',
    json: 'json', md: 'markdown',
    py: 'python', rb: 'ruby',
    go: 'go', rs: 'rust',
    java: 'java', kt: 'kotlin', kts: 'kotlin', dart: 'dart', groovy: 'groovy',
    c: 'c', cpp: 'cpp', h: 'c', hpp: 'cpp',
    cs: 'csharp', fs: 'fsharp',
    html: 'html', css: 'css', scss: 'scss', less: 'less',
    yaml: 'yaml', yml: 'yaml',
    toml: 'ini', ini: 'ini',
    npmrc: 'ini',
    properties: 'ini',
    sh: 'shell', bash: 'shell', zsh: 'shell',
    bat: 'bat', cmd: 'bat', ps1: 'powershell',
    sql: 'sql', xml: 'xml',
    dockerfile: 'dockerfile',
    graphql: 'graphql', gql: 'graphql',
    vue: 'vue', svelte: 'html',
  }
  if (ext === 'gitignore' || ext === 'env' || ext === 'env.example') return 'plaintext'
  if (filePath.endsWith('Dockerfile')) return 'dockerfile'
  if (filePath.endsWith('bun.lock')) return 'ini'
  return map[ext] || 'plaintext'
}

function getFileName(filePath: string): string {
  return filePath.replace(/\\/g, '/').split('/').pop() || filePath
}

function computeLineDiff(original: string, current: string): GitDiffInfo {
  const lineChanges = new Map<number, GitLineChange>()
  const deletedLines: GitDiffInfo['deletedLines'] = []

  if (original === current) return { lineChanges, deletedLines }

  const a = original.split('\n')
  const b = current.split('\n')

  if (a.length > 3000 || b.length > 3000) {
    const maxLen = Math.max(a.length, b.length)
    const minLen = Math.min(a.length, b.length)
    for (let i = 0; i < maxLen; i++) {
      if (i >= minLen) {
        lineChanges.set(i + 1, 'added')
      } else if (a[i] !== b[i]) {
        lineChanges.set(i + 1, 'modified')
      }
    }
    if (a.length > b.length) {
      deletedLines.push({ afterLine: b.length, count: a.length - b.length })
    }
    return { lineChanges, deletedLines }
  }

  const m = a.length
  const n = b.length

  const dp: number[][] = Array.from({ length: m + 1 }, () => new Array(n + 1).fill(0))

  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      if (a[i - 1] === b[j - 1]) {
        dp[i]![j] = dp[i - 1]![j - 1]! + 1
      } else {
        dp[i]![j] = Math.max(dp[i - 1]![j]!, dp[i]![j - 1]!)
      }
    }
  }

  const edits: Array<'keep' | 'delete' | 'insert'> = []
  let i = m, j = n
  while (i > 0 || j > 0) {
    if (i > 0 && j > 0 && a[i - 1] === b[j - 1]) {
      edits.push('keep')
      i--; j--
    } else if (j > 0 && (i === 0 || dp[i]![j - 1]! >= dp[i - 1]![j]!)) {
      edits.push('insert')
      j--
    } else {
      edits.push('delete')
      i--
    }
  }
  edits.reverse()

  let pendingDeletes = 0
  let pendingDeleteAfterLine = 0
  let currentLine = 1

  for (const edit of edits) {
    switch (edit) {
      case 'keep':
        if (pendingDeletes > 0) {
          deletedLines.push({ afterLine: pendingDeleteAfterLine, count: pendingDeletes })
          pendingDeletes = 0
        }
        currentLine++
        break

      case 'delete':
        if (pendingDeletes === 0) {
          pendingDeleteAfterLine = currentLine - 1
        }
        pendingDeletes++
        break

      case 'insert':
        if (pendingDeletes > 0) {
          lineChanges.set(currentLine, 'modified')
          pendingDeletes--
        } else {
          lineChanges.set(currentLine, 'added')
        }
        currentLine++
        break
    }
  }

  if (pendingDeletes > 0) {
    deletedLines.push({ afterLine: pendingDeleteAfterLine, count: pendingDeletes })
  }

  return { lineChanges, deletedLines }
}

let statusTimer: ReturnType<typeof setTimeout> | null = null
let gitStatusPollTimer: ReturnType<typeof setInterval> | null = null

function startGitStatusPolling() {
  if (gitStatusPollTimer) return
  gitStatusPollTimer = setInterval(() => {
    const { explorerRoot } = useEditorStore.getState()
    if (explorerRoot) {
      void useEditorStore.getState().refreshGitStatus()
    }
  }, 30_000)
}

function stopGitStatusPolling() {
  if (gitStatusPollTimer) {
    clearInterval(gitStatusPollTimer)
    gitStatusPollTimer = null
  }
}

export const useEditorStore = create<EditorStore>((set, get) => ({
  openFiles: [],
  activeFilePath: null,
  explorerRoot: null,
  isLoading: false,
  gitStatusMap: new Map(),
  gitBranch: null,
  isGitRepo: false,
  pendingRevealPath: null,

  setExplorerRoot: (root) => {
    stopGitStatusPolling()
    set({ explorerRoot: root })
    if (root) {
      void get().refreshGitStatus()
      startGitStatusPolling()
    } else {
      set({ gitStatusMap: new Map(), gitBranch: null, isGitRepo: false })
    }
  },

  openFile: async (filePath, options) => {
    const preview = options?.preview ?? false
    const { openFiles } = get()
    const existing = openFiles.find((f) => f.path === filePath)

    if (existing) {
      set({ activeFilePath: filePath })
      if (!preview && existing.isPreview) {
        set((s) => ({
          openFiles: s.openFiles.map((f) =>
            f.path === filePath ? { ...f, isPreview: false } : f,
          ),
        }))
      }
      if (!existing.isDirty) {
        try {
          const result = await filesystemApi.readFile(filePath)
          if (result && typeof result.content === 'string' && result.content !== existing.content) {
            set((s) => ({
              openFiles: s.openFiles.map((f) =>
                f.path === filePath
                  ? { ...f, content: result.content, originalContent: result.content }
                  : f,
              ),
            }))
          }
        } catch { /* ignore */ }
      }
      return
    }

    const previewTabIdx = openFiles.findIndex((f) => f.isPreview)

    const addOrReplace = (file: EditorFile) => {
      set((s) => {
        const files = previewTabIdx >= 0
          ? s.openFiles.map((f, i) => (i === previewTabIdx ? file : f))
          : [...s.openFiles, file]
        return { openFiles: files, activeFilePath: filePath, isLoading: false }
      })
    }

    if (isOfficeFile(filePath)) {
      const officeType = getOfficeFileType(filePath)
      if (officeType) {
        set({ isLoading: true })
        try {
          const fileSize = await filesystemApi.getFileSize(filePath)
          const tooLarge = fileSize > MAX_PREVIEW_SIZE
          const file: EditorFile = {
            path: filePath,
            name: getFileName(filePath),
            content: '',
            originalContent: '',
            isDirty: false,
            language: 'plaintext',
            fileType: officeType,
            previewUrl: tooLarge ? undefined : `${getBaseUrl()}/api/filesystem/file?path=${encodeURIComponent(filePath)}&t=${Date.now()}`,
            tooLarge,
            ...(preview ? { isPreview: true } : {}),
          }
          addOrReplace(file)
        } catch (err) {
          console.error('[editorStore] openFile (office) failed:', err)
          set({ isLoading: false })
        }
        return
      }
    }

    if (isBinaryFile(filePath)) {
      set({ isLoading: true })
      try {
        const file: EditorFile = {
          path: filePath,
          name: getFileName(filePath),
          content: '',
          originalContent: '',
          isDirty: false,
          language: 'plaintext',
          fileType: 'binary',
          ...(preview ? { isPreview: true } : {}),
        }
        addOrReplace(file)
      } catch (err) {
        console.error('[editorStore] openFile (binary) failed:', err)
        set({ isLoading: false })
      }
      return
    }

    if (isImageFile(filePath)) {
      set({ isLoading: true })
      try {
        const file: EditorFile = {
          path: filePath,
          name: getFileName(filePath),
          content: '',
          originalContent: '',
          isDirty: false,
          language: 'plaintext',
          fileType: 'image',
          previewUrl: `${getBaseUrl()}/api/filesystem/file?path=${encodeURIComponent(filePath)}&t=${Date.now()}`,
          ...(preview ? { isPreview: true } : {}),
        }
        addOrReplace(file)
      } catch (err) {
        console.error('[editorStore] openFile (image) failed:', err)
        set({ isLoading: false })
      }
      return
    }

    if (isPdfFile(filePath)) {
      set({ isLoading: true })
      try {
        const file: EditorFile = {
          path: filePath,
          name: getFileName(filePath),
          content: '',
          originalContent: '',
          isDirty: false,
          language: 'plaintext',
          fileType: 'pdf',
          previewUrl: `${getBaseUrl()}/api/filesystem/file?path=${encodeURIComponent(filePath)}&t=${Date.now()}`,
          ...(preview ? { isPreview: true } : {}),
        }
        addOrReplace(file)
      } catch (err) {
        console.error('[editorStore] openFile (pdf) failed:', err)
        set({ isLoading: false })
      }
      return
    }

    if (isMarkdownFile(filePath)) {
      set({ isLoading: true })
      try {
        const result = await filesystemApi.readFile(filePath)
        if (!result || typeof result.content !== 'string') {
          console.error('[editorStore] readFile returned invalid data:', result)
          set({ isLoading: false })
          return
        }
        const file: EditorFile = {
          path: filePath,
          name: getFileName(filePath),
          content: result.content,
          originalContent: result.content,
          isDirty: false,
          language: 'markdown',
          fileType: 'markdown',
          ...(preview ? { isPreview: true } : {}),
        }
        addOrReplace(file)
      } catch (err) {
        console.error('[editorStore] openFile (markdown) failed:', err)
        set({ isLoading: false })
      }
      return
    }

    set({ isLoading: true })
    try {
      const result = await filesystemApi.readFile(filePath)
      if (!result || typeof result.content !== 'string') {
        console.error('[editorStore] readFile returned invalid data:', result)
        set({ isLoading: false })
        return
      }
      const file: EditorFile = {
        path: filePath,
        name: getFileName(filePath),
        content: result.content,
        originalContent: result.content,
        isDirty: false,
        language: getLanguageFromPath(filePath),
        fileType: 'text',
        ...(preview ? { isPreview: true } : {}),
      }
      addOrReplace(file)
    } catch (err) {
      console.error('[editorStore] openFile failed:', err)
      const msg = err instanceof Error ? err.message : String(err)
      if (msg.includes('binary') || msg.includes('Binary')) {
        const file: EditorFile = {
          path: filePath,
          name: getFileName(filePath),
          content: '',
          originalContent: '',
          isDirty: false,
          language: 'plaintext',
          fileType: 'binary',
          ...(preview ? { isPreview: true } : {}),
        }
        addOrReplace(file)
      }
      set({ isLoading: false })
    }
  },

  pinFile: (filePath) => {
    set((s) => ({
      openFiles: s.openFiles.map((f) =>
        f.path === filePath && f.isPreview ? { ...f, isPreview: false } : f,
      ),
    }))
  },

  closeFile: (filePath) => {
    set((s) => {
      const newFiles = s.openFiles.filter((f) => f.path !== filePath)
      let newActive = s.activeFilePath
      if (s.activeFilePath === filePath) {
        const idx = s.openFiles.findIndex((f) => f.path === filePath)
        newActive = newFiles[Math.min(idx, newFiles.length - 1)]?.path ?? null
      }
      return { openFiles: newFiles, activeFilePath: newActive }
    })
  },

  setActiveFile: (filePath) => {
    set({ activeFilePath: filePath })
  },

  updateFileContent: (filePath, content) => {
    set((s) => ({
      openFiles: s.openFiles.map((f) =>
        f.path === filePath
          ? { ...f, content, isDirty: content !== f.originalContent, isPreview: false }
          : f,
      ),
    }))
    if (statusTimer) clearTimeout(statusTimer)
    statusTimer = setTimeout(() => {
      void get().refreshGitStatus()
    }, 2000)
  },

  saveFile: async (filePath) => {
    const file = get().openFiles.find((f) => f.path === filePath)
    if (!file) return
    try {
      await filesystemApi.writeFile(filePath, file.content)
      set((s) => ({
        openFiles: s.openFiles.map((f) =>
          f.path === filePath
            ? { ...f, originalContent: file.content, isDirty: false }
            : f,
        ),
      }))
      void get().refreshGitStatus()
    } catch {
      // TODO: show error toast
    }
  },

  saveActiveFile: async () => {
    const { activeFilePath, saveFile } = get()
    if (activeFilePath) {
      await saveFile(activeFilePath)
    }
  },

  closeAllFiles: () => set({ openFiles: [], activeFilePath: null }),

  refreshGitStatus: async () => {
    const { explorerRoot } = get()
    if (!explorerRoot) return

    try {
      const result = await gitApi.getStatus(explorerRoot)
      const map = new Map<string, GitFileStatus>()
      for (const file of result.files) {
        map.set(file.path, file.status)
      }
      set({
        gitStatusMap: map,
        gitBranch: result.branch,
        isGitRepo: result.isGitRepo,
      })
    } catch (err) {
      console.error('[editorStore] refreshGitStatus failed:', err)
    }
  },

  getFileGitStatus: (filePath: string) => {
    return get().gitStatusMap.get(filePath)
  },

  computeLocalDiff: (filePath: string) => {
    const file = get().openFiles.find((f) => f.path === filePath)
    if (!file) return { lineChanges: new Map<number, GitLineChange>(), deletedLines: [] }
    return computeLineDiff(file.originalContent, file.content)
  },

  syncFileFromDisk: (filePath, content) => {
    const file = get().openFiles.find((f) => f.path === filePath)
    if (!file) {
      const fileName = filePath.replace(/\\/g, '/').split('/').pop()
      const matched = get().openFiles.find((f) => f.path.replace(/\\/g, '/').endsWith(fileName || ''))
      if (matched && !matched.isDirty && matched.content !== content) {
        set((s) => ({
          openFiles: s.openFiles.map((f) =>
            f.path === matched.path
              ? { ...f, content, isDirty: false }
              : f,
          ),
        }))
        void get().refreshGitStatus()
      }
      return
    }
    if (file.isDirty) return
    if (file.content === content) return
    set((s) => ({
      openFiles: s.openFiles.map((f) =>
        f.path === filePath
          ? { ...f, content, isDirty: false }
          : f,
      ),
    }))
    void get().refreshGitStatus()
  },

  revealFileInExplorer: (filePath) => {
    set({ pendingRevealPath: filePath })
  },

  clearPendingReveal: () => {
    set({ pendingRevealPath: null })
  },

  destroy: () => {
    stopGitStatusPolling()
    if (statusTimer) {
      clearTimeout(statusTimer)
      statusTimer = null
    }
  },
}))
