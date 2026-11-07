# 郑棉 CF 行情与研究笔记

这是「棉研手记」的完整静态站点实现：郑棉 CF 行情数据抓取与 K 线页面、研究笔记、市场要闻，以及 GitHub Actions 定时更新和 GitHub Pages 部署。当前只展示棉花一个品种。

## 当前功能

- AKShare 抓取郑棉主力连续 `CF0` 或指定合约的日线。
- 日线 JSON 包含日期、开高低收、成交量、持仓量。
- 日 K / 周 K 切换；周 K 由日线在前端聚合。
- MA5、MA10、MA20，可分别开关。
- 成交量、持仓量独立副图。
- 鼠标悬停和手机轻触显示 OHLC、涨跌、成交量、持仓量。
- 国内期货配色：红涨绿跌。
- 构建时读取 `content/notes/*.md`，生成笔记列表和详情路由。
- 笔记按日期倒序，可按品种和标签筛选。
- 品种页下方展示与该品种相关的最新笔记。
- 从 `content/news.json` 展示要闻标题、来源、日期、原文链接和点评。
- GitHub Actions 定时更新行情并部署 GitHub Pages。
- 响应式布局，跟随系统深色模式。
- 页面底部固定显示风险提示。

## 目录

```text
.
├─ .github/workflows/
│  └─ update-and-deploy.yml  # 定时更新、构建与 Pages 部署
├─ content/
│  ├─ notes/*.md             # 研究笔记，每篇一个 Markdown 文件
│  └─ news.json              # 要闻元数据与一句点评
├─ scripts/
│  └─ fetch_data.py          # AKShare 抓取、校验、原子写入
├─ public/
│  ├─ data/
│  │  └─ cf.json             # 郑棉 CF0 日线数据（会被提交到仓库）
│  ├─ .nojekyll              # 避免 GitHub Pages 的 Jekyll 处理
│  └─ favicon.svg
├─ src/
│  ├─ charts/klineChart.js   # Lightweight Charts 图表
│  ├─ config/products.js     # 品种页面配置
│  ├─ data/
│  │  ├─ market.js           # 数据清洗、周线聚合、均线
│  │  └─ content.js          # 笔记与要闻的查询、筛选
│  ├─ views/research.js      # 笔记列表、详情、首页内容渲染
│  ├─ main.js                # 行情初始化与 hash 路由
│  └─ styles.css
├─ index.html
├─ package.json
├─ pnpm-lock.yaml
├─ requirements.txt
├─ vite.config.js            # 构建时读取 Markdown 与 news.json
└─ README.md
```

## 数据接口说明

当前使用 AKShare `1.20.35`：

```python
ak.futures_zh_daily_sina(symbol="CF0")
```

该接口在 AKShare 官方文档中的名称是「内盘-历史行情数据-新浪」，支持品种连续合约（如 `CF0`）和具体合约（如 `CF2605`），返回字段包括 `date/open/high/low/close/volume/hold/settle`。

官方文档：<https://akshare.akfamily.xyz/data/futures/futures.html>

数据来源于新浪财经。主力连续合约换月时可能出现合约切换带来的价格跳空，页面不做复权处理。

## 本地运行

### 1. 准备 Python 数据环境

在项目根目录执行：

```powershell
python -m venv .venv
.\.venv\Scripts\Activate.ps1
python -m pip install -r requirements.txt
python scripts/fetch_data.py
```

如果 PowerShell 不允许激活虚拟环境，可以直接用虚拟环境里的 Python：

```powershell
.\.venv\Scripts\python.exe -m pip install -r requirements.txt
.\.venv\Scripts\python.exe scripts\fetch_data.py
```

成功后会在 `public/data/cf.json` 写入最新的 CF0 日线。

### 2. 启动前端

项目使用 pnpm 生成锁文件：

```powershell
pnpm install
pnpm dev
```

浏览器打开 <http://127.0.0.1:5173/>。

如果本机没有 pnpm，也可以改用 npm：

```powershell
npm install
npm run dev
```

不要同时混用 pnpm 和 npm 的锁文件。

### 3. 生产构建检查

```powershell
pnpm build
pnpm preview
```

打开终端提示的本地地址，检查生产构建结果。

## 更新数据

抓取郑棉主力连续合约，默认写入 `public/data/cf.json`：

```powershell
python scripts/fetch_data.py --symbol CF0
```

抓取指定合约，例如 CF2605：

```powershell
python scripts/fetch_data.py --symbol CF2605 --output public/data/cf2605.json
```

常用参数：

```text
--symbol CF0       合约代码
--output PATH      输出文件
--retries 3        最多尝试次数
--retry-delay 2    重试间隔秒数
--log-level INFO   日志级别
```

脚本行为：

- 接口异常、返回空数据、字段缺失或有效行不足 2 行时，进程以非零状态退出。
- 先写临时文件，完整成功后再原子替换目标 JSON。
- 抓取失败时不会覆盖旧 JSON，也不会生成空文件。
- 行情内容与旧文件完全一致时跳过写入，避免定时任务和无意义的 Git 提交。
- 日志同时包含品种、尝试次数、写入路径、行数和最新交易日。

## JSON 数据结构

```json
{
  "schemaVersion": 1,
  "symbol": "CF0",
  "product": "郑棉",
  "name": "郑棉主力连续",
  "exchange": "CZCE",
  "contractType": "main_continuous",
  "source": {
    "provider": "AKShare",
    "interface": "futures_zh_daily_sina",
    "upstream": "新浪财经"
  },
  "updatedAt": "2026-11-07T13:11:55+08:00",
  "rowCount": 5279,
  "data": [
    {
      "date": "2026-11-06",
      "open": 15360.0,
      "high": 15415.0,
      "low": 15265.0,
      "close": 15385.0,
      "volume": 303878,
      "openInterest": 627594
    }
  ]
}
```

页面顶部涨跌按照「最新收盘价相对前一交易日收盘价」计算；周 K 的成交量为周内日成交量之和，持仓量取该周最后一个交易日的值。

## 写研究笔记

在 `content/notes/` 下新建一个 `.md` 文件。文件名会成为详情页地址的一部分，建议使用英文、数字和连字符，例如：

```text
content/notes/2026-11-08-cotton-weekly.md
```

文件头必须包含以下字段：

```markdown
---
date: "2026-11-08"
symbol: CF
tags:
  - 周报
  - 基差
title: "郑棉周报：示例标题"
---

正文使用 Markdown 编写。
```

字段规则：

- `date`：`YYYY-MM-DD`，笔记按此日期倒序排列。
- `symbol`：品种代码，当前使用 `CF`。
- `tags`：标签数组，用于筛选。
- `title`：笔记标题。

文件名 `2026-11-08-cotton-weekly.md` 对应地址：

```text
http://127.0.0.1:5173/#/notes/2026-11-08-cotton-weekly
```

笔记页和详情页使用 hash 路由，刷新页面时不需要服务器做额外回退配置，适合 GitHub Pages 纯静态部署。

执行 `pnpm dev` 时，修改 `content/notes/` 或 `content/news.json` 会自动刷新页面。`pnpm build` 时也会重新读取全部内容；如果日期、URL 或必填字段不合法，构建会失败并指出对应文件。

> Markdown 中允许写原始 HTML。只应在这个个人站点中放自己信任的文件。

## 维护市场要闻

编辑 `content/news.json`，每一项只保存元数据，不粘贴新闻全文：

```json
{
  "title": "要闻标题",
  "source": "来源",
  "url": "https://example.com/article",
  "date": "2026-11-08",
  "comment": "我的一句点评"
}
```

页面只展示标题、来源、日期、原文链接和点评。`url` 只允许 `http` 或 `https` 地址，并且会在新标签页打开。

当前示例内容位于：

- `content/notes/2026-11-06-cotton-weekly.md`
- `content/notes/2026-11-05-basis-framework.md`
- `content/notes/2026-11-03-open-interest-framework.md`
- `content/news.json`

## GitHub Pages 自动更新与部署

工作流文件：

```text
.github/workflows/update-and-deploy.yml
```

### 自动执行规则

- 每个周一至周五的 `08:30 UTC` 运行，即北京时间 `16:30`。
- 脚本抓取 `CF0` 日线；只有 `public/data/cf.json` 的行情内容变化时才提交。
- 定时任务没有新数据时保持绿色并跳过部署，不会因为周末或节假日产生空提交。
- 有更新时自动提交并推送数据，然后构建并部署 Pages。
- 手动触发时总会抓取数据、构建并部署。
- 向 `main` 分支推送笔记、要闻或代码时，直接构建并部署。
- 抓取、构建或部署任一步失败，Actions 会显示红色失败状态。

GitHub 的定时任务可能因平台负载延迟几分钟，不能保证恰好 16:30:00 开始。

### 第一次部署

如果项目还不是 Git 仓库，先初始化并推送到 GitHub：

```powershell
git init
git add .
git commit -m "feat: add cotton market research site"
git branch -M main
git remote add origin https://github.com/YOUR_USERNAME/YOUR_REPOSITORY.git
git push -u origin main
```

然后在 GitHub 仓库中完成以下设置：

1. 打开 **Settings → Pages**。
2. 将 **Build and deployment → Source** 设置为 **GitHub Actions**。
3. 打开 **Settings → Actions → General**。
4. 在 **Workflow permissions** 中选择 **Read and write permissions** 并保存。
5. 如果 `main` 分支启用了保护规则，需要允许 GitHub Actions 推送数据提交，或者暂时不要阻止机器人直接提交。
6. 打开 **Actions → Update CF data and deploy Pages → Run workflow** 手动执行一次。
7. 部署成功后，在 Actions 的 `github-pages` 环境中会显示站点地址，通常是：

   ```text
   https://YOUR_USERNAME.github.io/YOUR_REPOSITORY/
   ```

工作流使用仓库自带的 `GITHUB_TOKEN`，不需要配置账号密码、PAT 或 API 密钥。

### 定时与手动触发

- 定时表达式：`30 8 * * 1-5`。
- 若仓库默认分支不是 `main`，需要同步修改工作流中的 `push.branches`。
- 手动触发入口：**Actions → Update CF data and deploy Pages → Run workflow**。
- 手动触发即使行情没有变化，也会重新构建和部署。
- 定时触发只在行情变化时部署。

### 如何接收失败通知

1. 在 GitHub 仓库页面点击 **Watch → Custom**。
2. 勾选 **Actions**。
3. 确认个人 GitHub 通知设置中启用了 Actions 邮件通知。

任何失败步骤都会让本次运行标红。数据脚本失败时不会覆盖旧 JSON，站点也会保留上一次成功部署的版本。

### 常见问题

- **推送数据步骤失败**：检查 Workflow permissions 是否为读写，以及分支保护是否阻止机器人推送。
- **部署步骤失败**：确认 Pages 的 Source 选择了 GitHub Actions。
- **定时任务没有执行**：确认修改已推送到默认分支 `main`；长时间无仓库活动后，GitHub 也可能停用定时任务，此时手动运行一次即可恢复。
- **节假日仍出现运行记录**：工作流按周一至周五触发，但若没有新行情，脚本检测到数据未变化后会跳过提交与部署。

## 添加新品种

当前只启用了棉花。扩展棉纱 CY、白糖 SR、棕榈油 P、橡胶 RU 时：

1. 在 `scripts/fetch_data.py` 的 `PRODUCTS` 中添加品种名称、交易所和主连文件名。
2. 在 `src/config/products.js` 中添加前端品种配置。
3. 运行脚本生成对应 JSON，例如：

   ```powershell
   python scripts/fetch_data.py --symbol CY0
   ```

4. 后续阶段增加品种列表或路由时，复用 `src/data/market.js` 和 `src/charts/klineChart.js`，不需要重写图表逻辑。

## 阶段状态

- 阶段一：行情抓取与 K 线页，已完成。
- 阶段二：笔记与要闻，已完成。
- 阶段三：GitHub Actions 自动更新与 Pages 部署配置，已完成，等待推送到 GitHub 后实际部署。
