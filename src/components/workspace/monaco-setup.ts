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
// @ts-expect-error vite ?worker import 的运行时类型 vite/client 不会自动给项目工程
import EditorWorker from 'monaco-editor/esm/vs/editor/editor.worker?worker'
// @ts-expect-error
import JsonWorker from 'monaco-editor/esm/vs/language/json/json.worker?worker'
// @ts-expect-error
import CssWorker from 'monaco-editor/esm/vs/language/css/css.worker?worker'
// @ts-expect-error
import HtmlWorker from 'monaco-editor/esm/vs/language/html/html.worker?worker'
// @ts-expect-error
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

export { monaco }
