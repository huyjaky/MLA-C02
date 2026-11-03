/** Resolves bilingual content pairs ({ en, vi }) and UI strings for one language. */
export class Localizer {
  static LANGS = ['en', 'vi']

  constructor(lang, dictionaries) {
    this.lang = lang
    this.dictionaries = dictionaries
  }

  get other() {
    return this.lang === 'en' ? 'vi' : 'en'
  }

  get locale() {
    return this.lang === 'vi' ? 'vi-VN' : 'en-GB'
  }

  /** Date/time `ms` formatted for this language; formatters are cached per option set. */
  date(ms, options) {
    const key = JSON.stringify(options)
    this.formats ??= new Map()
    if (!this.formats.has(key)) this.formats.set(key, new Intl.DateTimeFormat(this.locale, options))
    return this.formats.get(key).format(ms)
  }

  /** Text of a content pair in `lang`, falling back to English when untranslated. */
  text(pair, lang = this.lang) {
    if (pair == null) return ''
    if (typeof pair === 'string') return pair
    return pair[lang] || pair.en || ''
  }

  /** UI string by key, with `{name}` placeholders filled from `vars`. */
  ui(key, vars) {
    const raw = this.dictionaries[this.lang][key] ?? this.dictionaries.en[key] ?? key
    return vars ? raw.replace(/\{(\w+)\}/g, (_, name) => vars[name] ?? '') : raw
  }

  /** Time in seconds as m:ss or h:mm:ss. */
  static clock(totalSeconds) {
    const s = Math.max(0, Math.floor(totalSeconds))
    const parts = [Math.floor(s / 3600), Math.floor((s % 3600) / 60), s % 60]
    const [h, m, sec] = parts.map((n) => String(n).padStart(2, '0'))
    return parts[0] ? `${parts[0]}:${m}:${sec}` : `${Number(m)}:${sec}`
  }
}
