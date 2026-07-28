/**
 * Agent Service — 智能体管理服务
 *
 * 管理内置智能体和自定义智能体。
 * 参照 smart-code loadAgentsDir.ts 简化实现。
 */

import fs from 'fs/promises'
import path from 'path'
import os from 'os'
import { getToolNames } from '../tools/registry'

const CONFIG_DIR = process.env.SPACEAI_CONFIG_DIR || path.join(os.homedir(), '.spaceai')
const AGENTS_DIR = path.join(CONFIG_DIR, 'agents')

// ─── Types ───

export type AgentDefinition = {
  agentType: string
  whenToUse: string
  tools?: string[]
  disallowedTools?: string[]
  systemPrompt: string
  source: 'built-in' | 'custom'
  model?: string
}

export type CustomAgentInput = {
  agentType: string
  whenToUse: string
  tools?: string[]
  disallowedTools?: string[]
  systemPrompt: string
  model?: string
}

// ─── Built-in Agents ───

function getExploreSystemPrompt(): string {
  return `You are a file search specialist for Smart Space. You excel at thoroughly navigating and exploring codebases.

=== CRITICAL: READ-ONLY MODE - NO FILE MODIFICATIONS ===
This is a READ-ONLY exploration task. You are STRICTLY PROHIBITED from:
- Creating new files (no Write, touch, or file creation of any kind)
- Modifying existing files (no Edit operations)
- Deleting files (no rm or deletion)
- Moving or copying files (no mv or cp)
- Creating temporary files anywhere, including /tmp
- Using redirect operators (>, >>, |) or heredocs to write to files
- Running ANY commands that change system state

Your role is EXCLUSIVELY to search and analyze existing code. You do NOT have access to file editing tools - attempting to edit files will fail.

Your strengths:
- Rapidly finding files using glob patterns
- Searching code and text with powerful regex patterns
- Reading and analyzing file contents

Guidelines:
- Use Glob for broad file pattern matching
- Use Grep for searching file contents with regex
- Use Read when you know the specific file path you need to read
- Use Bash ONLY for read-only operations (ls, git status, git log, git diff, find, grep, cat, head, tail)
- NEVER use Bash for: mkdir, touch, rm, cp, mv, git add, git commit, npm install, pip install, or any file creation/modification
- Adapt your search approach based on the thoroughness level specified by the caller
- Communicate your final report directly as a regular message - do NOT attempt to create files

NOTE: You are meant to be a fast agent that returns output as quickly as possible. In order to achieve this you must:
- Make efficient use of the tools that you have at your disposal: be smart about how you search for files and implementations
- Wherever possible you should try to spawn multiple parallel tool calls for grepping and reading files

Complete the user's search request efficiently and report your findings clearly.`
}

function getPlanSystemPrompt(): string {
  return `You are a software architect and planning specialist for Smart Space. Your role is to explore the codebase and design implementation plans.

=== CRITICAL: READ-ONLY MODE - NO FILE MODIFICATIONS ===
This is a READ-ONLY planning task. You are STRICTLY PROHIBITED from:
- Creating new files (no Write, touch, or file creation of any kind)
- Modifying existing files (no Edit operations)
- Deleting files (no rm or deletion)
- Moving or copying files (no mv or cp)
- Creating temporary files anywhere, including /tmp
- Using redirect operators (>, >>, |) or heredocs to write to files
- Running ANY commands that change system state

Your role is EXCLUSIVELY to explore the codebase and design implementation plans. You do NOT have access to file editing tools - attempting to edit files will fail.

You will be provided with a set of requirements and optionally a perspective on how to approach the design process.

## Your Process

1. **Understand Requirements**: Focus on the requirements provided and apply your assigned perspective throughout the design process.

2. **Explore Thoroughly**:
   - Read any files provided to you in the initial prompt
   - Find existing patterns and conventions using Glob, Grep, and Read
   - Understand the current architecture
   - Identify similar features as reference
   - Trace through relevant code paths
   - Use Bash ONLY for read-only operations (ls, git status, git log, git diff, find, cat, head, tail)
   - NEVER use Bash for: mkdir, touch, rm, cp, mv, git add, git commit, npm install, pip install, or any file creation/modification

3. **Design Solution**:
   - Create implementation approach based on your assigned perspective
   - Consider trade-offs and architectural decisions
   - Follow existing patterns where appropriate

4. **Detail the Plan**:
   - Provide step-by-step implementation strategy
   - Identify dependencies and sequencing
   - Anticipate potential challenges

## Required Output

End your response with:

### Critical Files for Implementation
List 3-5 files most critical for implementing this plan:
- path/to/file1.ts
- path/to/file2.ts
- path/to/file3.ts

REMEMBER: You can ONLY explore and plan. You CANNOT and MUST NOT write, edit, or modify any files. You do NOT have access to file editing tools.`
}

function getGeneralPurposeSystemPrompt(): string {
  return `You are an agent for Smart Space. Given the user's message, you should use the tools available to complete the task. Complete the task fully—don't gold-plate, but don't leave it half-done.

Your strengths:
- Searching for code, configurations, and patterns across large codebases
- Analyzing multiple files to understand system architecture
- Investigating complex questions that require exploring many files
- Performing multi-step research tasks

Guidelines:
- For file searches: search broadly when you don't know where something lives. Use Read when you know the specific file path.
- For analysis: Start broad and narrow down. Use multiple search strategies if the first doesn't yield results.
- Be thorough: Check multiple locations, consider different naming conventions, look for related files.
- NEVER create files unless they're absolutely necessary for achieving your goal. ALWAYS prefer editing an existing file to creating a new one.
- NEVER proactively create documentation files (*.md) or README files. Only create documentation files if explicitly requested.`
}

const READ_ONLY_DISALLOWED = ['Agent', 'ExitPlanMode', 'Edit', 'Write', 'NotebookEdit']

function getBuiltInAgents(): AgentDefinition[] {
  return [
    {
      agentType: 'Explore',
      whenToUse:
        'Fast agent specialized for exploring codebases. Use this when you need to quickly find files by patterns, search code for keywords, or answer questions about the codebase. Specify thoroughness level: "quick" for basic searches, "medium" for moderate exploration, or "very thorough" for comprehensive analysis.',
      disallowedTools: READ_ONLY_DISALLOWED,
      systemPrompt: getExploreSystemPrompt(),
      source: 'built-in',
      model: 'inherit',
    },
    {
      agentType: 'Plan',
      whenToUse:
        'Software architect agent for designing implementation plans. Use this when you need to plan the implementation strategy for a task. Returns step-by-step plans, identifies critical files, and considers architectural trade-offs.',
      disallowedTools: READ_ONLY_DISALLOWED,
      systemPrompt: getPlanSystemPrompt(),
      source: 'built-in',
      model: 'inherit',
    },
    {
      agentType: 'general-purpose',
      whenToUse:
        'General-purpose agent for researching complex questions, searching for code, and executing multi-step tasks. When you are searching for a keyword or file and are not confident that you will find the right match in the first few tries use this agent to perform the search for you.',
      systemPrompt: getGeneralPurposeSystemPrompt(),
      source: 'built-in',
    },
  ]
}

// ─── Custom Agent CRUD ───

async function ensureAgentsDir(): Promise<void> {
  await fs.mkdir(AGENTS_DIR, { recursive: true })
}

function agentFilePath(agentType: string): string {
  const safe = agentType.replace(/[^a-zA-Z0-9_-]/g, '_')
  return path.join(AGENTS_DIR, `${safe}.json`)
}

export async function listCustomAgents(): Promise<AgentDefinition[]> {
  try {
    await ensureAgentsDir()
    const files = await fs.readdir(AGENTS_DIR)
    const agents: AgentDefinition[] = []
    for (const file of files) {
      if (!file.endsWith('.json')) continue
      try {
        const raw = await fs.readFile(path.join(AGENTS_DIR, file), 'utf-8')
        const parsed = JSON.parse(raw)
        agents.push({
          agentType: parsed.agentType,
          whenToUse: parsed.whenToUse,
          tools: parsed.tools,
          disallowedTools: parsed.disallowedTools,
          systemPrompt: parsed.systemPrompt,
          source: 'custom',
          model: parsed.model,
        })
      } catch {
        // Skip invalid files
      }
    }
    return agents
  } catch {
    return []
  }
}

export async function getAgent(agentType: string): Promise<AgentDefinition | undefined> {
  const builtIn = getBuiltInAgents().find((a) => a.agentType === agentType)
  if (builtIn) return builtIn
  const custom = await listCustomAgents()
  return custom.find((a) => a.agentType === agentType)
}

export async function createAgent(input: CustomAgentInput): Promise<AgentDefinition> {
  await ensureAgentsDir()
  const agent: AgentDefinition = { ...input, source: 'custom' }
  await fs.writeFile(agentFilePath(input.agentType), JSON.stringify(input, null, 2), 'utf-8')
  return agent
}

export async function updateAgent(agentType: string, input: Partial<CustomAgentInput>): Promise<AgentDefinition | null> {
  const existing = await getAgent(agentType)
  if (!existing || existing.source !== 'custom') return null
  const updated = { ...existing, ...input, agentType: existing.agentType, source: 'custom' as const }
  await fs.writeFile(agentFilePath(agentType), JSON.stringify(updated, null, 2), 'utf-8')
  return updated
}

export async function deleteAgent(agentType: string): Promise<boolean> {
  const existing = await getAgent(agentType)
  if (!existing || existing.source !== 'custom') return false
  try {
    await fs.unlink(agentFilePath(agentType))
    return true
  } catch {
    return false
  }
}

/** 列出所有智能体（内置 + 自定义） */
export async function listAllAgents(): Promise<AgentDefinition[]> {
  const builtIn = getBuiltInAgents()
  const custom = await listCustomAgents()
  // Custom agents can override built-in ones with the same agentType
  const builtInTypes = new Set(builtIn.map((a) => a.agentType))
  const filteredCustom = custom.filter((a) => !builtInTypes.has(a.agentType))
  return [...builtIn, ...filteredCustom]
}

/** 获取智能体的可用工具名列表 */
export function getAgentToolNames(agent: AgentDefinition): string[] {
  const allToolNames = getToolNames()
  if (agent.tools && agent.tools.length > 0) {
    return agent.tools.filter((t) => allToolNames.includes(t))
  }
  const disallowed = new Set(agent.disallowedTools ?? [])
  return allToolNames.filter((t) => !disallowed.has(t))
}
