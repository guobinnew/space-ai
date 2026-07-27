import { useCallback, useRef, useState, Suspense, lazy, useEffect, useMemo } from 'react'
import { useEditorStore, type GitDiffInfo } from '../../stores/editorStore'
import { useTranslation } from '../../i18n'
import { useUIStore } from '../../stores/uiStore'
import { usePendingRefStore } from '../../stores/pendingRefStore'
import { useTTS } from '../../hooks/useTTS'
import { MarkdownRenderer } from '../markdown/MarkdownRenderer'
import { ImagePreview } from './ImagePreview'
import { DocxPreview } from './DocxPreview'
import { XlsxPreview } from './XlsxPreview'
import { PptxPreview } from './PptxPreview'
import * as monacoEditor from 'monaco-editor'
import { Tooltip } from '../shared/Tooltip'

// Lazy-load Monaco to avoid blocking the initial render and to isolate crashes
const Editor = lazy(() =>
  import('@monaco-editor/react').then((mod) => ({ default: mod.default })),
)

/** Apply git gutter decorations to the Monaco editor */
function applyGitDecorations(editor: any, diffInfo: GitDiffInfo | undefined) {
  if (!editor) return

  const model = editor.getModel()
  if (!model) return

  const decorations: any[] = []

  if (!diffInfo) {
    editor.deltaDecorations(
      (editor as any).__gitDecorations || [],
      [],
    )
    ;(editor as any).__gitDecorations = []
    return
  }

  const { lineChanges, deletedLines } = diffInfo

  for (const [lineNum, changeType] of lineChanges) {
    const lineCount = model.getLineCount()
    if (lineNum < 1 || lineNum > lineCount) continue

    const isModified = changeType === 'modified'
    const lineClassName = isModified ? 'git-line-modified' : 'git-line-added'
    const marginClassName = isModified ? 'git-margin-modified' : 'git-margin-added'
    const overviewColor = isModified ? '#e2c08d' : '#587c0c'

    decorations.push({
      range: {
        startLineNumber: lineNum,
        startColumn: 1,
        endLineNumber: lineNum,
        endColumn: 1,
      },
      options: {
        isWholeLine: true,
        className: lineClassName,
        marginClassName,
        overviewRuler: {
          color: overviewColor,
          position: 2,
        },
        minimap: {
          color: overviewColor,
          position: 1,
        },
      },
    })
  }

  for (const { afterLine } of deletedLines) {
    const lineCount = model.getLineCount()
    const targetLine = Math.max(1, Math.min(afterLine + 1, lineCount))

    decorations.push({
      range: {
        startLineNumber: targetLine,
        startColumn: Number.MAX_SAFE_INTEGER,
        endLineNumber: targetLine,
        endColumn: Number.MAX_SAFE_INTEGER,
      },
      options: {
        after: {
          content: '',
          inlineClassName: 'git-deleted-line',
          cursorStops: 0,
        },
        isWholeLine: false,
      },
    })

    if (afterLine >= 0 && afterLine + 1 <= lineCount) {
      decorations.push({
        range: {
          startLineNumber: afterLine + 1,
          startColumn: 1,
          endLineNumber: afterLine + 1,
          endColumn: 1,
        },
        options: {
          isWholeLine: true,
          marginClassName: 'git-margin-deleted',
          overviewRuler: {
            color: '#94151b',
            position: 2,
          },
          minimap: {
            color: '#94151b',
            position: 1,
          },
        },
      })
    }
  }

  const newDecorations = editor.deltaDecorations(
    (editor as any).__gitDecorations || [],
    decorations,
  )
  ;(editor as any).__gitDecorations = newDecorations
}

const CONTEXT_MENU_PATCHES: [string, string][] = [
  ['editor.action.clipboardCutAction', 'editor.cut'],
  ['editor.action.clipboardCopyAction', 'editor.copy'],
  ['editor.action.clipboardPasteAction', 'editor.paste'],
  ['editor.action.selectAll', 'editor.selectAll'],
  ['editor.action.quickCommand', 'editor.commandPalette'],
  ['editor.action.changeAll', 'editor.changeAll'],
  ['editor.action.formatDocument', 'editor.formatDocument'],
  ['editor.action.formatSelection', 'editor.formatSelection'],
  ['editor.action.revealDefinition', 'editor.goToDefinition'],
  ['editor.action.revealDefinitionAside', 'editor.peekDefinition'],
  ['editor.action.goToReferences', 'editor.goToReferences'],
  ['editor.action.peekReferences', 'editor.peekReferences'],
  ['editor.action.rename', 'editor.renameSymbol'],
  ['editor.action.refactor', 'editor.refactor'],
  ['editor.action.sourceAction', 'editor.sourceAction'],
  ['editor.action.organizeImports', 'editor.organizeImports'],
]

export function CodeEditor() {
  const activeFilePath = useEditorStore((s) => s.activeFilePath)
  const activeFile = useEditorStore((s) => s.openFiles.find((f) => f.path === s.activeFilePath))
  const updateFileContent = useEditorStore((s) => s.updateFileContent)
  const saveActiveFile = useEditorStore((s) => s.saveActiveFile)
  const computeLocalDiff = useEditorStore((s) => s.computeLocalDiff)
  const editorRef = useRef<any>(null)
  const t = useTranslation()
  const { locale } = useUIStore()
  const setPendingCodeRef = usePendingRefStore((s) => s.setPendingCodeRef)
  const tts = useTTS()

  const activeFilePathRef = useRef(activeFilePath)
  activeFilePathRef.current = activeFilePath
  const activeFileRef = useRef(activeFile)
  activeFileRef.current = activeFile

  const gitDiffInfo = useMemo(() => {
    if (!activeFilePath) return undefined
    return computeLocalDiff(activeFilePath)
  }, [activeFilePath, activeFile?.content, activeFile?.originalContent, computeLocalDiff])

  const handleEditorMount = useCallback((editor: any) => {
    editorRef.current = editor
    try {
      editor.addCommand(2048 | 49, () => void saveActiveFile())
    } catch (err) {
      console.error('[CodeEditor] addCommand error:', err)
    }

    editor.addAction({
      id: 'add-to-conversation',
      label: t('editor.addToConversation'),
      contextMenuGroupId: '9_cutcopypaste',
      contextMenuOrder: 2.5,
      precondition: 'editorHasSelection',
      run: () => {
        const file = activeFileRef.current
        if (!file || !activeFilePathRef.current) return
        const selection = editor.getSelection()!
        setPendingCodeRef({
          filePath: activeFilePathRef.current,
          fileName: file.name,
          startLine: selection.startLineNumber,
          endLine: selection.endLineNumber,
        })
      },
    })
  }, [saveActiveFile, setPendingCodeRef, t])

  const handleChange = useCallback((value: string | undefined) => {
    if (activeFilePath && value !== undefined) {
      updateFileContent(activeFilePath, value)
    }
  }, [activeFilePath, updateFileContent])

  useEffect(() => {
    if (editorRef.current && activeFilePath) {
      applyGitDecorations(editorRef.current, gitDiffInfo)
    }
  }, [gitDiffInfo, activeFilePath])

  useEffect(() => {
    const editor = editorRef.current
    if (!editor) return

    const svc = (monacoEditor as any).editor?._standaloneKeybindingService
    const globalActions: Map<string, any> | undefined = svc?._actions
    const editorActions: Map<string, any> | undefined = (editor as any)._actions
    const actions = globalActions ?? editorActions
    if (!actions) return

    for (const [actionId, i18nKey] of CONTEXT_MENU_PATCHES) {
      const act = actions.get(actionId)
      if (!act) continue
      const label = t(i18nKey as any)
      try {
        act._label = label
        act.label = label
      } catch {
        try { Object.defineProperty(act, '_label', { value: label, writable: true, configurable: true }) } catch {}
        try { Object.defineProperty(act, 'label', { value: label, writable: true, configurable: true }) } catch {}
      }
    }

    const customAct = actions.get('add-to-conversation')
    if (customAct) {
      const label = t('editor.addToConversation')
      try {
        customAct._label = label
        customAct.label = label
      } catch {
        try { Object.defineProperty(customAct, '_label', { value: label, writable: true, configurable: true }) } catch {}
        try { Object.defineProperty(customAct, 'label', { value: label, writable: true, configurable: true }) } catch {}
      }
    }
  }, [locale, t])

  useEffect(() => {
    const editor = editorRef.current
    if (!editor || !activeFile) return
    const model = editor.getModel()
    if (!model) return
    const lang = activeFile.language
    const currentLang = model.getLanguageId()
    if (currentLang === lang) return
    monacoEditor.editor.setModelLanguage(model, lang)
  }, [activeFile])

  const [mdViewMode, setMdViewMode] = useState<'edit' | 'preview' | 'split'>('split')

  if (!activeFile) {
    return (
      <div className="flex flex-col items-center justify-center h-full bg-[var(--color-surface)] text-[var(--color-text-tertiary)]">
        <span className="material-symbols-outlined text-[48px] mb-3">edit_note</span>
        <p className="text-sm">{t('editor.noFileOpen')}</p>
        <p className="text-xs mt-1">{t('editor.selectFileHint')}</p>
      </div>
    )
  }

  if (activeFile.fileType === 'image' && activeFile.previewUrl) {
    return <ImagePreview src={activeFile.previewUrl} alt={activeFile.name} />
  }

  if (activeFile.fileType === 'pdf' && activeFile.previewUrl) {
    return (
      <div className="flex flex-col h-full bg-[var(--color-surface)]">
        <div className="flex items-center gap-2 px-3 py-1.5 bg-[var(--color-surface-container-low)] border-b border-[var(--color-border)]">
          <span className="material-symbols-outlined text-[14px] text-[var(--color-text-tertiary)]">picture_as_pdf</span>
          <span className="text-xs text-[var(--color-text-secondary)] truncate">{activeFile.name}</span>
          <span className="text-[10px] text-[var(--color-text-tertiary)] ml-auto">{t('editor.readOnly')}</span>
        </div>
        <iframe
          src={activeFile.previewUrl}
          title={activeFile.name}
          className="flex-1 w-full border-0"
        />
      </div>
    )
  }

  if (activeFile.fileType === 'binary') {
    return (
      <div className="flex flex-col items-center justify-center h-full bg-[var(--color-surface)] text-[var(--color-text-tertiary)]">
        <span className="material-symbols-outlined text-[48px] mb-3 text-[var(--color-warning)]">warning</span>
        <p className="text-sm text-[var(--color-text-secondary)] px-8 text-center">{t('editor.binaryFileHint')}</p>
      </div>
    )
  }

  if ((activeFile.fileType === 'docx' || activeFile.fileType === 'xlsx' || activeFile.fileType === 'pptx') && activeFile.tooLarge) {
    return (
      <div className="flex flex-col items-center justify-center h-full bg-[var(--color-surface)] text-[var(--color-text-tertiary)]">
        <span className="material-symbols-outlined text-[48px] mb-3 text-[var(--color-warning)]">warning</span>
        <p className="text-sm text-[var(--color-text-secondary)]">{t('editor.fileTooLarge')}</p>
        <p className="text-xs mt-1">{t('editor.useOfficeTool')}</p>
      </div>
    )
  }

  if (activeFile.fileType === 'docx' && activeFile.previewUrl) {
    return <div className="h-full"><DocxPreview url={activeFile.previewUrl} fileName={activeFile.name} /></div>
  }

  if (activeFile.fileType === 'xlsx' && activeFile.previewUrl) {
    return <div className="h-full"><XlsxPreview url={activeFile.previewUrl} fileName={activeFile.name} /></div>
  }

  if (activeFile.fileType === 'pptx' && activeFile.previewUrl) {
    return <div className="h-full"><PptxPreview url={activeFile.previewUrl} fileName={activeFile.name} /></div>
  }

  // Markdown preview
  if (activeFile.fileType === 'markdown') {
    const modeButtons: Array<{ mode: 'edit' | 'preview' | 'split'; icon: string; label: string }> = [
      { mode: 'edit', icon: 'edit_note', label: t('editor.mdEdit') },
      { mode: 'preview', icon: 'visibility', label: t('editor.mdPreview') },
      { mode: 'split', icon: 'vertical_split', label: t('editor.mdSplit') },
    ]

    // 提取纯文本（去除 markdown 语法）
    const plainText = activeFile.content
      .replace(/```[\s\S]*?```/g, '')             // 移除代码块
      .replace(/^#+\s*/gm, '')                     // 移除标题标记
      .replace(/[*_~`]/g, '')                      // 移除强调/删除线/行内代码
      .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')     // 链接只保留文字
      .replace(/!\[([^\]]*)\]\([^)]*\)/g, '$1')    // 图片保留 alt 文字
      .replace(/[>\-|]/gm, '')                     // 移除引用/列表/表格符号
      .replace(/\n{3,}/g, '\n\n')                  // 合并多余空行
      .trim()

    return (
      <div className="flex flex-col h-full bg-[var(--color-surface)]">
        {/* Toolbar */}
        <div className="shrink-0 flex items-center gap-1 px-2 py-1 bg-[var(--color-surface-container-low)] border-b border-[var(--color-border)]">
          <span className="material-symbols-outlined text-[14px] text-[var(--color-text-tertiary)] mr-1">description</span>
          <span className="text-[11px] text-[var(--color-text-tertiary)] truncate max-w-[200px]">{activeFile.name}</span>
          <div className="flex items-center gap-0.5 ml-auto bg-[var(--color-surface-container)] rounded-md p-0.5">
            {modeButtons.map(({ mode, icon, label }) => (
              <Tooltip key={mode} content={label}>
                <button
                  onClick={() => setMdViewMode(mode)}
                  className={`flex items-center gap-1 px-2 py-0.5 rounded text-[11px] transition-colors
                    ${mdViewMode === mode
                      ? 'bg-[var(--color-surface)] text-[var(--color-text-primary)] shadow-sm'
                      : 'text-[var(--color-text-tertiary)] hover:text-[var(--color-text-secondary)]'
                    }`}
                >
                  <span className="material-symbols-outlined text-[14px]">{icon}</span>
                  <span className="hidden sm:inline">{label}</span>
                </button>
              </Tooltip>
            ))}
          </div>
          {/* AI 朗读 */}
          <Tooltip content={tts.isPlaying ? t('editor.ttsStop') : t('editor.ttsRead')}>
            <button
              onClick={() => tts.isPlaying ? tts.stop() : tts.speak(plainText)}
              disabled={!plainText || tts.isLoading}
              className={`flex items-center gap-1 px-2 py-0.5 rounded text-[11px] transition-colors ml-1
                ${tts.isPlaying
                  ? 'bg-[var(--color-brand)]/10 text-[var(--color-brand)]'
                  : 'text-[var(--color-text-tertiary)] hover:bg-[var(--color-surface-container)] hover:text-[var(--color-text-secondary)]'
                } disabled:opacity-30`}
            >
              <span className="material-symbols-outlined text-[14px]">{tts.isPlaying ? 'stop' : 'record_voice_over'}</span>
              {tts.isPlaying && tts.progress.total > 1 && (
                <span className="text-[10px] tabular-nums">{tts.progress.current}/{tts.progress.total}</span>
              )}
            </button>
          </Tooltip>
          {activeFile.isDirty && (
            <button
              onClick={() => void saveActiveFile()}
              className="flex items-center gap-1 px-2 py-0.5 rounded text-[11px] bg-[var(--color-brand)] text-[var(--color-btn-primary-fg)] hover:opacity-90 transition-colors ml-2"
            >
              <span className="material-symbols-outlined text-[12px]">save</span>
              {t('common.save')}
            </button>
          )}
        </div>

        {/* Content area */}
        <div className="flex-1 flex min-h-0 overflow-hidden">
          {(mdViewMode === 'edit' || mdViewMode === 'split') && (
            <div className={`${mdViewMode === 'split' ? 'w-1/2' : 'flex-1'} flex flex-col min-w-0 border-r border-[var(--color-border)]`}>
              <Suspense
                fallback={
                  <div className="flex items-center justify-center h-full bg-[var(--color-surface)] text-[var(--color-text-tertiary)]">
                    <span className="text-sm">{t('editor.loading')}</span>
                  </div>
                }
              >
                <Editor
                  key="md-editor"
                  height="100%"
                  path={activeFile.path}
                  language="markdown"
                  value={activeFile.content}
                  onChange={handleChange}
                  onMount={handleEditorMount}
                  saveViewState={true}
                  keepCurrentModel={true}
                  theme="vs-dark"
                  loading={
                    <div className="flex items-center justify-center h-full bg-[var(--color-surface)] text-[var(--color-text-tertiary)]">
                      <span className="text-sm">{t('editor.loading')}</span>
                    </div>
                  }
                  options={{
                    fontSize: 13,
                    lineHeight: 20,
                    fontFamily: "'JetBrains Mono', 'Fira Code', 'Cascadia Code', Menlo, Monaco, 'Courier New', monospace",
                    fontLigatures: true,
                    minimap: { enabled: false },
                    scrollBeyondLastLine: false,
                    wordWrap: 'off',
                    automaticLayout: true,
                    padding: { top: 8 },
                    renderLineHighlight: 'none',
                    smoothScrolling: true,
                    cursorBlinking: 'smooth',
                    glyphMargin: false,
                    folding: true,
                    lineNumbers: 'on',
                    lineNumbersMinChars: 4,
                  }}
                />
              </Suspense>
            </div>
          )}

          {(mdViewMode === 'preview' || mdViewMode === 'split') && (
            <div className={`${mdViewMode === 'split' ? 'w-1/2' : 'flex-1'} overflow-y-auto p-6 min-w-0`}>
              <MarkdownRenderer content={activeFile.content} />
            </div>
          )}
        </div>
      </div>
    )
  }

  return (
    <Suspense
      fallback={
        <div className="flex items-center justify-center h-full bg-[var(--color-surface)] text-[var(--color-text-tertiary)]">
          <span className="text-sm">{t('editor.loading')}</span>
        </div>
      }
    >
        <Editor
          key="shared-editor"
          height="100%"
          path={activeFile.path}
          language={activeFile.language}
          value={activeFile.content}
          onChange={handleChange}
          onMount={handleEditorMount}
          saveViewState={true}
          keepCurrentModel={true}
          theme="vs-dark"
          loading={
            <div className="flex items-center justify-center h-full bg-[var(--color-surface)] text-[var(--color-text-tertiary)]">
              <span className="text-sm">{t('editor.loading')}</span>
            </div>
          }
          options={{
            fontSize: 13,
            lineHeight: 20,
            fontFamily: "'JetBrains Mono', 'Fira Code', 'Cascadia Code', Menlo, Monaco, 'Courier New', monospace",
            fontLigatures: true,
            minimap: { enabled: false },
            scrollBeyondLastLine: false,
            wordWrap: 'off',
            automaticLayout: true,
            padding: { top: 8 },
            renderLineHighlight: 'none',
            smoothScrolling: true,
            cursorBlinking: 'smooth',
            bracketPairColorization: { enabled: true },
            guides: { bracketPairs: true, indentation: true },
            glyphMargin: false,
            folding: false,
            lineNumbers: 'on',
            lineNumbersMinChars: 4,
          }}
        />
    </Suspense>
  )
}
