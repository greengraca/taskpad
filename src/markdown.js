import { marked } from 'marked';

// Extract [[wikilink]] targets from raw content
export const extractLinks = (content) => {
  const links = [];
  const re = /\[\[([^\]]+)\]\]/g;
  let m;
  while ((m = re.exec(content))) links.push(m[1].trim());
  return [...new Set(links)];
};

// Extract #tags from raw content
export const extractTags = (content) => {
  const tags = [];
  const re = /(?:^|\s)#([a-zA-Z0-9_-]+)/g;
  let m;
  while ((m = re.exec(content))) tags.push(m[1].toLowerCase());
  return [...new Set(tags)];
};

// Convert wikilinks and tags before passing to marked
const preprocess = (content) => {
  return content
    // [[wikilinks]] → clickable spans
    .replace(/\[\[([^\]]+)\]\]/g, (_, name) =>
      `<a class="note-wikilink" data-note="${name.trim().replace(/"/g, '&quot;')}">${name.trim()}</a>`
    )
    // #tags → styled spans (only match word-boundary tags, not inside HTML attributes)
    .replace(/(^|\s)#([a-zA-Z0-9_-]+)/g, (_, pre, tag) =>
      `${pre}<span class="note-tag">#${tag}</span>`
    );
};

// Parse markdown content to sanitized HTML
export const parseMarkdown = (content) => {
  if (!content) return '';
  const preprocessed = preprocess(content);
  const html = marked.parse(preprocessed, {
    breaks: true,
    gfm: true,
  });
  // Basic sanitization: strip script tags and event handlers
  return html
    .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
    .replace(/\son\w+\s*=\s*["'][^"']*["']/gi, '')
    .replace(/<a\s+href="/g, '<a target="_blank" rel="noopener noreferrer" href="');
};
