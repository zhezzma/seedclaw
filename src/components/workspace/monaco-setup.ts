/**
 * Monaco Editor 全局初始化。
 *
 * - 注册 Web Workers（Vite 用 `?worker` 语法把每个 worker 文件单独打包）。
 * - 模块顶层执行；多次 import 是幂等的（只设置一次 self.MonacoEnvironment）。
 *
 * 性能权衡：
 * - 默认引入了 json / css / html / ts 四种语言 worker，命中我们最常见的
 *   *.json / *.css / *.html / *.ts 文件；其它语言走通用 editor.worker，
 *   只有 token 级语法高亮、无 IntelliSense。
 * - 完整 monaco bundle 较大（~2MB gzipped），但 Vite dev 是按需加载的，dev 下感知小。
 *   生产 build 时 vite 会 tree-shake，但仍占明显体积——后续若需要瘦身可以
 *   切到 `monaco-editor-vite-plugin`。
 */
import * as monaco from 'monaco-editor'
import EditorWorker from 'monaco-editor/esm/vs/editor/editor.worker?worker'
import JsonWorker from 'monaco-editor/esm/vs/language/json/json.worker?worker'
import CssWorker from 'monaco-editor/esm/vs/language/css/css.worker?worker'
import HtmlWorker from 'monaco-editor/esm/vs/language/html/html.worker?worker'
import TsWorker from 'monaco-editor/esm/vs/language/typescript/ts.worker?worker'

declare global {
    interface Window {
        MonacoEnvironment?: monaco.Environment
    }
}

if (typeof self !== 'undefined' && !self.MonacoEnvironment) {
    self.MonacoEnvironment = {
        getWorker(_workerId: string, label: string): Worker {
            if (label === 'json') return new JsonWorker()
            if (label === 'css' || label === 'scss' || label === 'less') return new CssWorker()
            if (label === 'html' || label === 'handlebars' || label === 'razor') return new HtmlWorker()
            if (label === 'typescript' || label === 'javascript') return new TsWorker()
            return new EditorWorker()
        },
    }
}

/** 文件扩展名 → Monaco language id */
const EXT_TO_LANG: Record<string, string> = {
    ts: 'typescript', tsx: 'typescript',
    js: 'javascript', jsx: 'javascript', mjs: 'javascript', cjs: 'javascript',
    vue: 'html', // monaco 内置没有 vue，用 html 高亮 template / script 标签
    py: 'python',
    rs: 'rust',
    go: 'go',
    java: 'java',
    kt: 'kotlin',
    swift: 'swift',
    rb: 'ruby',
    php: 'php',
    cs: 'csharp',
    cpp: 'cpp', cc: 'cpp', cxx: 'cpp',
    c: 'c', h: 'c',
    css: 'css', scss: 'scss', sass: 'scss', less: 'less',
    html: 'html', htm: 'html',
    xml: 'xml', svg: 'xml',
    json: 'json',
    yaml: 'yaml', yml: 'yaml',
    md: 'markdown', markdown: 'markdown',
    sql: 'sql',
    sh: 'shell', bash: 'shell', zsh: 'shell',
    ps1: 'powershell',
    dockerfile: 'dockerfile',
    ini: 'ini',
    toml: 'ini',
    conf: 'ini',
    r: 'r',
    dart: 'dart',
    lua: 'lua',
    perl: 'perl',
}

export function languageFromPath(path: string): string {
    if (!path) return 'plaintext'
    const fileName = path.replace(/\\/g, '/').split('/').pop() || path
    const lower = fileName.toLowerCase()
    // 无扩展名的特殊文件
    if (lower === 'dockerfile') return 'dockerfile'
    if (lower === 'makefile') return 'makefile'
    const ext = lower.includes('.') ? lower.split('.').pop()! : ''
    return EXT_TO_LANG[ext] || 'plaintext'
}

/** 根据 daisyUI 当前主题决定 Monaco 主题 */
export function monacoThemeFromDaisy(): 'vs' | 'vs-dark' {
    const theme = document.documentElement.getAttribute('data-theme')
    return theme === 'dark' ? 'vs-dark' : 'vs'
}

/** 无路径时（纯文本预览）按内容特征猜 monaco language id。
 *  仅做轻量启发式：JSON / HTML / XML，其余回退 plaintext（够用，避免引入完整语言探测）。 */
export function guessLanguageFromContent(text: string): string {
    if (!text) return 'plaintext'
    const firstLine = text.trimStart().split('\n')[0]?.trim() ?? ''
    if (/^<!doctype\s+html/i.test(firstLine) || /^<html[\s>]/i.test(firstLine)) return 'html'
    if (/^<\?xml\s/i.test(firstLine)) return 'xml'
    if (/^<(template|script|style)[\s>]/i.test(firstLine)) return 'html'
    if (/^\s*[{\[]/.test(firstLine)) {
        try { JSON.parse(text.trimStart()); return 'json' } catch { /* not json */ }
    }
    return 'plaintext'
}

/** 代码块语言标签（markdown fence 的 info string）→ monaco language id。
 *  标签是语言「名」（python / javascript），不是文件扩展名，故独立于 EXT_TO_LANG。
 *  纯查表、不调 monaco 运行时：既避免在 worker / 测试上下文拉起 monaco，也保证可测。
 *  未知标签回退 plaintext（monaco 不认的语言 id 不会报错，但显式回退更可控）。 */
const LANG_LABEL_TO_ID: Record<string, string> = {
    javascript: 'javascript', js: 'javascript', jsx: 'javascript', mjs: 'javascript',
    typescript: 'typescript', ts: 'typescript', tsx: 'typescript',
    python: 'python', py: 'python',
    rust: 'rust', rs: 'rust',
    go: 'go', golang: 'go',
    java: 'java', kotlin: 'kotlin', swift: 'swift',
    ruby: 'ruby', rb: 'ruby', php: 'php',
    csharp: 'csharp', 'c#': 'csharp', cs: 'csharp',
    cpp: 'cpp', 'c++': 'cpp', cc: 'cpp', cxx: 'cpp', c: 'c', h: 'c',
    css: 'css', scss: 'scss', sass: 'scss', less: 'less',
    html: 'html', htm: 'html', xml: 'xml', svg: 'xml',
    json: 'json', yaml: 'yaml', yml: 'yaml',
    markdown: 'markdown', md: 'markdown',
    sql: 'sql',
    shell: 'shell', sh: 'shell', bash: 'shell', zsh: 'shell', shellscript: 'shell',
    powershell: 'powershell', ps1: 'powershell',
    dockerfile: 'dockerfile',
    ini: 'ini', toml: 'ini', conf: 'ini',
    r: 'r', dart: 'dart', lua: 'lua', perl: 'perl',
    plaintext: 'plaintext', text: 'plaintext', txt: 'plaintext',
}

export function resolveLanguageId(label: string): string {
    const l = (label || '').trim().toLowerCase()
    return l ? (LANG_LABEL_TO_ID[l] ?? 'plaintext') : 'plaintext'
}

/** 文件查看器共享的编辑器排版/显示配置。
 *  WorkspaceFileView 在所有模式（file/agent/absolute 可编辑 + text 只读预览）下共用，
 *  保证视觉与交互一致。readOnly / value / language / theme 由调用方各自传入或后续 updateOptions。 */
export const MONACO_FILE_EDITOR_OPTIONS: monaco.editor.IStandaloneEditorConstructionOptions = {
    automaticLayout: false, // 自己用 ResizeObserver 控制（automaticLayout 在隐藏容器中会跳）
    minimap: { enabled: false },
    scrollBeyondLastLine: false,
    fontSize: 13,
    fontFamily: 'ui-monospace, SFMono-Regular, "SF Mono", Menlo, Consolas, "Liberation Mono", monospace',
    lineNumbersMinChars: 3,
    renderLineHighlight: 'line',
    wordWrap: 'off',
    smoothScrolling: true,
}

export { monaco }
