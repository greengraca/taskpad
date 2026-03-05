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
    // ==highlight== → <mark> tags
    .replace(/==(.*?)==/g, '<mark>$1</mark>')
    // [[wikilinks]] → clickable spans
    .replace(/\[\[([^\]]+)\]\]/g, (_, name) =>
      `<a class="note-wikilink" data-note="${name.trim().replace(/"/g, '&quot;')}">${name.trim()}</a>`
    )
    // #tags → styled spans (only match word-boundary tags, not inside HTML attributes)
    .replace(/(^|\s)#([a-zA-Z0-9_-]+)/g, (_, pre, tag) =>
      `${pre}<span class="note-tag">#${tag}</span>`
    );
};

// Callout type icons and colors
const CALLOUT_ICONS = {
  note: '\u{1F4DD}', tip: '\u{1F4A1}', warning: '\u26A0\uFE0F', danger: '\u{1F534}',
  caution: '\u{1F534}', info: '\u2139\uFE0F', example: '\u{1F4CB}', quote: '\u{1F4AC}',
};

// Post-process blockquotes into callout blocks
const processCallouts = (html) => {
  return html.replace(/<blockquote>\s*<p>\[!([\w]+)\]\s*(.*?)<\/p>([\s\S]*?)<\/blockquote>/g,
    (_, type, titleLine, rest) => {
      const t = type.toLowerCase();
      const icon = CALLOUT_ICONS[t] || CALLOUT_ICONS.note;
      const title = titleLine.trim() || t.charAt(0).toUpperCase() + t.slice(1);
      const content = rest.trim();
      return `<div class="callout callout-${t}"><div class="callout-title">${icon} ${title}</div>${content ? `<div class="callout-content">${content}</div>` : ''}</div>`;
    }
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
  const sanitized = html
    .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
    .replace(/\son\w+\s*=\s*["'][^"']*["']/gi, '')
    .replace(/<a\s+href="/g, '<a target="_blank" rel="noopener noreferrer" href="');
  // Post-process callouts
  const withCallouts = processCallouts(sanitized);
  // Make checkboxes interactive with data-checkbox index
  let cbIdx = 0;
  return withCallouts.replace(/<input\s+(checked=""\s*)?disabled=""\s*(type="checkbox"|checked="")(\s*type="checkbox")?/g,
    (match) => {
      const isChecked = match.includes('checked=""');
      return `<input type="checkbox" data-checkbox="${cbIdx++}"${isChecked ? ' checked=""' : ''}`;
    }
  );
};
