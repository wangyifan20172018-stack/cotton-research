import {
  CandlestickSeries,
  ColorType,
  CrosshairMode,
  HistogramSeries,
  LineSeries,
  createChart,
} from "lightweight-charts";

import {
  formatSigned,
  integerFormatter,
  movingAverage,
  priceFormatter,
} from "../data/market.js";

const MA_DEFINITIONS = [
  { period: 5, color: "#e0a21b" },
  { period: 10, color: "#3c83d6" },
  { period: 20, color: "#a564c9" },
];

function cssColor(container, name) {
  return getComputedStyle(container).getPropertyValue(name).trim();
}

function weekday(dateText) {
  const date = new Date(`${dateText}T00:00:00Z`);
  return `周${"日一二三四五六"[date.getUTCDay()]}`;
}

function toneClass(value) {
  if (value > 0) return "is-rise";
  if (value < 0) return "is-fall";
  return "is-flat";
}

function createPaneLabel(container, text) {
  const label = document.createElement("span");
  label.className = "pane-label";
  label.textContent = text;
  container.append(label);
  return label;
}

export function createMarketChart(container, tooltip) {
  let riseColor = cssColor(container, "--rise");
  let fallColor = cssColor(container, "--fall");
  let rowsByTime = new Map();
  let currentRows = [];
  let initialPeriod = "daily";
  let touchActive = false;
  let touchHideTimer = null;

  const chart = createChart(container, {
    autoSize: true,
    layout: {
      background: { type: ColorType.Solid, color: cssColor(container, "--chart-bg") },
      textColor: cssColor(container, "--muted"),
      fontFamily: '"Segoe UI", "Microsoft YaHei", sans-serif',
      attributionLogo: false,
    },
    grid: {
      vertLines: { color: cssColor(container, "--grid") },
      horzLines: { color: cssColor(container, "--grid") },
    },
    crosshair: {
      mode: CrosshairMode.Normal,
      vertLine: { color: cssColor(container, "--crosshair") },
      horzLine: { color: cssColor(container, "--crosshair") },
    },
    rightPriceScale: {
      borderColor: cssColor(container, "--border"),
      scaleMargins: { top: 0.08, bottom: 0.08 },
    },
    timeScale: {
      borderColor: cssColor(container, "--border"),
      timeVisible: false,
      secondsVisible: false,
      rightOffset: 4,
      barSpacing: 7,
      minBarSpacing: 1.5,
    },
    localization: {
      locale: "zh-CN",
      priceFormatter: (price) => priceFormatter.format(price),
    },
  });

  const candleSeries = chart.addSeries(CandlestickSeries, {
    upColor: riseColor,
    downColor: fallColor,
    borderUpColor: riseColor,
    borderDownColor: fallColor,
    wickUpColor: riseColor,
    wickDownColor: fallColor,
    priceFormat: { type: "price", precision: 0, minMove: 1 },
    priceLineVisible: true,
    lastValueVisible: true,
  }, 0);

  const maSeries = new Map(
    MA_DEFINITIONS.map(({ period, color }) => {
      const series = chart.addSeries(LineSeries, {
        color,
        lineWidth: 1,
        priceLineVisible: false,
        lastValueVisible: false,
        crosshairMarkerVisible: false,
      }, 0);
      return [period, series];
    }),
  );

  const volumeSeries = chart.addSeries(HistogramSeries, {
    priceFormat: { type: "volume" },
    priceLineVisible: false,
    lastValueVisible: false,
    priceScaleId: "right",
  }, 1);

  const openInterestSeries = chart.addSeries(LineSeries, {
    color: cssColor(container, "--oi-line"),
    lineWidth: 1,
    priceLineVisible: false,
    lastValueVisible: false,
    crosshairMarkerVisible: false,
    priceScaleId: "right",
  }, 2);

  volumeSeries.priceScale().applyOptions({
    scaleMargins: { top: 0.18, bottom: 0 },
  });
  openInterestSeries.priceScale().applyOptions({
    scaleMargins: { top: 0.16, bottom: 0.06 },
  });

  const paneLabels = {
    volume: createPaneLabel(container, "成交量"),
    openInterest: createPaneLabel(container, "持仓量"),
  };

  function renderTooltip(row, point) {
    if (!row || !point) {
      tooltip.hidden = true;
      return;
    }

    const tone = toneClass(row.change);
    const changeText = row.change === null
      ? "--"
      : `${formatSigned(row.change)}（${formatSigned(row.changePercent)}%）`;

    tooltip.innerHTML = `
      <div class="tooltip-date">${row.date} ${weekday(row.date)}</div>
      <div class="tooltip-grid">
        <span>开</span><strong>${priceFormatter.format(row.open)}</strong>
        <span>高</span><strong class="is-rise">${priceFormatter.format(row.high)}</strong>
        <span>低</span><strong class="is-fall">${priceFormatter.format(row.low)}</strong>
        <span>收</span><strong>${priceFormatter.format(row.close)}</strong>
        <span>涨跌</span><strong class="${tone}">${changeText}</strong>
        <span>成交量</span><strong>${integerFormatter.format(row.volume)}</strong>
        <span>持仓量</span><strong>${integerFormatter.format(row.openInterest)}</strong>
      </div>
    `;
    tooltip.hidden = false;

    const margin = 10;
    const tooltipWidth = tooltip.offsetWidth || 230;
    const tooltipHeight = tooltip.offsetHeight || 180;
    let left = point.x + 16;
    if (left + tooltipWidth > container.clientWidth - margin) {
      left = point.x - tooltipWidth - 16;
    }
    left = Math.max(margin, Math.min(left, container.clientWidth - tooltipWidth - margin));
    const top = Math.max(
      margin,
      Math.min(point.y - tooltipHeight / 2, container.clientHeight - tooltipHeight - margin),
    );

    tooltip.style.left = `${left}px`;
    tooltip.style.top = `${top}px`;
  }

  function rowFromTime(time) {
    if (!time) return null;
    const key = typeof time === "string"
      ? time
      : `${time.year}-${String(time.month).padStart(2, "0")}-${String(time.day).padStart(2, "0")}`;
    return rowsByTime.get(key) ?? null;
  }

  chart.subscribeCrosshairMove((param) => {
    if (!param.time || !param.point) {
      if (!touchActive) tooltip.hidden = true;
      return;
    }
    const row = rowFromTime(param.time);
    renderTooltip(row, param.point);
  });

  function syncPaneHeights() {
    const panes = chart.panes();
    if (panes.length < 3) return;

    // 用 stretchFactor 同时分配三个面板的高度，避免逐个 setHeight 时互相挤压。
    const applyHeights = () => {
      if (container.clientHeight === 0) return;
      const compact = container.clientWidth < 640;
      const timeAxisHeight = chart.timeScale().height();
      const availableHeight = container.clientHeight - timeAxisHeight;
      const subPaneHeight = compact ? 76 : 92;
      const mainPaneHeight = Math.max(160, availableHeight - subPaneHeight * 2);

      panes[0].setStretchFactor(mainPaneHeight);
      panes[1].setStretchFactor(subPaneHeight);
      panes[2].setStretchFactor(subPaneHeight);

      // 图表面板本身会遮住 HTML 标签，因此把标签放到容器上层并按分栏高度定位。
      requestAnimationFrame(() => {
        const paneOneHeight = panes[1].getHeight();
        const paneTwoHeight = panes[2].getHeight();
        const panesBottom = container.clientHeight - chart.timeScale().height();
        paneLabels.volume.style.top = `${panesBottom - paneOneHeight - paneTwoHeight + 7}px`;
        paneLabels.openInterest.style.top = `${panesBottom - paneTwoHeight + 7}px`;
      });
    };

    applyHeights();
    requestAnimationFrame(applyHeights);
  }

  const resizeObserver = new ResizeObserver(syncPaneHeights);
  resizeObserver.observe(container);
  syncPaneHeights();

  function showNearestTooltip(event) {
    if (event.pointerType === "mouse") return;
    touchActive = true;
    const rect = container.getBoundingClientRect();
    const x = event.clientX - rect.left;
    const y = event.clientY - rect.top;
    const row = rowFromTime(chart.timeScale().coordinateToTime(x));
    renderTooltip(row, { x, y: Math.max(28, y) });
  }

  container.addEventListener("pointerdown", (event) => {
    clearTimeout(touchHideTimer);
    showNearestTooltip(event);
  }, { passive: true });

  container.addEventListener("pointermove", (event) => {
    if (event.pointerType !== "mouse") showNearestTooltip(event);
  }, { passive: true });

  const hideTouchTooltip = (event) => {
    if (event.pointerType === "mouse") return;
    touchHideTimer = setTimeout(() => {
      touchActive = false;
      tooltip.hidden = true;
    }, 1800);
  };
  container.addEventListener("pointerup", hideTouchTooltip, { passive: true });
  container.addEventListener("pointercancel", hideTouchTooltip, { passive: true });
  container.addEventListener("pointerleave", (event) => {
    if (event.pointerType !== "touch" && !touchActive) tooltip.hidden = true;
  });

  function updateMAs() {
    for (const { period } of MA_DEFINITIONS) {
      maSeries.get(period).setData(movingAverage(currentRows, period));
    }
  }

  function setData(rows, period = initialPeriod, { resetView = false } = {}) {
    tooltip.hidden = true;
    currentRows = rows;
    initialPeriod = period;
    rowsByTime = new Map(rows.map((row) => [row.date, row]));

    candleSeries.setData(rows.map((row) => ({
      time: row.date,
      open: row.open,
      high: row.high,
      low: row.low,
      close: row.close,
    })));

    volumeSeries.setData(rows.map((row) => ({
      time: row.date,
      value: row.volume,
      color: row.close > row.open
        ? `${riseColor}99`
        : row.close < row.open
          ? `${fallColor}99`
          : cssColor(container, "--volume-flat"),
    })));

    openInterestSeries.setData(rows.map((row) => ({
      time: row.date,
      value: row.openInterest,
    })));

    updateMAs();
    syncPaneHeights();

    if (resetView) {
      const visibleBars = period === "weekly" ? 160 : 260;
      chart.timeScale().setVisibleLogicalRange({
        from: Math.max(0, rows.length - visibleBars),
        to: rows.length + 3,
      });
    }
  }

  function setMAPeriod(period, visible) {
    maSeries.get(period)?.applyOptions({ visible });
  }

  function applyTheme() {
    riseColor = cssColor(container, "--rise");
    fallColor = cssColor(container, "--fall");
    chart.applyOptions({
      layout: {
        background: { type: ColorType.Solid, color: cssColor(container, "--chart-bg") },
        textColor: cssColor(container, "--muted"),
      },
      grid: {
        vertLines: { color: cssColor(container, "--grid") },
        horzLines: { color: cssColor(container, "--grid") },
      },
      crosshair: {
        vertLine: { color: cssColor(container, "--crosshair") },
        horzLine: { color: cssColor(container, "--crosshair") },
      },
      rightPriceScale: { borderColor: cssColor(container, "--border") },
      timeScale: { borderColor: cssColor(container, "--border") },
    });
    candleSeries.applyOptions({
      upColor: riseColor,
      downColor: fallColor,
      borderUpColor: riseColor,
      borderDownColor: fallColor,
      wickUpColor: riseColor,
      wickDownColor: fallColor,
    });
    openInterestSeries.applyOptions({ color: cssColor(container, "--oi-line") });
    setData(currentRows, initialPeriod);
  }

  const themeMedia = window.matchMedia("(prefers-color-scheme: dark)");
  themeMedia.addEventListener("change", applyTheme);

  return {
    setData,
    setMAPeriod,
    applyTheme,
    destroy() {
      clearTimeout(touchHideTimer);
      resizeObserver.disconnect();
      themeMedia.removeEventListener("change", applyTheme);
      chart.remove();
    },
  };
}
