import {
  allNews,
  allNotes,
  filterNotes,
  formatContentDate,
  getLatestNotesForSymbol,
  getNoteBySlug,
  noteSymbols,
  noteTags,
} from "../data/content.js";

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function noteUrl(slug) {
  return `#/notes/${encodeURIComponent(slug)}`;
}

function notesFilterUrl(symbol, tag) {
  const params = new URLSearchParams();
  if (symbol !== "all") params.set("symbol", symbol);
  if (tag !== "all") params.set("tag", tag);
  const query = params.toString();
  return `#/notes${query ? `?${query}` : ""}`;
}

function tagLinks(tags) {
  return tags.map((tag) => (
    `<a class="tag-pill" href="${notesFilterUrl("all", tag)}">${escapeHtml(tag)}</a>`
  )).join("");
}

function noteCard(note) {
  return `
    <article class="note-card">
      <div class="note-card-meta">
        <span class="note-symbol">${escapeHtml(note.symbol)}</span>
        <time datetime="${escapeHtml(note.date)}">${formatContentDate(note.date)}</time>
        <span>约 ${note.readingMinutes} 分钟</span>
      </div>
      <h3><a href="${noteUrl(note.slug)}">${escapeHtml(note.title)}</a></h3>
      <p class="note-excerpt">${escapeHtml(note.excerpt)}</p>
      <div class="tag-row">${tagLinks(note.tags)}</div>
    </article>
  `;
}

function compactNote(note) {
  return `
    <article class="home-note-item">
      <div class="home-note-meta">
        <span class="note-symbol">${escapeHtml(note.symbol)}</span>
        <time datetime="${escapeHtml(note.date)}">${formatContentDate(note.date)}</time>
      </div>
      <h3><a href="${noteUrl(note.slug)}">${escapeHtml(note.title)}</a></h3>
      <p>${escapeHtml(note.excerpt)}</p>
      <div class="tag-row">${tagLinks(note.tags.slice(0, 3))}</div>
    </article>
  `;
}

function filterChip(label, href, active) {
  return `<a class="filter-chip" href="${href}"${active ? ' aria-current="true"' : ""}>${escapeHtml(label)}</a>`;
}

export function renderHomeNotes(symbol) {
  const notes = getLatestNotesForSymbol(symbol, 3);
  if (notes.length === 0) {
    return `<p class="empty-state">暂无 ${escapeHtml(symbol)} 相关笔记。</p>`;
  }
  return notes.map(compactNote).join("");
}

export function renderHomeNews(limit = 4) {
  const news = allNews.slice(0, limit);
  if (news.length === 0) {
    return `<p class="empty-state">暂无要闻。</p>`;
  }

  return news.map((item) => `
    <article class="news-item">
      <div class="news-meta">
        <span>${escapeHtml(item.source)}</span>
        <time datetime="${escapeHtml(item.date)}">${formatContentDate(item.date)}</time>
      </div>
      <a class="news-title" href="${escapeHtml(item.url)}" target="_blank" rel="noopener noreferrer">
        ${escapeHtml(item.title)}
        <span aria-hidden="true">↗</span>
      </a>
      <p class="news-comment"><span>点评</span>${escapeHtml(item.comment)}</p>
    </article>
  `).join("");
}

export function renderNotesPage({ symbol = "all", tag = "all" } = {}) {
  const activeSymbol = symbol !== "all" && noteSymbols.includes(symbol) ? symbol : "all";
  const activeTag = tag !== "all" && noteTags.includes(tag) ? tag : "all";
  const notes = filterNotes({ symbol: activeSymbol, tag: activeTag });
  const hasFilter = activeSymbol !== "all" || activeTag !== "all";

  const symbolChips = [
    filterChip("全部", notesFilterUrl("all", activeTag), activeSymbol === "all"),
    ...noteSymbols.map((item) => filterChip(
      item,
      notesFilterUrl(item, activeTag),
      activeSymbol === item,
    )),
  ].join("");

  const tagChips = [
    filterChip("全部标签", notesFilterUrl(activeSymbol, "all"), activeTag === "all"),
    ...noteTags.map((item) => filterChip(
      item,
      notesFilterUrl(activeSymbol, item),
      activeTag === item,
    )),
  ].join("");

  const list = notes.length
    ? `<div class="notes-grid">${notes.map(noteCard).join("")}</div>`
    : `
      <div class="empty-state empty-state--panel">
        <strong>没有符合条件的笔记</strong>
        <p>调整品种或标签筛选，或者清除当前筛选条件。</p>
        <a class="text-link" href="#/notes">清除筛选</a>
      </div>
    `;

  return `
    <section class="notes-page" aria-labelledby="notesPageTitle">
      <header class="page-heading">
        <p class="eyebrow">RESEARCH ARCHIVE</p>
        <h1 id="notesPageTitle">研究笔记</h1>
        <p class="page-intro">记录郑棉的价格、基差、持仓和产业信息。按日期倒序排列，可按品种与标签筛选。</p>
      </header>

      <section class="filter-panel" aria-label="笔记筛选">
        <div class="filter-row">
          <span class="filter-label">品种</span>
          <div class="filter-options">${symbolChips}</div>
        </div>
        <div class="filter-row">
          <span class="filter-label">标签</span>
          <div class="filter-options">${tagChips}</div>
        </div>
        ${hasFilter ? '<a class="clear-filter" href="#/notes">清除筛选</a>' : ""}
      </section>

      <div class="result-heading">
        <span>共 <strong>${notes.length}</strong> 篇</span>
        <span>${activeSymbol === "all" ? "全部品种" : activeSymbol}${activeTag === "all" ? "" : ` · ${escapeHtml(activeTag)}`}</span>
      </div>

      ${list}
    </section>
  `;
}

export function renderNoteDetail(slug) {
  const note = getNoteBySlug(slug);
  if (!note) {
    return `
      <section class="not-found">
        <p class="eyebrow">404 · NOTE NOT FOUND</p>
        <h1>没有找到这篇笔记</h1>
        <p>文件名可能已修改，或者这篇笔记已经被删除。</p>
        <a class="text-link" href="#/notes">返回笔记列表 <span aria-hidden="true">→</span></a>
      </section>
    `;
  }

  const index = allNotes.findIndex((item) => item.slug === note.slug);
  const newer = index > 0 ? allNotes[index - 1] : null;
  const older = index < allNotes.length - 1 ? allNotes[index + 1] : null;

  return `
    <article class="note-detail">
      <nav class="breadcrumb" aria-label="面包屑">
        <a href="#/notes">研究笔记</a>
        <span aria-hidden="true">/</span>
        <span>${escapeHtml(note.symbol)}</span>
      </nav>

      <header class="note-detail-header">
        <div class="detail-meta">
          <span class="note-symbol">${escapeHtml(note.symbol)}</span>
          <time datetime="${escapeHtml(note.date)}">${formatContentDate(note.date)}</time>
          <span>约 ${note.readingMinutes} 分钟阅读</span>
        </div>
        <h1>${escapeHtml(note.title)}</h1>
        <div class="tag-row">${tagLinks(note.tags)}</div>
      </header>

      <div class="note-content">
        ${note.html}
      </div>

      <footer class="note-detail-footer">
        <a class="text-link" href="#/notes">← 返回笔记列表</a>
        <div class="note-pagination">
          ${newer ? `<a href="${noteUrl(newer.slug)}"><span>更新一篇</span>${escapeHtml(newer.title)}</a>` : ""}
          ${older ? `<a href="${noteUrl(older.slug)}"><span>更早一篇</span>${escapeHtml(older.title)}</a>` : ""}
        </div>
      </footer>
    </article>
  `;
}

export { escapeHtml };
