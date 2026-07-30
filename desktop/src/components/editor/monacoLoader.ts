// Configure Monaco editor to use locally bundled files instead of CDN.
// This is required for Tauri desktop apps where CSP may block CDN loading.
import { loader } from '@monaco-editor/react'
import * as monaco from 'monaco-editor'
import editorWorker from 'monaco-editor/esm/vs/editor/editor.worker?worker'
import jsonWorker from 'monaco-editor/esm/vs/language/json/json.worker?worker'
import cssWorker from 'monaco-editor/esm/vs/language/css/css.worker?worker'
import htmlWorker from 'monaco-editor/esm/vs/language/html/html.worker?worker'
import tsWorker from 'monaco-editor/esm/vs/language/typescript/ts.worker?worker'

// Set up web workers for Monaco features (intellisense, syntax highlighting, etc.)
self.MonacoEnvironment = {
  getWorker(_, label) {
    if (label === 'json') return new jsonWorker()
    if (label === 'css' || label === 'scss' || label === 'less') return new cssWorker()
    if (label === 'html' || label === 'handlebars' || label === 'razor' || label === 'vue') return new htmlWorker()
    if (label === 'typescript' || label === 'javascript' || label === 'typescriptreact' || label === 'javascriptreact') return new tsWorker()
    return new editorWorker()
  },
}

// Register Vue single-file component language (reuses HTML tokenizer)
{
  const allLangs = monaco.languages.getLanguages() as any[]
  const htmlLang = allLangs.find((l: any) => l.id === 'html')
  monaco.languages.register({ id: 'vue', extensions: ['.vue'], aliases: ['Vue', 'vue'] })
  if (htmlLang?.loader) {
    monaco.languages.registerTokensProviderFactory('vue', {
      create: async () => {
        const mod = await htmlLang.loader!()
        return mod.language
      },
    })
    monaco.languages.onLanguage('vue', async () => {
      const mod = await htmlLang.loader!()
      monaco.languages.setLanguageConfiguration('vue', mod.conf)
    })
  }
}

// Register 'typescriptreact' and 'javascriptreact' language IDs
{
  const allLangs = monaco.languages.getLanguages() as any[]
  const tsLang = allLangs.find((l: any) => l.id === 'typescript')
  const jsLang = allLangs.find((l: any) => l.id === 'javascript')

  monaco.languages.register({ id: 'typescriptreact', extensions: ['.tsx'], aliases: ['TypeScript React', 'tsx'] })
  if (tsLang?.loader) {
    monaco.languages.registerTokensProviderFactory('typescriptreact', {
      create: async () => {
        const mod = await tsLang.loader!()
        return mod.language
      },
    })
    monaco.languages.onLanguage('typescriptreact', async () => {
      const mod = await tsLang.loader!()
      monaco.languages.setLanguageConfiguration('typescriptreact', mod.conf)
    })
  }

  monaco.languages.register({ id: 'javascriptreact', extensions: ['.jsx'], aliases: ['JavaScript React', 'jsx'] })
  if (jsLang?.loader) {
    monaco.languages.registerTokensProviderFactory('javascriptreact', {
      create: async () => {
        const mod = await jsLang.loader!()
        return mod.language
      },
    })
    monaco.languages.onLanguage('javascriptreact', async () => {
      const mod = await jsLang.loader!()
      monaco.languages.setLanguageConfiguration('javascriptreact', mod.conf)
    })
  }
}

// Configure TypeScript compiler options for proper JSX/TSX support
const ts = (monaco as any).languages.typescript
if (ts) {
  ts.typescriptDefaults?.setCompilerOptions({
    jsx: ts.JsxEmit?.React ?? 2,
    jsxFactory: 'React.createElement',
    jsxFragmentFactory: 'React.Fragment',
    target: ts.ScriptTarget?.ESNext ?? 99,
    moduleResolution: ts.ModuleResolutionKind?.NodeJs ?? 2,
    allowNonTsExtensions: true,
  })
  ts.javascriptDefaults?.setCompilerOptions({
    jsx: ts.JsxEmit?.React ?? 2,
    target: ts.ScriptTarget?.ESNext ?? 99,
    moduleResolution: ts.ModuleResolutionKind?.NodeJs ?? 2,
    allowNonTsExtensions: true,
  })
}

loader.config({ monaco })

export { loader }
