/**
 * SkillsSettings — 技能设置
 *
 * 严格复刻 smart-code SkillDetail：
 * - 列表视图：顶部统计卡片 + 技能列表
 * - 详情视图：返回按钮 + 元信息 + 文件树 + 文件预览
 */

import { useState, useEffect, useMemo, useCallback } from 'react'
import { skillsApi, type SkillMeta, type SkillFileNode, type SkillFileEntry, type SkillFullDetail } from '../../api/features'
import { useTranslation } from '../../i18n'
import { MarkdownRenderer } from '../markdown/MarkdownRenderer'
import { CodeViewer } from '../shared/CodeViewer'

// ─── 文件树节点组件 ──────────────────────────────────────────

function FileTreeNode({
  node,
  depth,
  selectedPath,
  expandedDirs,
  onSelect,
  onToggle,
}: {
  node: SkillFileNode
  depth: number
  selectedPath: string | null
  expandedDirs: Set<string>
  onSelect: (path: string) => void
  onToggle: (path: string) => void
}) {
  const isDir = node.type === 'directory'
  const isExpanded = expandedDirs.has(node.path)
  const isSelected = selectedPath === node.path

  if (isDir) {
    return (
      <div>
        <button
          onClick={() => onToggle(node.path)}
          className="flex items-center gap-1.5 w-full px-2 py-1 text-left text-xs hover:bg-[var(--color-surface-hover)] rounded transition-colors"
          style={{ paddingLeft: `${depth * 12 + 8}px` }}
        >
          <svg
            width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor"
            strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
            className={`text-[var(--color-text-tertiary)] transition-transform ${isExpanded ? 'rotate-90' : ''}`}
          >
            <polyline points="9 18 15 12 9 6" />
          </svg>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-[var(--color-warning)] flex-shrink-0">
            <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" />
          </svg>
          <span className="text-[var(--color-text-secondary)] truncate">{node.name}</span>
        </button>
        {isExpanded && node.children && (
          <div>
            {node.children.map((child) => (
              <FileTreeNode
                key={child.path}
                node={child}
                depth={depth + 1}
                selectedPath={selectedPath}
                expandedDirs={expandedDirs}
                onSelect={onSelect}
                onToggle={onToggle}
              />
            ))}
          </div>
        )}
      </div>
    )
  }

  return (
    <button
      onClick={() => onSelect(node.path)}
      className={`flex items-center gap-1.5 w-full px-2 py-1 text-left text-xs rounded transition-colors ${
        isSelected
          ? 'bg-[var(--color-brand)]/10 text-[var(--color-brand)]'
          : 'hover:bg-[var(--color-surface-hover)] text-[var(--color-text-secondary)]'
      }`}
      style={{ paddingLeft: `${depth * 12 + 8}px` }}
    >
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-[var(--color-text-tertiary)] flex-shrink-0">
        <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
        <polyline points="14 2 14 8 20 8" />
      </svg>
      <span className="truncate">{node.name}</span>
    </button>
  )
}

// ─── 主组件 ──────────────────────────────────────────────────

export function SkillsSettings() {
  const t = useTranslation()
  const [skills, setSkills] = useState<SkillMeta[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [importing, setImporting] = useState(false)
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null)

  // Detail state
  const [detail, setDetail] = useState<SkillFullDetail | null>(null)
  const [isDetailLoading, setIsDetailLoading] = useState(false)
  const [selectedFile, setSelectedFile] = useState<SkillFileEntry | null>(null)
  const [fileContent, setFileContent] = useState<string>('')
  const [fileLanguage, setFileLanguage] = useState<string>('text')
  const [isFileLoading, setIsFileLoading] = useState(false)
  const [expandedDirs, setExpandedDirs] = useState<Set<string>>(new Set())

  const fetchSkills = async () => {
    setIsLoading(true)
    try {
      const data = await skillsApi.list()
      setSkills(data.skills)
    } catch {
      setSkills([])
    } finally {
      setIsLoading(false)
    }
  }

  useEffect(() => {
    void fetchSkills()
  }, [])

  const handleImport = async () => {
    try {
      const { open } = await import('@tauri-apps/plugin-dialog')
      const selected = await open({
        multiple: false,
        filters: [{ name: 'Zip', extensions: ['zip'] }],
        title: t('settings.skills.import'),
      })
      if (typeof selected !== 'string') return

      setImporting(true)
      const result = await skillsApi.import(selected)
      setMessage({ type: 'success', text: result.message || t('settings.skills.importSuccess') })
      await fetchSkills()
    } catch (err) {
      setMessage({ type: 'error', text: err instanceof Error ? err.message : t('settings.skills.importFailed') })
    } finally {
      setImporting(false)
    }
  }

  const handleSkillClick = async (skill: SkillMeta) => {
    setIsDetailLoading(true)
    try {
      // 优先使用 dirName（磁盘目录名），避免 name 含特殊字符导致查找失败
      // 如果 dirName 不存在（服务端未重启），从 basePath 中提取目录名
      let skillId = skill.dirName || skill.name
      if (!skill.dirName && skill.basePath) {
        // 从 basePath 提取最后一段作为目录名
        const parts = skill.basePath.replace(/[\\/]+$/, '').split(/[\\/]/)
        skillId = parts[parts.length - 1] || skill.name
      }
      console.log('[SkillsSettings] handleSkillClick: skillId =', skillId, 'skill =', skill)
      const data = await skillsApi.detail(skillId)
      console.log('[SkillsSettings] detail response:', data)
      // 兼容两种响应格式：
      // 新格式: { meta, tree, files, skillRoot }
      // 旧格式: { skill: { name, description, content, ... } }
      const detailData = data as any
      if (detailData?.meta) {
        // 新格式（服务端已重启）
        setDetail(detailData)
        const skillMd = detailData.files?.find((f: any) => f.name === 'SKILL.md')
        if (skillMd) {
          setSelectedFile(skillMd)
          await loadFileContent(detailData.meta.dirName || detailData.meta.name, skillMd.path)
        }
      } else if (detailData?.skill) {
        // 旧格式（服务端未重启，/detail 端点不存在，回退到 /:name）
        const s = detailData.skill
        const fallbackDetail = {
          meta: {
            name: s.name,
            description: s.description,
            source: s.source,
            userInvocable: s.userInvocable,
            tokenEstimate: s.tokenEstimate,
            basePath: s.basePath || '',
            dirName: s.dirName,
          },
          tree: [],
          files: [{ path: 'SKILL.md', name: 'SKILL.md', size: s.content?.length || 0, language: 'markdown' }],
          skillRoot: '',
        }
        setDetail(fallbackDetail)
        setSelectedFile(fallbackDetail.files[0])
        setFileContent(s.content || '')
        setFileLanguage('markdown')
      } else {
        throw new Error('Invalid skill detail response')
      }
    } catch (err) {
      console.log('[SkillsSettings] detail failed, trying fallback:', err)
      // 如果 detail 端点失败（如服务端未重启），尝试回退到旧的 get 端点
      try {
        // 使用与 try 块相同的 skillId 计算逻辑
        const fallback = await skillsApi.get(skillId)
        if (fallback?.skill) {
          const s = fallback.skill
          setDetail({
            meta: {
              name: s.name,
              description: s.description,
              source: s.source,
              userInvocable: s.userInvocable,
              tokenEstimate: s.tokenEstimate,
              basePath: '',
              dirName: s.dirName,
            },
            tree: [],
            files: [{ path: 'SKILL.md', name: 'SKILL.md', size: s.content?.length || 0, language: 'markdown' }],
            skillRoot: '',
          })
          setSelectedFile({ path: 'SKILL.md', name: 'SKILL.md', size: s.content?.length || 0, language: 'markdown' })
          setFileContent(s.content || '')
          setFileLanguage('markdown')
        } else {
          throw err
        }
      } catch {
        setMessage({ type: 'error', text: err instanceof Error ? err.message : 'Failed to load skill detail' })
      }
    } finally {
      setIsDetailLoading(false)
    }
  }

  const loadFileContent = async (skillName: string, filePath: string) => {
    setIsFileLoading(true)
    try {
      const data = await skillsApi.file(skillName, filePath)
      setFileContent(data.content)
      setFileLanguage(data.language)
    } catch {
      setFileContent('')
      setFileLanguage('text')
    } finally {
      setIsFileLoading(false)
    }
  }

  const handleBack = () => {
    setDetail(null)
    setSelectedFile(null)
    setFileContent('')
    setExpandedDirs(new Set())
  }

  const handleFileSelect = useCallback((filePath: string) => {
    if (!detail) return
    const file = detail.files.find(f => f.path === filePath)
    if (file) {
      setSelectedFile(file)
      // 使用 dirName 加载文件（更可靠）
      loadFileContent(detail.meta.dirName || detail.meta.name, filePath)
    }
  }, [detail])

  const handleDirToggle = useCallback((dirPath: string) => {
    setExpandedDirs(prev => {
      const next = new Set(prev)
      if (next.has(dirPath)) {
        next.delete(dirPath)
      } else {
        next.add(dirPath)
      }
      return next
    })
  }, [])

  // Statistics
  const stats = useMemo(() => {
    const sources = new Set(skills.map(s => s.source))
    const totalTokens = skills.reduce((sum, s) => sum + (s.tokenEstimate || 0), 0)
    return {
      total: skills.length,
      sources: sources.size,
      tokens: totalTokens,
    }
  }, [skills])

  const sourceLabels: Record<SkillMeta['source'], string> = {
    builtin: t('settings.skills.sourceBuiltin'),
    user: t('settings.skills.sourceUser'),
    project: t('settings.skills.sourceProject'),
  }

  // ─── Detail view ───────────────────────────────────────────

  if (detail && detail.meta) {
    const isMarkdown = selectedFile?.language === 'markdown'

    return (
      <div className="w-full">
        {/* Back button */}
        <button
          onClick={handleBack}
          className="flex items-center gap-1.5 text-sm text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)] mb-4 transition-colors"
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="15 18 9 12 15 6" />
          </svg>
          {t('settings.skills.back')}
        </button>

        {/* Header */}
        <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface-container-low)] p-5 mb-4">
          <div className="flex items-start gap-3">
            <span className="flex h-12 w-12 items-center justify-center rounded-xl bg-[var(--color-brand)]/10 text-[var(--color-brand)] flex-shrink-0">
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M12 2l3 7 7 3-7 3-3 7-3-7-7-3 7-3 3-7z" />
              </svg>
            </span>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 mb-1">
                <h2 className="text-lg font-semibold text-[var(--color-text-primary)]">{detail.meta.name}</h2>
                <span className="px-2 py-0.5 text-[10px] font-medium rounded bg-[var(--color-surface-container-high)] text-[var(--color-text-tertiary)] leading-none">
                  {sourceLabels[detail.meta.source]}
                </span>
              </div>
              <p className="text-sm text-[var(--color-text-secondary)]">{detail.meta.description}</p>
            </div>
          </div>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-3 gap-3 mb-4">
          <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface-container-low)] p-4">
            <div className="flex items-center gap-2 mb-1">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-[var(--color-brand)]">
                <path d="M12 2l3 7 7 3-7 3-3 7-3-7-7-3 7-3 3-7z" />
              </svg>
              <span className="text-[11px] text-[var(--color-text-tertiary)] uppercase tracking-wider">{t('settings.skills.tokens')}</span>
            </div>
            <div className="text-lg font-bold text-[var(--color-text-primary)]">
              ~{detail.meta.tokenEstimate?.toLocaleString() || '—'}
            </div>
          </div>
          <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface-container-low)] p-4">
            <div className="flex items-center gap-2 mb-1">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-[var(--color-success)]">
                <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
                <circle cx="12" cy="7" r="4" />
              </svg>
              <span className="text-[11px] text-[var(--color-text-tertiary)] uppercase tracking-wider">{t('settings.skills.source')}</span>
            </div>
            <div className="text-lg font-bold text-[var(--color-text-primary)]">
              {sourceLabels[detail.meta.source]}
            </div>
          </div>
          <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface-container-low)] p-4">
            <div className="flex items-center gap-2 mb-1">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-[var(--color-warning)]">
                <polyline points="20 6 9 17 4 12" />
              </svg>
              <span className="text-[11px] text-[var(--color-text-tertiary)] uppercase tracking-wider">{t('settings.skills.invocable')}</span>
            </div>
            <div className="text-lg font-bold text-[var(--color-text-primary)]">
              {detail.meta.userInvocable ? t('settings.skills.yes') : t('settings.skills.no')}
            </div>
          </div>
        </div>

        {/* File tree + File preview */}
        <div className="flex gap-4 min-h-[400px]">
          {/* File tree */}
          <div className="w-[240px] flex-shrink-0 rounded-xl border border-[var(--color-border)] bg-[var(--color-surface-container-low)] overflow-hidden">
            <div className="px-3 py-2 border-b border-[var(--color-border)] bg-[var(--color-surface-container)]">
              <h3 className="text-xs font-medium text-[var(--color-text-primary)]">
                {t('settings.skills.fileList')} ({detail.files.length})
              </h3>
            </div>
            <div className="p-2 max-h-[500px] overflow-y-auto">
              {detail.tree.map((node) => (
                <FileTreeNode
                  key={node.path}
                  node={node}
                  depth={0}
                  selectedPath={selectedFile?.path ?? null}
                  expandedDirs={expandedDirs}
                  onSelect={handleFileSelect}
                  onToggle={handleDirToggle}
                />
              ))}
            </div>
          </div>

          {/* File preview */}
          <div className="flex-1 min-w-0 rounded-xl border border-[var(--color-border)] bg-[var(--color-surface-container-low)] overflow-hidden">
            {selectedFile ? (
              <>
                <div className="px-4 py-2 border-b border-[var(--color-border)] bg-[var(--color-surface-container)] flex items-center gap-2">
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-[var(--color-text-tertiary)]">
                    <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                    <polyline points="14 2 14 8 20 8" />
                  </svg>
                  <span className="text-xs text-[var(--color-text-secondary)] font-mono">{selectedFile.path}</span>
                  <span className="ml-auto text-[10px] text-[var(--color-text-tertiary)]">
                    {selectedFile.size > 1024
                      ? `${(selectedFile.size / 1024).toFixed(1)} KB`
                      : `${selectedFile.size} B`}
                  </span>
                </div>
                <div className="p-4 max-h-[500px] overflow-y-auto">
                  {isFileLoading ? (
                    <div className="flex justify-center py-8">
                      <div className="animate-spin w-5 h-5 border-2 border-[var(--color-brand)] border-t-transparent rounded-full" />
                    </div>
                  ) : isMarkdown ? (
                    <MarkdownRenderer content={fileContent} />
                  ) : (
                    <CodeViewer
                      code={fileContent}
                      language={fileLanguage}
                      filename={selectedFile.name}
                    />
                  )}
                </div>
              </>
            ) : (
              <div className="flex items-center justify-center h-full text-sm text-[var(--color-text-tertiary)]">
                {t('settings.skills.selectFile')}
              </div>
            )}
          </div>
        </div>
      </div>
    )
  }

  // ─── List view ─────────────────────────────────────────────

  return (
    <div className="w-full">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h2 className="text-base font-semibold text-[var(--color-text-primary)]">{t('settings.skills.title')}</h2>
          <p className="text-sm text-[var(--color-text-tertiary)] mt-0.5">{t('settings.skills.desc')}</p>
        </div>
        <button
          onClick={handleImport}
          disabled={importing}
          className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg text-[var(--color-btn-primary-fg)] transition-all hover:brightness-105 disabled:opacity-50"
          style={{ background: 'var(--gradient-btn-primary)', boxShadow: 'var(--shadow-button-primary)' }}
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
            <polyline points="17 8 12 3 7 8" />
            <line x1="12" y1="3" x2="12" y2="15" />
          </svg>
          {importing ? t('settings.skills.importing') : t('settings.skills.import')}
        </button>
      </div>

      {message && (
        <div className={`mb-4 rounded-lg border px-3 py-2 text-xs ${
          message.type === 'success'
            ? 'border-[var(--color-success)]/20 bg-[var(--color-success)]/5 text-[var(--color-success)]'
            : 'border-[var(--color-error)]/20 bg-[var(--color-error)]/5 text-[var(--color-error)]'
        }`}>
          {message.text}
        </div>
      )}

      {/* Statistics */}
      {!isLoading && skills.length > 0 && (
        <div className="grid grid-cols-3 gap-3 mb-4">
          <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface-container-low)] p-4">
            <div className="text-[11px] text-[var(--color-text-tertiary)] uppercase tracking-wider mb-1">
              {t('settings.skills.totalSkills')}
            </div>
            <div className="text-lg font-bold text-[var(--color-text-primary)]">{stats.total}</div>
          </div>
          <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface-container-low)] p-4">
            <div className="text-[11px] text-[var(--color-text-tertiary)] uppercase tracking-wider mb-1">
              {t('settings.skills.totalSources')}
            </div>
            <div className="text-lg font-bold text-[var(--color-text-primary)]">{stats.sources}</div>
          </div>
          <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface-container-low)] p-4">
            <div className="text-[11px] text-[var(--color-text-tertiary)] uppercase tracking-wider mb-1">
              {t('settings.skills.totalTokens')}
            </div>
            <div className="text-lg font-bold text-[var(--color-text-primary)]">~{stats.tokens.toLocaleString()}</div>
          </div>
        </div>
      )}

      {isLoading ? (
        <div className="flex justify-center py-8">
          <div className="animate-spin w-5 h-5 border-2 border-[var(--color-brand)] border-t-transparent rounded-full" />
        </div>
      ) : skills.length === 0 ? (
        <div className="rounded-xl border border-dashed border-[var(--color-border)] bg-[var(--color-surface-container-low)] px-6 py-10 text-center">
          <p className="text-sm text-[var(--color-text-tertiary)]">{t('settings.skills.empty')}</p>
        </div>
      ) : (
        <div className="flex flex-col gap-2">
          {skills.map((skill) => (
            <button
              key={skill.name}
              onClick={() => handleSkillClick(skill)}
              disabled={isDetailLoading}
              className="flex items-center gap-3 px-4 py-3 rounded-xl border border-[var(--color-border)] bg-[var(--color-surface-container-low)] hover:border-[var(--color-brand)]/40 hover:bg-[var(--color-surface-container)] transition-all text-left w-full disabled:opacity-50"
            >
              <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-[var(--color-surface-container-high)] text-[var(--color-brand)] flex-shrink-0">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M12 2l3 7 7 3-7 3-3 7-3-7-7-3 7-3 3-7z" />
                </svg>
              </span>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-medium text-[var(--color-text-primary)] truncate">{skill.name}</span>
                  <span className="px-1.5 py-0.5 text-[10px] font-medium rounded bg-[var(--color-surface-container-high)] text-[var(--color-text-tertiary)] leading-none">
                    {sourceLabels[skill.source]}
                  </span>
                </div>
                <div className="text-xs text-[var(--color-text-tertiary)] truncate mt-0.5">{skill.description}</div>
              </div>
              <div className="flex items-center gap-2 flex-shrink-0">
                {skill.tokenEstimate && (
                  <span className="text-[10px] text-[var(--color-text-tertiary)]">~{skill.tokenEstimate} tokens</span>
                )}
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-[var(--color-text-tertiary)]">
                  <polyline points="9 18 15 12 9 6" />
                </svg>
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
