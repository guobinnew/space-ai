/**
 * EditorPanel — 编辑器面板
 *
 * 参照 smart-code editor/EditorPanel，简化版。
 * 左侧文件树 + 右侧文件查看器。
 */

import { useState } from 'react';
import { FileExplorer } from './FileExplorer';
import { FileViewer } from './FileViewer';
import { useTranslation } from '../../i18n';

type Props = {
  rootPath: string;
};

export function EditorPanel({ rootPath }: Props) {
  const t = useTranslation();
  const [openFile, setOpenFile] = useState<{ path: string; name: string } | null>(null);

  return (
    <div className="flex h-full overflow-hidden">
      {/* File explorer sidebar */}
      <div className="w-[220px] flex-shrink-0 flex flex-col overflow-hidden border-r border-[var(--color-border)] bg-[var(--color-surface-container-lowest)]">
        <div className="flex items-center gap-1.5 px-3 py-2 border-b border-[var(--color-border)] flex-shrink-0">
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-[var(--color-text-tertiary)]">
            <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" />
          </svg>
          <span className="text-[10px] font-semibold text-[var(--color-text-tertiary)] uppercase tracking-wider truncate">
            {rootPath.split(/[\\/]/).pop() || t('editor.explorer')}
          </span>
        </div>
        <div className="flex-1 overflow-y-auto">
          <FileExplorer
            rootPath={rootPath}
            onFileOpen={(path, name) => setOpenFile({ path, name })}
            activeFilePath={openFile?.path}
          />
        </div>
      </div>

      {/* File viewer */}
      <div className="flex-1 min-w-0 overflow-hidden">
        {openFile ? (
          <FileViewer filePath={openFile.path} fileName={openFile.name} />
        ) : (
          <div className="flex flex-col items-center justify-center h-full text-center px-4">
            <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="text-[var(--color-text-quaternary)] mb-3">
              <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
              <polyline points="14 2 14 8 20 8" />
            </svg>
            <p className="text-xs text-[var(--color-text-tertiary)]">
              {t('editor.selectFile')}
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
