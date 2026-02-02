
export function normalizeBasePath(basePath: string): string {
    if (!basePath) {
        return "";
    }
    let base = basePath.trim();
    if (!base.startsWith("/")) {
        base = `/${base}`;
    }
    if (base === "/") {
        return "";
    }
    if (base.endsWith("/")) {
        base = base.slice(0, -1);
    }
    return base;
}