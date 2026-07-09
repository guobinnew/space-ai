/**
 * NotebookEditTool — Jupyter Notebook 编辑
 *
 * 参照 smart-code NotebookEditTool，简化版。
 * 操作 .ipynb 文件的 cells：replace/insert/delete。
 */

import * as fs from 'fs/promises'
import type { Tool, ToolResult, ToolInputJSONSchema } from './types'

export const NOTEBOOK_EDIT_TOOL_NAME = 'NotebookEdit'

const inputSchema: ToolInputJSONSchema = {
  type: 'object',
  properties: {
    notebook_path: {
      type: 'string',
      description: 'The absolute path to the Jupyter notebook file to edit (must be absolute, not relative)',
    },
    cell_id: {
      type: 'string',
      description: 'The ID of the cell to edit. When inserting a new cell, the new cell will be inserted after the cell with this ID, or at the beginning if not specified.',
    },
    new_source: {
      type: 'string',
      description: 'The new source for the cell',
    },
    cell_type: {
      type: 'string',
      enum: ['code', 'markdown'],
      description: 'The type of the cell (code or markdown). If not specified, defaults to the current cell type. Required when edit_mode=insert.',
    },
    edit_mode: {
      type: 'string',
      enum: ['replace', 'insert', 'delete'],
      description: 'The type of edit to make (replace, insert, delete). Defaults to replace.',
    },
  },
  required: ['notebook_path', 'new_source'],
}

interface NotebookCell {
  cell_type: 'code' | 'markdown'
  id: string
  source: string | string[]
  metadata?: Record<string, unknown>
  outputs?: unknown[]
  execution_count?: number | null
}

interface Notebook {
  cells: NotebookCell[]
  metadata: Record<string, unknown>
  nbformat: number
  nbformat_minor: number
}

export const notebookEditTool: Tool = {
  name: NOTEBOOK_EDIT_TOOL_NAME,
  description: `Completely replaces the contents of a specific cell in a Jupyter notebook (.ipynb file) with new source.

Jupyter notebooks are interactive documents that combine code, text, and visualizations, commonly used for data analysis and scientific computing.

- The notebook_path parameter must be an absolute path, not a relative path
- The cell_id identifies which cell to edit. When inserting, the new cell is inserted after the cell with this ID (or at the beginning if not specified)
- Use edit_mode=insert to add a new cell after the cell with the given cell_id
- Use edit_mode=delete to delete the cell with the given cell_id
- Use edit_mode=replace (default) to replace the cell's source`,
  inputSchema,
  async execute(input): Promise<ToolResult> {
    const notebookPath = input.notebook_path as string
    const newSource = input.new_source as string
    const cellId = input.cell_id as string | undefined
    const cellType = input.cell_type as 'code' | 'markdown' | undefined
    const editMode = (input.edit_mode as string) || 'replace'

    if (!notebookPath) {
      return { content: 'Error: notebook_path is required', isError: true }
    }
    if (newSource === undefined || newSource === null) {
      return { content: 'Error: new_source is required', isError: true }
    }

    try {
      const raw = await fs.readFile(notebookPath, 'utf-8')
      const notebook = JSON.parse(raw) as Notebook

      if (!Array.isArray(notebook.cells)) {
        return { content: 'Error: invalid notebook format (no cells array)', isError: true }
      }

      // Find cell index by cell_id
      let cellIndex = -1
      if (cellId) {
        cellIndex = notebook.cells.findIndex((c) => c.id === cellId)
        if (cellIndex === -1 && editMode !== 'insert') {
          return { content: `Error: cell with id "${cellId}" not found`, isError: true }
        }
      }

      // Convert source to array format (Jupyter uses string array, one per line)
      const sourceArray = newSource.split('\n').map((line, i, arr) =>
        i < arr.length - 1 ? line + '\n' : line,
      )

      if (editMode === 'delete') {
        if (cellIndex === -1) {
          return { content: 'Error: cell_id is required for delete mode', isError: true }
        }
        notebook.cells.splice(cellIndex, 1)
      } else if (editMode === 'insert') {
        if (!cellType) {
          return { content: 'Error: cell_type is required for insert mode', isError: true }
        }
        const newCell: NotebookCell = {
          cell_type: cellType,
          id: `cell-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
          source: sourceArray,
          metadata: {},
        }
        if (cellType === 'code') {
          newCell.outputs = []
          newCell.execution_count = null
        }
        // Insert after the cell with cell_id, or at the beginning if not specified
        const insertIndex = cellIndex >= 0 ? cellIndex + 1 : 0
        notebook.cells.splice(insertIndex, 0, newCell)
      } else {
        // replace (default)
        if (cellIndex === -1) {
          // If no cell_id, replace the last cell
          if (notebook.cells.length === 0) {
            return { content: 'Error: no cells to replace (notebook is empty)', isError: true }
          }
          cellIndex = notebook.cells.length - 1
        }
        notebook.cells[cellIndex].source = sourceArray
        if (cellType) {
          notebook.cells[cellIndex].cell_type = cellType
        }
      }

      await fs.writeFile(notebookPath, JSON.stringify(notebook, null, 1), 'utf-8')

      return {
        content: `Successfully edited notebook ${notebookPath} (${editMode} mode, ${notebook.cells.length} cells total)`,
      }
    } catch (err) {
      const code = (err as NodeJS.ErrnoException).code
      if (code === 'ENOENT') {
        return { content: `Notebook not found: ${notebookPath}`, isError: true }
      }
      const msg = err instanceof Error ? err.message : String(err)
      return { content: `Error editing notebook: ${msg}`, isError: true }
    }
  },
}
