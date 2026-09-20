/** 共享解析：trim → new URL，失败返回 null（isLocalGateway/gatewayHostLabel 共用）。 */
const parseGatewayUrl = (apiBaseUrl: string): URL | null => {
    const trimmed = apiBaseUrl.trim();
    if (!trimmed) return null;
    try {
        return new URL(trimmed);
    } catch {
        return null;
    }
}

/**
 * 判定网关地址是否指向本机（spec §5.1：本地网关时服务器文件系统 = 本机，
 * 路径输入框提供原生文件夹选择器）。局域网地址（192.168.* 等）不算本机。
 */
export function isLocalGateway(apiBaseUrl: string): boolean {
    const url = parseGatewayUrl(apiBaseUrl);
    if (!url) return false;
    const host = url.hostname.toLowerCase();
    // WHATWG URL 对 IPv6 hostname 恒带方括号（"[::1]"，无裸 "::1" 形态）。
    // 127/8 回环段按 IPv4 形状整串匹配 ^127(\.\d{1,3}){3}$（如 127.1.2.3），
    // 防 "127.0.0.1.evil.com" / "127.1.2.3.com" 这类前缀欺骗；
    // *.localhost（如 Tauri 壳在 Windows/Linux 的默认源 https://tauri.localhost）
    // 按 RFC 6761 解析到回环，同样算本机。
    return host === "localhost" || host.endsWith(".localhost")
        || host === "[::1]" || /^127(?:\.\d{1,3}){3}$/.test(host);
}

/**
 * 取网关地址的 host 标签（hostname:port）用于账号菜单显示；非法/空地址返回 ''。
 * 手机隧道 origin 形如 http://159.138.99.139:18799 → '159.138.99.139:18799'。
 */
export function gatewayHostLabel(apiBaseUrl: string): string {
    return parseGatewayUrl(apiBaseUrl)?.host ?? '';
}
