import "./styles.css";
import { DEFAULT_PRODUCT } from "./config/products.js";
import {
  addChanges,
  aggregateWeekly,
  formatSigned,
  loadMarketData,
  priceFormatter,
} from "./data/market.js";
import { getNoteBySlug } from "./data/content.js";
import { createMarketChart } from "./charts/klineChart.js";
import {
  renderHomeNews,
  renderHomeNotes,
  renderNoteDetail,
  renderNotesPage,
} from "./views/research.js";

const product = DEFAULT_PRODUCT;
const elements = {
  homeView: document.querySelector("#homeView"),
  dynamicView: document.querySelector("#dynamicView"),
  navLinks: [...document.querySelectorAll("[data-nav]")],
  brandSymbol: document.querySelector("#brandSymbol"),
  productName: document.querySelector("#productName"),
  contractBadge: document.querySelector("#contractBadge"),
  latestPrice: document.querySelector("#latestPrice"),
  latestChange: document.querySelector("#latestChange"),
  latestDate: document.querySelector("#latestDate"),
  dataUpdatedAt: document.querySelector("#dataUpdatedAt"),
  latestSource: document.querySelector("#latestSource"),
  chart: document.querySelector("#chart"),
  chartTooltip: document.querySelector("#chartTooltip"),
  chartLoading: document.querySelector("#chartLoading"),
  chartError: document.querySelector("#chartError"),
  chartErrorText: document.querySelector("#chartErrorText"),
  activePeriod: document.querySelector("#activePeriod"),
  productNotes: document.querySelector("#productNotes"),
  newsList: document.querySelector("#newsList"),
  maInputs: [...document.querySelectorAll("[data-ma]")],
  periodButtons: [...document.querySelectorAll("[data-period]")],
};

const state = {
  period: "daily",
  daily: [],
  weekly: [],
  chart: null,
};

function toneClass(value) {
  if (value > 0) return "is-rise";
  if (value < 0) return "is-fall";
  return "is-flat";
}

function renderProductMeta(meta) {
  elements.brandSymbol.textContent = product.code;
  elements.productName.textContent = product.fullName;
  elements.contractBadge.textContent = `${meta.symbol} · 主力连续`;
  elements.latestSource.textContent = `${meta.source.provider} · ${meta.source.upstream} · ${meta.symbol}`;

  const updated = new Date(meta.updatedAt);
  elements.dataUpdatedAt.textContent = Number.isNaN(updated.getTime())
    ? "更新时间未知"
    : `数据更新：${updated.toLocaleString("zh-CN", {
      timeZone: "Asia/Shanghai",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    })}`;
}

function renderLatest(rows) {
  const latest = rows.at(-1);
  const tone = toneClass(latest.change);
  elements.latestPrice.textContent = priceFormatter.format(latest.close);
  elements.latestPrice.className = `price-value ${tone}`;

  const changeText = latest.change === null
    ? "--"
    : `${formatSigned(latest.change)}  ${formatSigned(latest.changePercent)}%`;
  elements.latestChange.textContent = changeText;
  elements.latestChange.className = `price-change ${tone}`;
  elements.latestDate.textContent = `${latest.date} 收盘`;
}

function activeRows() {
  return state.period === "weekly" ? state.weekly : state.daily;
}

function switchPeriod(period) {
  if (period === state.period) return;
  state.period = period;
  for (const button of elements.periodButtons) {
    button.setAttribute("aria-pressed", String(button.dataset.period === period));
  }
  elements.activePeriod.textContent = period === "daily" ? "日 K" : "周 K";
  state.chart?.setData(activeRows(), period, { resetView: true });
}

function bindControls() {
  for (const button of elements.periodButtons) {
    button.addEventListener("click", () => switchPeriod(button.dataset.period));
  }

  for (const input of elements.maInputs) {
    input.addEventListener("change", () => {
      state.chart?.setMAPeriod(Number(input.dataset.ma), input.checked);
    });
  }
}

function showChartError(error) {
  console.error(error);
  elements.chartLoading.hidden = true;
  elements.chartError.hidden = false;
  elements.chartErrorText.textContent =
    `${error.message}。请先在项目根目录运行数据脚本，再刷新页面。`;
  elements.chart.classList.add("has-error");
}

function parseRoute() {
  const raw = window.location.hash.replace(/^#/, "") || "/";
  const [rawPath, rawQuery = ""] = raw.split("?");
  return {
    path: rawPath || "/",
    params: new URLSearchParams(rawQuery),
  };
}

function setActiveNav(routeName) {
  for (const link of elements.navLinks) {
    if (link.dataset.nav === routeName) {
      link.setAttribute("aria-current", "page");
    } else {
      link.removeAttribute("aria-current");
    }
  }
}

function ensureChart() {
  if (state.chart || state.daily.length === 0 || elements.homeView.hidden) return;
  state.chart = createMarketChart(elements.chart, elements.chartTooltip);
  state.chart.setData(activeRows(), state.period, { resetView: true });
  for (const input of elements.maInputs) {
    state.chart.setMAPeriod(Number(input.dataset.ma), input.checked);
  }
  elements.chartLoading.hidden = true;
  elements.chart.classList.add("is-ready");
}

function showHome() {
  elements.homeView.hidden = false;
  elements.dynamicView.hidden = true;
  document.title = `${product.fullName}行情 | 棉研手记`;
  setActiveNav("market");

  // 直接打开笔记页时图表尚未创建；回到行情页后再按可见容器尺寸初始化。
  requestAnimationFrame(() => {
    ensureChart();
    if (state.chart) state.chart.setData(activeRows(), state.period);
  });
}

function showNotesPage(params) {
  elements.homeView.hidden = true;
  elements.dynamicView.hidden = false;
  elements.dynamicView.innerHTML = renderNotesPage({
    symbol: params.get("symbol") ?? "all",
    tag: params.get("tag") ?? "all",
  });
  document.title = "研究笔记 | 棉研手记";
  setActiveNav("notes");
}

function showNoteDetail(rawSlug) {
  let slug = rawSlug;
  try {
    slug = decodeURIComponent(rawSlug);
  } catch {
    // 保留原始值，由详情页展示未找到状态。
  }

  const note = getNoteBySlug(slug);
  elements.homeView.hidden = true;
  elements.dynamicView.hidden = false;
  elements.dynamicView.innerHTML = renderNoteDetail(slug);
  document.title = note ? `${note.title} | 棉研手记` : "笔记不存在 | 棉研手记";
  setActiveNav("notes");
}

function showNotFound() {
  elements.homeView.hidden = true;
  elements.dynamicView.hidden = false;
  elements.dynamicView.innerHTML = `
    <section class="not-found">
      <p class="eyebrow">404 · PAGE NOT FOUND</p>
      <h1>没有找到这个页面</h1>
      <p>请从上方导航进入行情页或研究笔记。</p>
      <a class="text-link" href="#/">返回行情首页 <span aria-hidden="true">→</span></a>
    </section>
  `;
  document.title = "页面不存在 | 棉研手记";
  setActiveNav("");
}

function renderRoute() {
  const { path, params } = parseRoute();

  if (path === "/" || path === "") {
    showHome();
  } else if (path === "/notes") {
    showNotesPage(params);
  } else {
    const detailMatch = path.match(/^\/notes\/([^/]+)$/);
    if (detailMatch) {
      showNoteDetail(detailMatch[1]);
    } else {
      showNotFound();
    }
  }

  window.scrollTo(0, 0);
}

async function init() {
  bindControls();
  elements.productNotes.innerHTML = renderHomeNotes(product.code);
  elements.newsList.innerHTML = renderHomeNews(4);
  window.addEventListener("hashchange", renderRoute);
  renderRoute();

  try {
    const { meta, rows } = await loadMarketData(product.dataFile);
    if (String(meta.symbol).replace(/\d+$/, "") !== product.code) {
      throw new Error(`数据文件品种 ${meta.symbol} 与页面品种 ${product.code} 不一致`);
    }

    state.daily = addChanges(rows);
    state.weekly = addChanges(aggregateWeekly(rows));

    renderProductMeta(meta);
    renderLatest(state.daily);

    ensureChart();
  } catch (error) {
    showChartError(error);
  }
}

window.addEventListener("beforeunload", () => state.chart?.destroy());
init();
