import hljs from 'highlight.js'

// Register custom language for codebase-retrieval
hljs.registerLanguage("codebase-retrieval", () => {
    return {
        name: "codebase-retrieval",
        contains: [],
        case_insensitive: true,
        keywords: {}
    };
});

hljs.registerLanguage("vue", (hljs) => {
    return {
        name: "vue",
        subLanguage: "xml",
        contains: [
            hljs.COMMENT("<!--", "-->", {
                relevance: 10,
            }),
            {
                begin: /^(\s*)(<script>)/gm,
                end: /^(\s*)(<\/script>)/gm,
                subLanguage: "javascript",
                excludeBegin: true,
                excludeEnd: true,
            },
            {
                begin: /^(\s*)(<script lang=["']ts["']>)/gm,
                end: /^(\s*)(<\/script>)/gm,
                subLanguage: "typescript",
                excludeBegin: true,
                excludeEnd: true,
            },
            {
                begin: /^(\s*)(<style(\sscoped)?>)/gm,
                end: /^(\s*)(<\/style>)/gm,
                subLanguage: "css",
                excludeBegin: true,
                excludeEnd: true,
            },
            {
                begin: /^(\s*)(<style lang=["'](scss|sass)["'](\sscoped)?>)/gm,
                end: /^(\s*)(<\/style>)/gm,
                subLanguage: "scss",
                excludeBegin: true,
                excludeEnd: true,
            },
            {
                begin: /^(\s*)(<style lang=["']stylus["'](\sscoped)?>)/gm,
                end: /^(\s*)(<\/style>)/gm,
                subLanguage: "stylus",
                excludeBegin: true,
                excludeEnd: true,
            },
        ],
    };
});


export default hljs;