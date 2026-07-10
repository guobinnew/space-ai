/**
 * Tasks API — 任务清单持久化读取
 */

const BASE_URL = 'http://127.0.0.1:3721'

export const tasksApi = {
  /** 加载会话的持久化任务清单 */
  async load(sessionId: string): Promise<{ tasks: { content: string; status: string; activeForm: string }[] }> {
    const res = await fetch(`${BASE_URL}/api/tasks/${sessionId}`)
    if (!res.ok) throw new Error(`Failed to load tasks: ${res.status}`)
    return res.json()
  },

  /** 删除会话的任务文件 */
  async clear(sessionId: string): Promise<void> {
    await fetch(`${BASE_URL}/api/tasks/${sessionId}`, { method: 'DELETE' })
  },
}
