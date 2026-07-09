/**
 * FileExplorer — 文件树浏览器
 *
 * 参照 smart-code editor/FileExplorer，简化版。
 * 递归显示目录树，支持展开/折叠，点击文件触发 onFileOpen。
 */

import { useState, useEffect, useCallback } from 'react';
import { filesystemApi, type DirEntry } from '../../api/filesystem';

type Props = {
  rootPath: string;
  onFileOpen: (filePath: string, fileName: string) => void;
  activeFilePath?: string;
};

type TreeNode = DirEntry & {
  children?: DirEntry[];
  loaded?: boolean;
  loading?: boolean;
};

export function FileExplorer({ rootPath, onFileOpen, activeFilePath }: Props) {
  const [tree, setTree] = useState<TreeNode[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [expandedPaths, setExpandedPaths] = useState<Set<string>>(new Set());

  // Load root directory
  const loadDir = useCallback(async (dirPath: string): Promise<DirEntry[]> => {
    const data = await filesystemApi.list(dirPath);
    return data.entries;
  }, []);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    loadDir(rootPath)
      .then((entries) => {
        if (cancelled) return;
        setTree(entries.map((e) => ({ ...e, loaded: !e.isDirectory })));
      })
      .catch((err) => {
        if (cancelled) return;
        setError(err instanceof Error ? err.message : '加载失败');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => { cancelled = true; };
  }, [rootPath, loadDir]);

  const toggleExpand = useCallback(async (entry: TreeNode) => {
    const path = entry.path;
    setExpandedPaths((prev) => {
      const next = new Set(prev);
      if (next.has(path)) {
        next.delete(path);
      } else {
        next.add(path);
      }
      return next;
    });

    // Lazy load children if not loaded
    if (entry.isDirectory && !entry.loaded && !entry.loading) {
      // Mark as loading
      setTree((prev) => updateNode(prev, entry.path, (n) => ({ ...n, loading: true })));

      try {
        const children = await loadDir(entry.path);
        setTree((prev) => updateNode(prev, entry.path, (n) => ({
          ...n,
          children,
          loaded: true,
          loading: false,
        })));
      } catch {
        setTree((prev) => updateNode(prev, entry.path, (n) => ({ ...n, loading: false })));
      }
    }
  }, [loadDir]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-8">
        <div className="animate-spin w-4 h-4 border-2 border-[var(--color-brand)] border-t-transparent rounded-full" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="px-3 py-4 text-xs text-[var(--color-error)] text-center">
        {error}
      </div>
    );
  }

  if (tree.length === 0) {
    return (
      <div className="px-3 py-4 text-xs text-[var(--color-text-tertiary)] text-center">
        空目录
      </div>
    );
  }

  return (
    <div className="py-1">
      {tree.map((node) => (
        <TreeItem
          key={node.path}
          node={node}
          depth={0}
          expandedPaths={expandedPaths}
          onToggle={toggleExpand}
          onFileOpen={onFileOpen}
          activeFilePath={activeFilePath}
        />
      ))}
    </div>
  );
}

function TreeItem({
  node,
  depth,
  expandedPaths,
  onToggle,
  onFileOpen,
  activeFilePath,
}: {
  node: TreeNode;
  depth: number;
  expandedPaths: Set<string>;
  onToggle: (node: TreeNode) => void;
  onFileOpen: (filePath: string, fileName: string) => void;
  activeFilePath?: string;
}) {
  const isExpanded = expandedPaths.has(node.path);
  const isActive = activeFilePath === node.path;

  return (
    <div>
      <button
        onClick={() => {
          if (node.isDirectory) {
            onToggle(node);
          } else {
            onFileOpen(node.path, node.name);
          }
        }}
        className={`flex items-center gap-1 w-full px-2 py-0.5 text-left text-xs transition-colors hover:bg-[var(--color-surface-hover)] ${
          isActive ? 'bg-[var(--color-brand)]/10 text-[var(--color-brand)]' : 'text-[var(--color-text-secondary)]'
        }`}
        style={{ paddingLeft: `${depth * 12 + 8}px` }}
      >
        {node.isDirectory ? (
          <>
            <svg
              width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"
              className="flex-shrink-0 text-[var(--color-text-tertiary)] transition-transform"
              style={{ transform: isExpanded ? 'rotate(90deg)' : 'none' }}
            >
              <polyline points="9 18 15 12 9 6" />
            </svg>
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="flex-shrink-0 text-[var(--color-text-tertiary)]">
              <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" />
            </svg>
          </>
        ) : (
          <>
            <span className="w-[10px] flex-shrink-0" />
            <FileIcon name={node.name} />
          </>
        )}
        <span className="truncate">{node.name}</span>
        {node.loading && (
          <span className="ml-auto animate-spin w-3 h-3 border border-[var(--color-text-tertiary)] border-t-transparent rounded-full" />
        )}
      </button>

      {node.isDirectory && isExpanded && node.children && (
        <div>
          {node.children.map((child) => (
            <TreeItem
              key={child.path}
              node={{ ...child, loaded: !child.isDirectory }}
              depth={depth + 1}
              expandedPaths={expandedPaths}
              onToggle={onToggle}
              onFileOpen={onFileOpen}
              activeFilePath={activeFilePath}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function FileIcon({ name }: { name: string }) {
  const ext = name.split('.').pop()?.toLowerCase() || '';
  const color = getFileIconColor(ext);
  return (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="flex-shrink-0">
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
      <polyline points="14 2 14 8 20 8" />
    </svg>
  );
}

function getFileIconColor(ext: string): string {
  if (['ts', 'tsx', 'js', 'jsx', 'mjs', 'cjs'].includes(ext)) return '#3178c6';
  if (['json'].includes(ext)) return '#cbcb41';
  if (['css', 'scss', 'less'].includes(ext)) return '#42a5f5';
  if (['html', 'htm'].includes(ext)) return '#e44d26';
  if (['md', 'markdown'].includes(ext)) return '#519aba';
  if (['py'].includes(ext)) return '#3572A5';
  if (['rs'].includes(ext)) return '#dea584';
  if (['go'].includes(ext)) return '#00ADD8';
  if (['vue'].includes(ext)) return '#41b883';
  return 'var(--color-text-tertiary)';
}

/** 递归更新树中的某个节点 */
function updateNode(nodes: TreeNode[], targetPath: string, updater: (n: TreeNode) => TreeNode): TreeNode[] {
  return nodes.map((n) => {
    if (n.path === targetPath) return updater(n);
    if (n.children) return { ...n, children: updateNode(n.children, targetPath, updater) };
    return n;
  });
}
