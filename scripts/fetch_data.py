#!/usr/bin/env python3
"""抓取郑商所棉花等品种日线，并原子替换前端使用的 JSON 数据。"""

from __future__ import annotations

import argparse
import json
import logging
import math
import os
import re
import tempfile
import time
from datetime import datetime
from pathlib import Path
from typing import Any
from zoneinfo import ZoneInfo

import akshare as ak
import pandas as pd

ROOT = Path(__file__).resolve().parents[1]
DEFAULT_DATA_DIR = ROOT / "public" / "data"

# 新增品种时，在这里补充配置，再在前端 src/config/products.js 中添加对应入口。
PRODUCTS: dict[str, dict[str, str]] = {
    "CF": {
        "name": "郑棉",
        "exchange": "CZCE",
        "file": "cf.json",
    },
}

SYMBOL_PATTERN = re.compile(r"^(?P<product>[A-Z]{1,3})(?P<month>0|\d{4})$")
REQUIRED_COLUMNS = ("date", "open", "high", "low", "close", "volume", "hold")
COLUMN_ALIASES = {
    "日期": "date",
    "开盘价": "open",
    "最高价": "high",
    "最低价": "low",
    "收盘价": "close",
    "成交量": "volume",
    "持仓量": "hold",
    "开盘": "open",
    "最高": "high",
    "最低": "low",
    "收盘": "close",
}

logger = logging.getLogger("fetch_market_data")


class DataValidationError(RuntimeError):
    """上游数据为空或结构不符合预期。"""


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="用 AKShare 抓取期货日线，校验成功后写入 public/data。"
    )
    parser.add_argument(
        "--symbol",
        default="CF0",
        help="合约代码：主力连续用 CF0，具体合约用 CF2605（默认：CF0）",
    )
    parser.add_argument(
        "--output",
        type=Path,
        help="输出文件。主力连续默认 public/data/cf.json，具体合约默认 public/data/cf2605.json",
    )
    parser.add_argument(
        "--retries", type=int, default=3, help="接口失败后的最多尝试次数（默认：3）"
    )
    parser.add_argument(
        "--retry-delay",
        type=float,
        default=2.0,
        help="重试间隔秒数，按次数递增（默认：2）",
    )
    parser.add_argument(
        "--log-level",
        default="INFO",
        choices=("DEBUG", "INFO", "WARNING", "ERROR"),
        help="日志级别（默认：INFO）",
    )
    return parser.parse_args()


def resolve_symbol(symbol: str) -> tuple[str, dict[str, str], bool]:
    normalized = symbol.strip().upper()
    match = SYMBOL_PATTERN.fullmatch(normalized)
    if not match:
        raise ValueError("合约格式应为 CF0 或 CF2605 这类形式")

    product_code = match.group("product")
    product = PRODUCTS.get(product_code)
    if product is None:
        raise ValueError(
            f"暂未配置品种 {product_code}；请在 scripts/fetch_data.py 的 PRODUCTS 中添加"
        )

    is_main = match.group("month") == "0"
    return normalized, product, is_main


def default_output_path(symbol: str, product: dict[str, str], is_main: bool) -> Path:
    if is_main:
        return DEFAULT_DATA_DIR / product["file"]
    return DEFAULT_DATA_DIR / f"{symbol.lower()}.json"


def fetch_with_retry(symbol: str, retries: int, retry_delay: float) -> pd.DataFrame:
    if retries < 1:
        raise ValueError("--retries 必须大于等于 1")
    if retry_delay < 0:
        raise ValueError("--retry-delay 不能为负数")

    last_error: Exception | None = None
    for attempt in range(1, retries + 1):
        try:
            logger.info("请求 AKShare 日线：symbol=%s（第 %d/%d 次）", symbol, attempt, retries)
            frame = ak.futures_zh_daily_sina(symbol=symbol)
            if frame is None or frame.empty:
                raise DataValidationError("接口返回空数据")
            logger.info("接口返回 %d 行，开始校验", len(frame))
            return frame
        except Exception as exc:  # 网络、上游结构和空数据都进入统一重试逻辑
            last_error = exc
            logger.warning("第 %d 次抓取失败：%s", attempt, exc)
            if attempt < retries:
                delay = retry_delay * attempt
                logger.info("%.1f 秒后重试", delay)
                time.sleep(delay)

    raise RuntimeError(f"连续 {retries} 次抓取失败：{last_error}") from last_error


def normalize_frame(frame: pd.DataFrame) -> list[dict[str, Any]]:
    renamed = frame.rename(columns=COLUMN_ALIASES)
    missing = [column for column in REQUIRED_COLUMNS if column not in renamed.columns]
    if missing:
        raise DataValidationError(f"返回数据缺少字段：{', '.join(missing)}")

    rows_by_date: dict[str, dict[str, Any]] = {}
    invalid_rows = 0

    for record in renamed.loc[:, list(REQUIRED_COLUMNS)].to_dict(orient="records"):
        trade_date = pd.to_datetime(record["date"], errors="coerce")
        numbers = {
            key: pd.to_numeric(record[key], errors="coerce")
            for key in ("open", "high", "low", "close", "volume", "hold")
        }

        if pd.isna(trade_date) or any(pd.isna(value) for value in numbers.values()):
            invalid_rows += 1
            continue

        open_price = float(numbers["open"])
        high_price = float(numbers["high"])
        low_price = float(numbers["low"])
        close_price = float(numbers["close"])
        volume = int(round(float(numbers["volume"])))
        open_interest = int(round(float(numbers["hold"])))

        if not all(
            math.isfinite(value)
            for value in (open_price, high_price, low_price, close_price)
        ):
            invalid_rows += 1
            continue

        # 丢弃明显异常的 OHLC 行，避免坏数据污染页面。
        if (
            min(open_price, high_price, low_price, close_price) <= 0
            or high_price < max(open_price, low_price, close_price)
            or low_price > min(open_price, high_price, close_price)
            or volume < 0
            or open_interest < 0
        ):
            invalid_rows += 1
            continue

        date_text = trade_date.date().isoformat()
        rows_by_date[date_text] = {
            "date": date_text,
            "open": open_price,
            "high": high_price,
            "low": low_price,
            "close": close_price,
            "volume": volume,
            "openInterest": open_interest,
        }

    rows = sorted(rows_by_date.values(), key=lambda item: item["date"])
    if len(rows) < 2:
        raise DataValidationError("有效日线不足 2 行，拒绝覆盖旧数据")

    if invalid_rows:
        logger.warning("已丢弃 %d 行缺失或异常的记录", invalid_rows)
    return rows


def build_payload(
    symbol: str,
    product: dict[str, str],
    is_main: bool,
    rows: list[dict[str, Any]],
) -> dict[str, Any]:
    product_name = product["name"]
    display_name = f"{product_name}主力连续" if is_main else f"{product_name} {symbol}"
    updated_at = datetime.now(ZoneInfo("Asia/Shanghai")).isoformat(timespec="seconds")

    return {
        "schemaVersion": 1,
        "symbol": symbol,
        "product": product_name,
        "name": display_name,
        "exchange": product["exchange"],
        "contractType": "main_continuous" if is_main else "specific_contract",
        "source": {
            "provider": "AKShare",
            "interface": "futures_zh_daily_sina",
            "upstream": "新浪财经",
        },
        "updatedAt": updated_at,
        "rowCount": len(rows),
        "data": rows,
    }


def existing_data_matches(output: Path, symbol: str, rows: list[dict[str, Any]]) -> bool:
    """行情内容未变化时跳过写入，避免定时任务产生无意义提交。"""
    if not output.exists():
        return False

    try:
        existing = json.loads(output.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError):
        return False

    return existing.get("symbol") == symbol and existing.get("data") == rows


def write_atomic(output: Path, payload: dict[str, Any]) -> None:
    """先写临时文件再替换，确保异常时旧 JSON 不被破坏。"""
    output.parent.mkdir(parents=True, exist_ok=True)
    temp_path: Path | None = None
    try:
        descriptor, temp_name = tempfile.mkstemp(
            prefix=f".{output.name}.", suffix=".tmp", dir=output.parent
        )
        temp_path = Path(temp_name)
        with os.fdopen(descriptor, "w", encoding="utf-8", newline="\n") as handle:
            json.dump(payload, handle, ensure_ascii=False, separators=(",", ":"))
            handle.write("\n")
            handle.flush()
            os.fsync(handle.fileno())
        os.replace(temp_path, output)
    finally:
        if temp_path is not None and temp_path.exists():
            temp_path.unlink(missing_ok=True)


def main() -> int:
    args = parse_args()
    logging.basicConfig(
        level=getattr(logging, args.log_level),
        format="%(asctime)s | %(levelname)s | %(message)s",
        datefmt="%Y-%m-%d %H:%M:%S",
    )

    output: Path | None = args.output
    try:
        symbol, product, is_main = resolve_symbol(args.symbol)
        if output is None:
            output = default_output_path(symbol, product, is_main)
        output = output.resolve()

        if output.exists():
            logger.info("目标文件已存在，本次只会在完整成功后原子替换：%s", output)

        frame = fetch_with_retry(symbol, args.retries, args.retry_delay)
        rows = normalize_frame(frame)
        latest = rows[-1]

        if existing_data_matches(output, symbol, rows):
            logger.info(
                "行情无变化：%s | %d 行 | 最新 %s，保留旧文件",
                output,
                len(rows),
                latest["date"],
            )
            return 0

        payload = build_payload(symbol, product, is_main, rows)
        write_atomic(output, payload)
        logger.info(
            "写入成功：%s | %d 行 | %s 收盘 %.2f",
            output,
            len(rows),
            latest["date"],
            latest["close"],
        )
        return 0
    except Exception:
        logger.exception("抓取失败，旧 JSON 保持不变；未写入空文件")
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
