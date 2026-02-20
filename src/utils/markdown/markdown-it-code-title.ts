// Based on https://github.com/DCsunset/markdown-it-code-copy/blob/master/index.js
// Enhanced with code collapsing and scroll-to-top functionality

interface Options {
  svg: string
  buttonClass?: string
  buttonStyle?: string
  collapseButtonClass?: string
  collapseButtonStyle?: string
  headerClass?: string
  headerStyle?: string
  onCopySuccess?: (text: string, element: HTMLElement) => void
  onCopyError?: (error: Error, element: HTMLElement) => void
  onFullscreen?: (text: string, element: HTMLElement) => void
}

type RulesArgs = [Array<{
  info: string;
  content: string
}>, number, ...any[]]

const defaultOptions: Options = {
  svg: '',
  buttonStyle: '',
  collapseButtonClass: '',
  collapseButtonStyle: '',
  headerClass: '',
  headerStyle: ''
}

const renderCode = (
  origRule: (...args: RulesArgs) => string,
  options: Options
) => {
  options = { ...defaultOptions, ...options }
  return (...args: RulesArgs) => {
    const [tokens, idx] = args;
    //处理这种```html:index.html
    const token = tokens[idx] as any;
    // Check if we need to handle language with file extension
    if (token.info && token.info.includes(':')) {
      // Split the language and filename
      const [language] = token.info.split(':', 2);
      // Set the language only (remove the filename part)
      token.info = language;
    }


    const content = tokens[idx].content
      .replaceAll('"', '&quot;')
      .replaceAll("'", "&apos;");


    // Wrap the original rule call in a try-catch to handle language errors
    let origRendered;
    try {
      origRendered = origRule(...args);
    } catch (error) {
      // If there's an error with the language, fallback to plain text
      console.warn(`Markdown rendering error: ${(error as any).message}`);
      // Temporarily modify the token to use 'text' language instead
      const originalInfo = tokens[idx].info;
      tokens[idx].info = 'text';
      origRendered = origRule(...args);
      // Restore the original language info
      tokens[idx].info = originalInfo;
    }

    if (content.length === 0) {
      return origRendered;
    }
    // Get language from token info if available
    const language = tokens[idx].info || '';
    const isPreviewable = ['html', 'svg', 'xml'].includes(language.toLowerCase());
    const isSvg = language.toLowerCase() === 'svg';

    // Generate a unique ID for the code block header
    const headerId = `code-header-${Math.random().toString(36).substring(2, 9)}`;

    return `
<div class="markdown-it-code-title">
  <div id="${headerId}" class="code-header ${options.headerClass}" style="${options.headerStyle}">
    <div class="code-header-left" onclick="toggleCodeCollapse(this)">
      <span class="code-language">${language}</span>
      <button class="code-collapse-button ${options.collapseButtonClass}" style="${options.collapseButtonStyle}" title="Toggle code" >
        <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <polyline points="6 9 12 15 18 9"></polyline>
        </svg>
      </button>
    </div>
    <div class="code-header-right">
      ${isPreviewable ? `
      <button class="code-preview-button${isSvg ? ' active' : ''}" title="Preview" onclick="toggleCodePreview(this)">
        <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path><circle cx="12" cy="12" r="3"></circle></svg>
      </button>` : ''}
      <button data-clipboard-text="${content}" class="code-fullscreen-button" title="Fullscreen" onclick="fullscreenCodeContent(this)">
        <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M8 3H5a2 2 0 0 0-2 2v3m18 0V5a2 2 0 0 0-2-2h-3m0 18h3a2 2 0 0 0 2-2v-3M3 16v3a2 2 0 0 0 2 2h3"></path></svg>
      </button>
      <button data-clipboard-text="${content}" class="code-copy-button ${options.buttonClass}" style="${options.buttonStyle}" title="Copy code" onclick="copyCodeToClipboard(this)">
        ${options.svg}
      </button>
    </div>
  </div>
  <div class="code-preview${isSvg ? '' : ' hidden'}">${isSvg ? tokens[idx].content : ''}</div>
  <div class="code-content${isSvg ? ' hidden' : ''}">
    ${origRendered}
    <button class="code-scroll-top-button${content.length > 500 ? '' : ' hidden'}" title="Scroll to code header" onclick="scrollToElement('${headerId}')">
      <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <polyline points="18 15 12 9 6 15"></polyline>
      </svg>
    </button>
  </div>
</div>
`
  }
}

export default (md: any, options: Options) => {
  md.renderer.rules.code_block = renderCode(
    md.renderer.rules.code_block,
    options
  )
  md.renderer.rules.fence = renderCode(md.renderer.rules.fence, options)
  // 将复制代码的函数和回调函数绑定到window对象，以便在HTML中使用
  if (typeof window !== 'undefined') {
    if (!(window as any).copyCodeToClipboard) {
      (window as any).copyCodeToClipboard = (button: HTMLElement) => {
        const code = button.dataset.clipboardText || ''
        navigator.clipboard.writeText(code).then(function () {
          options.onCopySuccess && options.onCopySuccess(code, button)
        }).catch(function (error) {
          options.onCopyError && options.onCopyError(error, button)
        });
      };
    }

    if (!(window as any).toggleCodePreview) {
      (window as any).toggleCodePreview = (button: HTMLElement) => {
        const codeBlock = button.closest('.markdown-it-code-title');
        if (!codeBlock) return;
        const codeContent = codeBlock.querySelector('.code-content');
        const previewContent = codeBlock.querySelector('.code-preview');
        const copyButton = codeBlock.querySelector('.code-copy-button') as HTMLElement;

        if (!codeContent || !previewContent || !copyButton) return;

        if (previewContent.classList.contains('hidden')) {
          const code = copyButton.dataset.clipboardText || '';
          previewContent.innerHTML = code;
          previewContent.classList.remove('hidden');
          codeContent.classList.add('hidden');
          button.classList.add('active');
        } else {
          previewContent.classList.add('hidden');
          codeContent.classList.remove('hidden');
          button.classList.remove('active');
        }
      };
    }

    if (!(window as any).fullscreenCodeContent) {
      (window as any).fullscreenCodeContent = (button: HTMLElement) => {
        const code = button.dataset.clipboardText || ''
        options.onFullscreen && options.onFullscreen(code, button)
      };
    }

    if (!(window as any).toggleCodeCollapse) {
      (window as any).toggleCodeCollapse = (element: HTMLElement) => {
        const codeBlock = element.closest('.markdown-it-code-title');
        if (!codeBlock) return;
        const codeContent = codeBlock.querySelector('.code-content');
        const previewContent = codeBlock.querySelector('.code-preview');
        const collapseButton = element.querySelector('.code-collapse-button') || element;
        const scrollTopButton = codeBlock.querySelector('.code-scroll-top-button');

        if (!codeContent) return;

        // Toggle collapsed class on content
        codeContent.classList.toggle('collapsed');
        if (previewContent) {
          previewContent.classList.toggle('collapsed');
        }

        // Toggle collapsed class on button for rotation
        collapseButton.classList.toggle('collapsed');

        // Hide scroll-top button when collapsed
        if (scrollTopButton) {
          if (codeContent.classList.contains('collapsed')) {
            scrollTopButton.classList.add('hidden');
          } else {
            scrollTopButton.classList.remove('hidden');
          }
        }
      };
    }

    if (!(window as any).scrollToElement) {
      // 不含120偏移量的版本
      // (window as any).scrollToElement = (elementId: string) => {
      //   const element = document.getElementById(elementId);
      //   if (element) {
      //     element.scrollIntoView({ behavior: 'smooth', block: 'start' });
      //   }
      // };

      (window as any).scrollToElement = (elementId: string) => {
        const element = document.getElementById(elementId);
        if (element) {
          //查找第一个有滚动条的父元素
          const getScrollParent = (node: HTMLElement | null): Element => {
            if (!node) return document.documentElement;

            const overflowY = window.getComputedStyle(node).overflowY;
            const isScrollable = overflowY !== 'visible' && overflowY !== 'hidden';

            if (isScrollable && node.scrollHeight > node.clientHeight) {
              return node;
            }
            return getScrollParent(node.parentElement) || document.documentElement;
          };

          const scrollParent = getScrollParent(element);

          // 计算元素相对于滚动父元素的位置
          const elementRect = element.getBoundingClientRect();
          const containerRect = scrollParent.getBoundingClientRect();

          // 计算需要滚动的距离（元素顶部到容器顶部的距离，再减去64px的偏移）
          const scrollTop = elementRect.top - containerRect.top + scrollParent.scrollTop - 120;

          // 滚动到指定位置
          scrollParent.scrollTo({
            top: scrollTop,
            behavior: 'smooth'
          });
        }
      };
    }




    // 定义你想要注入的CSS样式
    const css = `
.markdown-it-code-title {
  position: relative;
  border-radius: 6px;
  overflow: hidden;
}
.markdown-it-code-title .code-header {
  position: relative;
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 8px 16px;
  font-size: 0.9em;
  background-color: #2d2d2d;
  z-index:1;
}

.markdown-it-code-title .code-header-right {
  display: flex;
  align-items: center;
  gap: 8px;
}

.markdown-it-code-title .code-header-left {
  display: flex;
  align-items: center;
  gap: 8px;
  cursor: pointer;
}
.markdown-it-code-title .code-language {
  text-transform: uppercase;
  font-size: 0.8em;
  font-weight: bold;
  color: #999;
}
.markdown-it-code-title .code-collapse-button {
  background: none;
  border: none;
  color: #999;
  cursor: pointer;
  padding: 2px;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: transform 0.2s;
}
.markdown-it-code-title .code-collapse-button.collapsed {
  transform: rotate(-90deg);
}

.markdown-it-code-title .code-copy-button {
  background: none;
  border: none;
  color: #999;
  cursor: pointer;
  padding: 4px;
  display: flex;
  align-items: center;
  justify-content: center;
  opacity: 0.6;
  transition: opacity 0.2s;
}
.markdown-it-code-title .code-copy-button:hover {
  opacity: 1;
}

.markdown-it-code-title .code-preview-button {
  background: none;
  border: none;
  color: #999;
  cursor: pointer;
  padding: 4px;
  display: flex;
  align-items: center;
  justify-content: center;
  opacity: 0.6;
  transition: opacity 0.2s;
}
.markdown-it-code-title .code-preview-button:hover,
.markdown-it-code-title .code-preview-button.active {
  opacity: 1;
  color: #fff;
}

.markdown-it-code-title .code-preview {
  padding: 16px;
  background: white;
  overflow: auto;
  min-height: 50px;
}
.markdown-it-code-title .code-preview.hidden {
  display: none;
}
.markdown-it-code-title .code-preview.collapsed {
  display: none;
}





.markdown-it-code-title .code-content {
  position: relative;
  transition: max-height 0.3s ease-out, opacity 0.2s ease;
  max-height: 100%;
  overflow: visible;
  z-index:0;
}
.markdown-it-code-title .code-content.collapsed {
  max-height: 0;
  overflow: hidden;
  opacity: 0.8;
}

.markdown-it-code-title .code-scroll-top-button {
  position: absolute;
  bottom: 10px;
  right: 10px;
  color: #555;
  cursor: pointer;
  padding: 4px;
  display: flex;
  align-items: center;
  justify-content: center;
  opacity: 0.6;
  transition: all 0.2s ease;
  border-radius: 50%;
  box-shadow: 0 2px 5px rgba(0, 0, 0, 0.1);
  z-index: 10;
  background-color: rgba(200, 200, 200, 0.8);
}

.markdown-it-code-title .code-scroll-top-button:hover {
  opacity: 1;
}
.markdown-it-code-title .code-scroll-top-button.hidden {
  opacity: 0;
  visibility: hidden;
}

.markdown-it-code-title .code-fullscreen-button {
  background: none;
  border: none;
  color: #999;
  cursor: pointer;
  padding: 4px;
  display: flex;
  align-items: center;
  justify-content: center;
  opacity: 0.6;
  transition: opacity 0.2s;
}
.markdown-it-code-title .code-fullscreen-button:hover {
  opacity: 1;
}
`;
    // 创建一个style元素
    const style = document.createElement('style');
    // 适用于其他浏览器
    style.appendChild(document.createTextNode(css));
    // 将style元素添加到文档的head部分
    document.head.appendChild(style);
  }
}