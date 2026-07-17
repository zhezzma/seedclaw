import { createI18n } from 'vue-i18n'
import zh from './zh.ts'
import en from './en.ts'

export const i18n = createI18n({
    legacy: false,
    locale: 'zh', // default locale
    fallbackLocale: 'en',
    messages: {
        zh,
        en
    }
})
