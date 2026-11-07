/**
 * 行情数据只在这里做清洗、周线聚合和均线计算，图表组件保持通用。
 */

function parseDate(dateText) {
  const [year, month, day] = dateText.split("-").map(Number);
  return new Date(Date.UTC(year, month - 1, day));
}

function assertRow(row) {
  const keys = ["date", "open", "high", "low", "close", "volume", "openInterest"];
  for (const key of keys) {
    if (row[key] === undefined || row[key] === null || Number.isNaN(row[key])) {
      throw new Error(`行情记录缺少有效字段：${key}`);
    }
  }
}

export async function loadMarketData(dataFile) {
  const url = `${import.meta.env.BASE_URL}data/${dataFile}`;
  const response = await fetch(url, { cache: "no-cache" });
  if (!response.ok) {
    throw new Error(`读取行情数据失败（HTTP ${response.status}）：${url}`);
  }

  const payload = await response.json();
  if (!Array.isArray(payload.data) || payload.data.length === 0) {
    throw new Error("行情 JSON 中没有 data 数组，请先运行数据脚本");
  }

  const rows = payload.data
    .map((row) => ({
      date: String(row.date),
      open: Number(row.open),
      high: Number(row.high),
      low: Number(row.low),
      close: Number(row.close),
      volume: Number(row.volume),
      openInterest: Number(row.openInterest),
    }))
    .filter((row) => {
      assertRow(row);
      return true;
    })
    .sort((a, b) => a.date.localeCompare(b.date));

  if (rows.length < 2) {
    throw new Error("有效日线不足 2 条，无法计算涨跌幅");
  }

  return { meta: payload, rows };
}

export function addChanges(rows) {
  return rows.map((row, index) => {
    const previous = rows[index - 1];
    const change = previous ? row.close - previous.close : null;
    const changePercent = previous && previous.close !== 0
      ? (change / previous.close) * 100
      : null;
    return { ...row, change, changePercent };
  });
}

function weekKey(dateText) {
  const date = parseDate(dateText);
  const day = date.getUTCDay();
  const offset = day === 0 ? -6 : 1 - day;
  date.setUTCDate(date.getUTCDate() + offset);
  return date.toISOString().slice(0, 10);
}

export function aggregateWeekly(rows) {
  const groups = new Map();

  for (const row of rows) {
    const key = weekKey(row.date);
    const current = groups.get(key);
    if (!current) {
      groups.set(key, {
        date: row.date,
        open: row.open,
        high: row.high,
        low: row.low,
        close: row.close,
        volume: row.volume,
        openInterest: row.openInterest,
      });
      continue;
    }

    // 周线时间取该周最后一个交易日，OHLC 按首末和极值聚合。
    current.date = row.date;
    current.high = Math.max(current.high, row.high);
    current.low = Math.min(current.low, row.low);
    current.close = row.close;
    current.volume += row.volume;
    current.openInterest = row.openInterest;
  }

  return [...groups.values()].sort((a, b) => a.date.localeCompare(b.date));
}

export function movingAverage(rows, period) {
  const result = [];
  let sum = 0;

  rows.forEach((row, index) => {
    sum += row.close;
    if (index >= period) {
      sum -= rows[index - period].close;
    }
    if (index >= period - 1) {
      result.push({ time: row.date, value: sum / period });
    }
  });

  return result;
}

export const priceFormatter = new Intl.NumberFormat("zh-CN", {
  minimumFractionDigits: 0,
  maximumFractionDigits: 2,
});

export const integerFormatter = new Intl.NumberFormat("zh-CN", {
  maximumFractionDigits: 0,
});

export function formatSigned(value, digits = 2) {
  if (value === null || value === undefined || Number.isNaN(value)) return "--";
  const sign = value > 0 ? "+" : "";
  return `${sign}${value.toFixed(digits)}`;
}
