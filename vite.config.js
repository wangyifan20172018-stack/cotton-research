import { readdir, readFile } from "node:fs/promises";
import { basename, join } from "node:path";
import { fileURLToPath } from "node:url";
import matter from "gray-matter";
import { marked } from "marked";
import { defineConfig } from "vite";

const CONTENT_ROOT = fileURLToPath(new URL("./content/", import.meta.url));
const NOTES_DIR = join(CONTENT_ROOT, "notes");
const NEWS_FILE = join(CONTENT_ROOT, "news.json");
const VIRTUAL_ID = "virtual:research-content";
const RESOLVED_ID = `\0${VIRTUAL_ID}`;

function normalizeDate(value, filePath) {
  const date = value instanceof Date
    ? value.toISOString().slice(0, 10)
    : String(value ?? "").trim();

  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || Number.isNaN(Date.parse(`${date}T00:00:00Z`))) {
    throw new Error(`${filePath}: date 必须是 YYYY-MM-DD，当前为 ${date || "空"}`);
  }
  return date;
}

function createExcerpt(markdown) {
  const text = markdown
    .replace(/```[\s\S]*?```/g, " ")
    .replace(/!\[[^\]]*\]\([^)]*\)/g, " ")
    .replace(/\[([^\]]+)\]\([^)]*\)/g, "$1")
    .replace(/^#{1,6}\s+/gm, "")
    .replace(/[>*_~`|#-]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  return text.length > 110 ? `${text.slice(0, 110)}…` : text;
}

async function loadNotes() {
  const files = (await readdir(NOTES_DIR))
    .filter((file) => file.endsWith(".md"))
    .sort();

  const notes = [];
  const slugs = new Set();

  for (const file of files) {
    const filePath = join(NOTES_DIR, file);
    const source = await readFile(filePath, "utf8");
    const parsed = matter(source);
    const slug = basename(file, ".md");

    if (slugs.has(slug)) {
      throw new Error(`${filePath}: 文件名重复，无法生成唯一详情页地址`);
    }
    slugs.add(slug);

    const title = String(parsed.data.title ?? "").trim();
    const symbol = String(parsed.data.symbol ?? "").trim().toUpperCase();
    if (!title) throw new Error(`${filePath}: 缺少 title`);
    if (!/^[A-Z]{1,3}$/.test(symbol)) {
      throw new Error(`${filePath}: symbol 应为 CF、CY、SR、P、RU 这类品种代码`);
    }

    const tags = Array.isArray(parsed.data.tags)
      ? parsed.data.tags.map((tag) => String(tag).trim()).filter(Boolean)
      : [];

    notes.push({
      slug,
      file,
      date: normalizeDate(parsed.data.date, filePath),
      symbol,
      tags,
      title,
      excerpt: createExcerpt(parsed.content),
      readingMinutes: Math.max(1, Math.ceil(parsed.content.replace(/\s+/g, "").length / 450)),
      html: marked.parse(parsed.content, { gfm: true, breaks: false }).trim(),
    });
  }

  return notes.sort((a, b) => b.date.localeCompare(a.date) || a.title.localeCompare(b.title));
}

async function loadNews() {
  const raw = JSON.parse(await readFile(NEWS_FILE, "utf8"));
  if (!Array.isArray(raw)) throw new Error(`${NEWS_FILE}: 顶层必须是数组`);

  return raw
    .map((item, index) => {
      const label = `${NEWS_FILE} 第 ${index + 1} 条`;
      for (const field of ["title", "source", "url", "date", "comment"]) {
        if (typeof item[field] !== "string" || !item[field].trim()) {
          throw new Error(`${label}: 字段 ${field} 必须是非空字符串`);
        }
      }

      let url;
      try {
        url = new URL(item.url);
      } catch {
        throw new Error(`${label}: url 不是有效地址`);
      }
      if (!["http:", "https:"].includes(url.protocol)) {
        throw new Error(`${label}: url 只允许 http/https`);
      }

      return {
        title: item.title.trim(),
        source: item.source.trim(),
        url: url.href,
        date: normalizeDate(item.date, label),
        comment: item.comment.trim(),
      };
    })
    .sort((a, b) => b.date.localeCompare(a.date) || a.title.localeCompare(b.title));
}

function researchContentPlugin() {
  let cache = null;

  async function loadContent() {
    if (cache) return cache;
    const [notes, news] = await Promise.all([loadNotes(), loadNews()]);
    cache = { notes, news };
    console.log(`[content] 已读取 ${notes.length} 篇笔记、${news.length} 条要闻`);
    return cache;
  }

  return {
    name: "research-content",
    resolveId(id) {
      return id === VIRTUAL_ID ? RESOLVED_ID : null;
    },
    async load(id) {
      if (id !== RESOLVED_ID) return null;
      const content = await loadContent();
      return `export const notes = ${JSON.stringify(content.notes)};\nexport const news = ${JSON.stringify(content.news)};`;
    },
    buildStart() {
      cache = null;
    },
    configureServer(server) {
      server.watcher.add(CONTENT_ROOT);
    },
    handleHotUpdate({ file, server }) {
      if (!file.startsWith(CONTENT_ROOT)) return;
      cache = null;
      const module = server.moduleGraph.getModuleById(RESOLVED_ID);
      if (module) server.moduleGraph.invalidateModule(module);
      server.ws.send({ type: "full-reload" });
      return [];
    },
  };
}

export default defineConfig({
  // 相对路径可同时适配本地预览和 GitHub Pages 的子路径部署
  base: "./",
  plugins: [researchContentPlugin()],
  server: {
    host: "127.0.0.1",
    port: 5173,
  },
});
