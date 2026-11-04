import raw from '../CREDITS.md?raw';

function escapeHtml(value) {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function inline(text) {
  return escapeHtml(text).replace(
    /\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g,
    '<a href="$2" target="_blank" rel="noopener noreferrer">$1</a>',
  );
}

/** Render the repo CREDITS.md. The About screen shows this and nothing else. */
export function creditsHtml() {
  const lines = String(raw).replace(/\r\n/g, '\n').split('\n');
  let html = '';
  let list = false;

  function closeList() {
    if (!list) return;
    html += '</ul>';
    list = false;
  }

  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i];
    if (!line.trim()) {
      closeList();
      continue;
    }
    if (line.startsWith('### ')) {
      closeList();
      html += `<h3>${inline(line.slice(4))}</h3>`;
    } else if (line.startsWith('## ')) {
      closeList();
      html += `<h3>${inline(line.slice(3))}</h3>`;
    } else if (line.startsWith('# ')) {
      closeList();
      html += `<h2>${inline(line.slice(2))}</h2>`;
    } else if (line.startsWith('- ')) {
      if (!list) {
        html += '<ul>';
        list = true;
      }
      html += `<li>${inline(line.slice(2))}</li>`;
    } else {
      closeList();
      html += `<p>${inline(line)}</p>`;
    }
  }
  closeList();
  return html;
}
