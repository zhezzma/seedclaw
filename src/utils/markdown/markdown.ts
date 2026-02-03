import markdownWorker from './markdown-worker-wrapper'
import { renderMermaidDiagrams } from "./mermaid-render.ts"
import { createMarkdownItInstance } from './markdown-config'
import { useToastStore } from '../../stores/toast'



// 创建同步渲染器作为回退选项
const syncRenderer = createMarkdownItInstance({
    onCopySuccess: (_text, _element) => { useToastStore().success("复制成功!") }
})



// 创建混合渲染器
const md = {
    // 异步渲染方法，使用Web Worker
    render: async (text: string): Promise<string> => {
        try {
            // 使用worker渲染markdown
            let renderedHtml = await markdownWorker.render(text || "")

            // 处理其中的mermaid图表
            renderedHtml = await renderMermaidDiagrams(renderedHtml)

            return renderedHtml
        } catch (error) {
            console.error('Worker渲染失败，回退到同步渲染:', error)
            // 回退到同步渲染
            let renderedHtml = syncRenderer.render(text || "")

            // 处理其中的mermaid图表
            renderedHtml = await renderMermaidDiagrams(renderedHtml)

            return renderedHtml
        }
    },

    // 同步渲染方法（不处理mermaid图表）
    renderSync: (text: string): string => {
        return syncRenderer.render(text || "")
    }
}

export default md
