/** Text content of an HTML snippet: tags dropped, whitespace collapsed. */
export const plainText = (html = '') => html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim()
