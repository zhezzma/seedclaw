/**
 * 判定网关地址是否指向本机（spec §5.1：本地网关时服务器文件系统 = 本机，
 * 路径输入框提供原生文件夹选择器）。局域网地址（192.168.* 等）不算本机。
 */
export function isLocalGateway(apiBaseUrl: string): boolean {
    const trimmed = (apiBaseUrl ?? "").trim();
    if (!trimmed) return false;
    try {
        const host = new URL(trimmed).hostname.toLowerCase();
        // WHATWG URL 对 IPv6 hostname 带方括号（"[::1]"），两种形态都认。
        // *.localhost（如 Tauri 壳在 Windows/Linux 的默认源 https://tauri.localhost）
        // 按 RFC 6761 解析到回环，同样算本机。
        return host === "localhost" || host.endsWith(".localhost")
            || host === "::1" || host === "[::1]" || host.startsWith("127.");
    } catch {
        return false;
    }
}
