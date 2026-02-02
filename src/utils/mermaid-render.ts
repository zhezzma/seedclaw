import mermaid, { MermaidConfig } from 'mermaid'
import { nextTick, watch } from 'vue'  // 添加watch以监视变化
import { useUiSettingsStore } from '../stores/setting'
import { useToastStore } from '../stores/toast'

//该文件不放在./markdown-it-mermaid中因为使用document..不能被works引用

// 根据模式获取对应的mermaid配置
function getMermaidConfig(isDark: boolean): MermaidConfig {


    return {
        startOnLoad: false,
        theme: isDark ? "dark" : "forest", // 暗色模式用dark主题，亮色模式用default主题
        darkMode: isDark,
        look: "handDrawn",
        logLevel: 'error',
        securityLevel: 'loose', // 允许点击事件
        fontFamily: '"Roboto", "PingFang SC", "Microsoft YaHei", sans-serif',
        fontSize: 16,
        flowchart: {
            htmlLabels: true,
            curve: 'basis', // 曲线风格: basis, cardinal, step
            useMaxWidth: true,
            padding: 10
        },
        sequence: {
            diagramMarginX: 50,
            diagramMarginY: 10,
            actorMargin: 50,
            width: 150,
            height: 65,
            boxMargin: 10,
            boxTextMargin: 5,
            noteMargin: 10,
            messageMargin: 35
        },
        gantt: {
            titleTopMargin: 25,
            barHeight: 20,
            barGap: 4,
            topPadding: 50,
            leftPadding: 75,
            gridLineStartPadding: 35,
            fontSize: 14,
            sectionFontSize: 14,
            numberSectionStyles: 4
        },
        suppressErrorRendering: true
    };
}


// 创建全局事件处理器
function setupGlobalMermaidEventHandlers() {
    // 拖动相关变量
    let isDragging = false;
    let startX = 0;
    let startY = 0;
    let currentX = 0;
    let currentY = 0;
    let activeContainer: HTMLElement | null = null;
    const scaleStep = 0.1; // 缩放步长

    // 使用事件代理模式，在document级别监听所有控制按钮点击
    document.addEventListener('click', (e) => {
        const target = e.target as HTMLElement
        const button = target.closest('.mermaid-controls button') as HTMLElement
        if (!button) return  // 阻止默认行为


        // 找到当前图表相关元素
        const wrapper = button.closest('.mermaid-diagram-wrapper') as HTMLElement
        if (!wrapper) return

        const container = wrapper.querySelector('.mermaid-diagram-container') as HTMLElement
        const diagramElement = wrapper.querySelector('.mermaid-diagram') as HTMLElement
        // 检查是否存在错误容器
        const hasErrorContainer = diagramElement?.querySelector('.mermaid-error-container')
        // 只获取正常渲染的SVG，排除错误图标
        const svgEl = !hasErrorContainer ? diagramElement?.querySelector('svg') : null
        let scale = parseFloat(container?.dataset.scale || '1')
        const scaleStep = 0.1
        // 根据按钮类型执行不同操作
        if (button.classList.contains('mermaid-zoom-in')) {
            // 获取容器的中心点
            const rect = container.getBoundingClientRect();
            const centerX = rect.width / 2;
            const centerY = rect.height / 2;

            // 计算新的缩放值
            const oldScale = scale;
            scale += scaleStep;

            // 计算缩放比例变化
            const scaleFactor = scale / oldScale;

            // 调整平移值，使缩放以容器中心为中心点
            const newX = currentX - ((centerX / oldScale) * (scaleFactor - 1));
            const newY = currentY - ((centerY / oldScale) * (scaleFactor - 1));

            if (container) {
                updateContainerTransform(container, scale, newX, newY);
            }
        }
        else if (button.classList.contains('mermaid-zoom-out')) {
            if (scale > scaleStep) {
                // 获取容器的中心点
                const rect = container.getBoundingClientRect();
                const centerX = rect.width / 2;
                const centerY = rect.height / 2;

                // 计算新的缩放值
                const oldScale = scale;
                scale -= scaleStep;

                // 计算缩放比例变化
                const scaleFactor = scale / oldScale;

                // 调整平移值，使缩放以容器中心为中心点
                const newX = currentX - ((centerX / oldScale) * (scaleFactor - 1));
                const newY = currentY - ((centerY / oldScale) * (scaleFactor - 1));

                if (container) {
                    updateContainerTransform(container, scale, newX, newY);
                }
            }
        }
        else if (button.classList.contains('mermaid-reset')) {
            scale = 1;
            // 重置为居中位置，而不是0,0
            currentX = 0;
            currentY = 0;
            if (container) {
                updateContainerTransform(container, scale, currentX, currentY);
            }
        }
        else if (button.classList.contains('mermaid-download')) {
            if (svgEl) {
                // 下载SVG图表
                try {
                    const svgText = svgEl.outerHTML
                    const blob = new Blob([svgText], { type: 'image/svg+xml' })
                    const url = URL.createObjectURL(blob)
                    const a = document.createElement('a')
                    a.href = url
                    a.download = `mermaid-${Date.now()}.svg`
                    document.body.appendChild(a)
                    a.click()
                    document.body.removeChild(a)
                    URL.revokeObjectURL(url)
                } catch (error) {
                    console.error('下载SVG图表失败:', error)
                    useToastStore().error("下载失败，请稍后再试。")
                }
            } else {
                useToastStore().error("无法下载图表，因为图表渲染失败或不存在。")
            }
        }
        else if (button.classList.contains('mermaid-copy')) {
            // 复制图表代码
            const originalCode = decodeURIComponent(
                diagramElement?.getAttribute('data-original-code') ||
                diagramElement?.getAttribute('data-mermaid') ||
                ''
            )
            navigator.clipboard.writeText(originalCode)
                .then(() => useToastStore().success("图表代码已复制到剪贴板!"))
                .catch(() => useToastStore().error("复制失败，请手动选择并复制。"))
        }
    }, true) // 使用捕获阶段以确保事件被处理

    // 处理双击切换全屏事件
    document.addEventListener('dblclick', () => {
        // 双击事件处理逻辑可以在这里添加
    }, true)

    // 监听Ctrl键按下事件，添加ctrl-pressed类
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Control') {
            document.body.classList.add('ctrl-pressed');
        }
    });

    // 监听Ctrl键释放事件，移除ctrl-pressed类
    document.addEventListener('keyup', (e) => {
        if (e.key === 'Control') {
            document.body.classList.remove('ctrl-pressed');
        }
    });

    // 当窗口失去焦点时，确保移除ctrl-pressed类
    window.addEventListener('blur', () => {
        document.body.classList.remove('ctrl-pressed');
    });

    // 更新容器变换的辅助函数
    function updateContainerTransform(container: HTMLElement, scale: number, translateX: number, translateY: number) {
        container.style.transform = `scale(${scale}) translate(${translateX}px, ${translateY}px)`;
        container.dataset.scale = scale.toString();
        // 存储当前的平移值，以便在缩放时保持位置
        container.dataset.translateX = translateX.toString();
        container.dataset.translateY = translateY.toString();
    }

    // 鼠标按下事件 - 开始拖动
    document.addEventListener('mousedown', (e) => {
        // 确保不是在控制按钮上点击
        if ((e.target as HTMLElement).closest('.mermaid-controls')) {
            return;
        }

        const container = (e.target as HTMLElement).closest('.mermaid-diagram-container') as HTMLElement;
        if (!container) return;

        // 阻止默认行为，防止文本选择
        e.preventDefault();

        // 设置拖动状态
        isDragging = true;
        activeContainer = container;
        container.classList.add('dragging');

        // 记录起始位置
        startX = e.clientX;
        startY = e.clientY;

        // 获取当前平移值
        currentX = parseFloat(container.dataset.translateX || '0');
        currentY = parseFloat(container.dataset.translateY || '0');
    });

    // 鼠标移动事件 - 拖动中
    document.addEventListener('mousemove', (e) => {
        if (!isDragging || !activeContainer) return;

        // 计算移动距离
        const scale = parseFloat(activeContainer.dataset.scale || '1');
        const dx = (e.clientX - startX) / scale;
        const dy = (e.clientY - startY) / scale;

        // 更新位置
        const newX = currentX + dx;
        const newY = currentY + dy;

        // 应用变换
        updateContainerTransform(activeContainer, scale, newX, newY);
    });

    // 鼠标释放事件 - 结束拖动
    document.addEventListener('mouseup', () => {
        if (isDragging && activeContainer) {
            // 更新当前位置为最终位置
            currentX = parseFloat(activeContainer.dataset.translateX || '0');
            currentY = parseFloat(activeContainer.dataset.translateY || '0');

            // 重置拖动状态
            activeContainer.classList.remove('dragging');
            isDragging = false;
            activeContainer = null;
        }
    });

    // 鼠标离开窗口时也结束拖动
    document.addEventListener('mouseleave', () => {
        if (isDragging && activeContainer) {
            activeContainer.classList.remove('dragging');
            isDragging = false;
            activeContainer = null;
        }
    });

    // 触摸事件支持 - 开始拖动
    document.addEventListener('touchstart', (e) => {
        if (e.touches.length !== 1) return; // 只处理单指触摸

        // 确保不是在控制按钮上触摸
        if ((e.target as HTMLElement).closest('.mermaid-controls')) {
            return;
        }

        const container = (e.target as HTMLElement).closest('.mermaid-diagram-container') as HTMLElement;
        if (!container) return;

        // 阻止默认行为，防止滚动
        e.preventDefault();

        // 设置拖动状态
        isDragging = true;
        activeContainer = container;
        container.classList.add('dragging');

        // 记录起始位置
        startX = e.touches[0].clientX;
        startY = e.touches[0].clientY;

        // 获取当前平移值
        currentX = parseFloat(container.dataset.translateX || '0');
        currentY = parseFloat(container.dataset.translateY || '0');
    });

    // 触摸移动事件
    document.addEventListener('touchmove', (e) => {
        if (!isDragging || !activeContainer || e.touches.length !== 1) return;

        // 计算移动距离
        const scale = parseFloat(activeContainer.dataset.scale || '1');
        const dx = (e.touches[0].clientX - startX) / scale;
        const dy = (e.touches[0].clientY - startY) / scale;

        // 更新位置
        const newX = currentX + dx;
        const newY = currentY + dy;

        // 应用变换
        updateContainerTransform(activeContainer, scale, newX, newY);
    });

    // 触摸结束事件
    document.addEventListener('touchend', () => {
        if (isDragging && activeContainer) {
            // 更新当前位置为最终位置
            currentX = parseFloat(activeContainer.dataset.translateX || '0');
            currentY = parseFloat(activeContainer.dataset.translateY || '0');

            // 重置拖动状态
            activeContainer.classList.remove('dragging');
            isDragging = false;
            activeContainer = null;
        }
    });

    // 触摸取消事件
    document.addEventListener('touchcancel', () => {
        if (isDragging && activeContainer) {
            activeContainer.classList.remove('dragging');
            isDragging = false;
            activeContainer = null;
        }
    });

    // 处理Ctrl+鼠标滚轮缩放
    document.addEventListener('wheel', (e) => {
        // 检查是否按下Ctrl键
        if (!e.ctrlKey) return;

        // 查找鼠标下方的图表容器
        const container = (e.target as HTMLElement).closest('.mermaid-diagram-container') as HTMLElement;
        if (!container) return;

        // 阻止默认滚动行为
        e.preventDefault();

        // 获取容器的边界矩形
        const rect = container.getBoundingClientRect();

        // 计算鼠标在容器内的相对位置（考虑当前缩放）
        const mouseX = (e.clientX - rect.left);
        const mouseY = (e.clientY - rect.top);

        // 获取当前缩放和位置
        let oldScale = parseFloat(container.dataset.scale || '1');
        let newScale = oldScale;
        let translateX = parseFloat(container.dataset.translateX || '0');
        let translateY = parseFloat(container.dataset.translateY || '0');

        // 根据滚轮方向缩放
        if (e.deltaY < 0) {
            // 向上滚动，放大
            newScale = oldScale + scaleStep;
        } else {
            // 向下滚动，缩小
            if (oldScale > scaleStep) {
                newScale = oldScale - scaleStep;
            } else {
                return; // 防止缩放过小
            }
        }

        // 计算缩放比例变化
        const scaleFactor = newScale / oldScale;

        // 调整平移值，使缩放以鼠标位置为中心
        // 这个公式确保鼠标下的点在缩放前后保持相对位置不变
        const newTranslateX = translateX - ((mouseX / oldScale) * (scaleFactor - 1));
        const newTranslateY = translateY - ((mouseY / oldScale) * (scaleFactor - 1));

        // 应用变换
        updateContainerTransform(container, newScale, newTranslateX, newTranslateY);
    }, { passive: false }); // passive: false 允许阻止默认行为
}



// 初始化标志，确保只初始化一次
let isInitialized = false;

// 初始化mermaid配置
export function initializeMermaid() {
    if (isInitialized) return;

    try {
        // 创建存储实例
        const store = useUiSettingsStore();
        // 获取当前显示模式
        const currentMode = store.isDark;

        // 使用初始模式配置mermaid
        mermaid.initialize(getMermaidConfig(currentMode));

        // 监视模式变化并重新初始化mermaid
        watch(() => store.isDark, (newMode) => {
            console.log('显示模式改变:', newMode);
            // 重新初始化mermaid配置
            mermaid.initialize(getMermaidConfig(newMode));
        }, { immediate: true });

        setupGlobalMermaidEventHandlers();

        isInitialized = true;
    } catch (error) {
        console.error('初始化mermaid失败:', error);
        // 使用默认配置初始化
        mermaid.initialize(getMermaidConfig(false));
    }
}

export async function renderMermaidDiagrams(html: string): Promise<string> {
    // 添加全局样式，如果不存在
    if (!document.getElementById('mermaid-interactive-styles')) {
        const styleEl = document.createElement('style')
        styleEl.id = 'mermaid-interactive-styles'
        styleEl.textContent = `
      .mermaid-diagram-wrapper {
        position: relative;
        margin: 10px 0;
        border: 1px solid var(--td-border-level-1-color, #e0e0e0);
        border-radius: 4px;
        overflow: hidden;
      }
      .mermaid-controls {
        position: absolute;
        top: 5px;
        right: 5px;
        display: flex;
        gap: 4px;
        background: var(--td-bg-color-container-hover, rgba(255, 255, 255, 0.8));
        border-radius: 4px;
        padding: 2px;
        z-index: 10;
        opacity: 0.4;
        transition: opacity 0.2s;
      }
      .mermaid-diagram-wrapper:hover .mermaid-controls {
        opacity: 1;
      }
      .mermaid-controls button {
        background: transparent;
        border: none;
        cursor: pointer;
        width: 24px;
        height: 24px;
        display: flex;
        align-items: center;
        justify-content: center;
        border-radius: 50%;
        color: var(--td-text-color-primary, #333);
        padding: 0;
      }
      .mermaid-controls button:hover {
        background: var(--td-bg-color-container-active, rgba(0, 0, 0, 0.1));
      }
      .mermaid-diagram-container {
        overflow: auto;
        position: relative;
        min-height: 50px;
        transition: transform 0.2s;
        background: var(--td-bg-color-container, #ffffff);
        cursor: grab; /* 添加抓取光标，表示可拖动 */
        transform-origin: center center; /* 确保缩放是从中心点开始的 */
        will-change: transform; /* 提示浏览器优化变换性能 */
      }
      .mermaid-diagram-container.dragging {
        cursor: grabbing; /* 拖动时的光标 */
        transition: none; /* 拖动时禁用过渡效果，使移动更流畅 */
        user-select: none; /* 防止文本选择 */
      }
      /* 当按下Ctrl键时显示缩放光标 */
      .ctrl-pressed .mermaid-diagram-container {
        cursor: zoom-in;
      }
      .mermaid-loading {
        text-align: center;
        padding: 20px;
        color: var(--td-text-color-secondary, #666);
      }
      .mermaid-svg,
      .mermaid-diagram svg {
        display: block;
        margin: 0 auto;
        max-width: 100%;
        pointer-events: auto; /* 确保SVG元素可以接收鼠标事件 */
      }
      .mermaid-error-container {
        position: relative;
        border-left: 3px solid var(--td-error-color, #ff5252);
        padding-left: 8px;
      }
      .mermaid-error-icon {
        position: absolute;
        top: 0px;
        left: 0px;
        cursor: pointer;
        z-index: 10;
      }

    `
        document.head.appendChild(styleEl)
    }

    // 创建一个临时DOM元素以解析HTML
    const tempDiv = document.createElement('div')
    tempDiv.innerHTML = html

    // 查找所有mermaid图表元素
    const mermaidElements = tempDiv.querySelectorAll('.mermaid-diagram')

    // 如果没有找到图表，直接返回原始HTML
    if (mermaidElements.length === 0) {
        return html
    }

    // 处理每个图表的渲染，但不绑定事件（事件由全局代理处理）
    const renderPromises = Array.from(mermaidElements).map(async (element) => {
        const diagramId = element.id
        const code = decodeURIComponent(element.getAttribute('data-mermaid') || '')

        if (!code) return

        try {
            // 使用mermaid.render异步渲染图表
            const renderResult = await mermaid.render(`svg-${diagramId}`, code)
            const { svg, bindFunctions } = renderResult

            // 渲染SVG内容
            element.innerHTML = svg

            // 应用绑定函数以支持交互
            if (bindFunctions) {
                // 确保在下一个帧执行，以确保DOM更新完成
                await nextTick(() => {
                    bindFunctions(element)
                })
            }
        } catch (error) {
            console.error('Mermaid渲染错误:', error)
            // 错误处理保持不变...
            const errorMessage = error instanceof Error ? error.message : '未知错误'
            const originalCode = decodeURIComponent(element.getAttribute('data-original-code') || code)

            const errorIconSvg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="16" height="16" fill="red">
        <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 15h-2v-2h2v2zm0-4h-2V7h2v6z"/>
      </svg>`
            element.innerHTML = `
        <div class="mermaid-error-container">
          <div class="mermaid-error-icon" title="${errorMessage.replace(/"/g, '"')}">${errorIconSvg}</div>
          <pre class="language-mermaid"><code class="language-mermaid">${originalCode}</code></pre>
        </div>
      `
        }
    })

    // 等待所有图表渲染完成
    await Promise.all(renderPromises)

    // 返回处理后的HTML
    return tempDiv.innerHTML
}
