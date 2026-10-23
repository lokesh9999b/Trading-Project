# Crypto Trading Engine — Interview Cheat Sheet

> ⚠️ **Correction:** frontend is **Angular 21**, not React [Frontend/package.json:27-32]. Charts use **lightweight-charts** (TradingView), not a React lib [trading-chart.ts:2].

## 1. WHAT IT IS
Real-time BTC trade **monitor**: streams live trades from Finnhub, shows live candles + session stats + historical line chart [index.js:131-166, dashboard.html]. Personal learning project for a Kafka→Redis→Mongo pipeline — **no real trading / orders in code** (ASK ME for the "why").

## 2. ARCHITECTURE
- **Market source + WS client:** Finnhub `wss://ws.finnhub.io`, subscribes `BINANCE:BTCUSDT` only [index.js:131-136].
- **Kafka producer:** sends each trade to topic `market-updates` [index.js:155-158].
- **Kafka consumer:** group `db-saver-group`, same topic, `fromBeginning:true` [index.js:16,111].
- **Redis:** `SET latest_btc_price` + Pub/Sub channel `market-updates` [index.js:152,161]. Two clients (publisher + duplicate subscriber) [index.js:18-19].
- **Node server:** raw `http` + `ws` WebSocket server on :3000; also `GET /api/history` [index.js:23-89].
- **MongoDB:** db `trading_db`, collection `trades` [index.js:48-49,100-101].
- **Angular dashboard:** live candles, session stats, history chart [dashboard.ts].
- **Docker:** compose with backend, frontend(nginx), redis, kafka, mongodb [docker-compose.yml].

```
Finnhub WS ─► Node ─┬─► Kafka(market-updates) ─► consumer(db-saver-group) ─► MongoDB
                    ├─► Redis SET latest_btc_price
                    └─► Redis PUBLISH market-updates ─► Node WS ─► Angular browser
```

## 3. DATA FLOW (one tick)
Finnhub `trade` msg → mapped to `{price,symbol,volume,time}` [index.js:143-148] → **(a)** `Redis SET latest_btc_price` [152] → **(b)** `producer.send` to Kafka `market-updates`, **no key, no partition set** (default) [155-158] → **(c)** `Redis PUBLISH market-updates` [161]. Subscriber receives publish → `broadcastToClients` over `ws` [105-108,78-84] → browser WS `onmessage` [websocket.ts:29-42] → BehaviorSubject → chart `update()` [trading-chart.ts:51-90]. Separately, consumer buffers and bulk-inserts to Mongo [115-124]. **Redis TTL: NOT FOUND** (no expiry set).

## 4. KAFKA & REDIS DECISIONS
- Kafka here = durable buffer feeding the DB-saver consumer; Redis Pub/Sub = fan-out to browsers [index.js:105-108,155-161]. Split of "persist" vs "stream" is **visible in code**; the rationale is **INFERRED, confirm with me**.
- Consumer group `db-saver-group`, `fromBeginning:true` [16,111]. **Offset/commit:** auto-commit default — no manual commit in code (NOT FOUND).
- **Retry:** producer client `retries:10, initialRetryTime:300` [13]. No DLQ, no per-message retry.
- **Error handling:** try/catch around consumer insert [117-127] and stream [150-164].
- **Redis expiry:** none set (NOT FOUND).

## 5. DATABASE
- Collection `trades` [index.js:49]. Doc shape = `{price,symbol,volume,time(ISO string), timestamp(Date added on insert)}` [119,143-148].
- **Indexes: NOT FOUND** in code (history query filters/sorts on `timestamp` [52-58] — unindexed).
- Batch consumer: buffers to `BATCH_SIZE=200`, then `insertMany`, clears buffer [112-124].

## 6. ANGULAR DASHBOARD
- Components: `DashboardComponent`, `TradingChartComponent` (live candles), `HistoricalChartComponent` (line) [dashboard.ts:6-7].
- State/live: RxJS `BehaviorSubject` via `WebsocketService`; `ngZone.run` + manual `cdr.detectChanges()` [websocket.ts:13,35; dashboard.ts:44-68].
- Charts: lightweight-charts; candles built client-side per interval [trading-chart.ts:70-90].
- Perf: `recentTrades` capped at 15 [dashboard.ts:64]; history `limit(5000)` [index.js:59] + client de-dupe by timestamp [historical-chart.ts:114-116]. No throttling/memoisation beyond these.

## 7. DOCKER & RUNNING
- Services/ports: backend 3000, frontend 80, redis 6379, kafka 9092, mongodb 27017 [docker-compose.yml:12-68].
- Volume: `mongo_data:/data/db` [69-73]. Backend `depends_on` kafka(healthy)+redis — **not mongodb** [19-23].
- Env: `KAFKA_BROKER`, `REDIS_HOST/PORT`, `FINNHUB_KEY` via `./backend/.env` [9,14-18]. ⚠️ real key is committed in `.env` — secret **not printed here**; rotate it.
- Backend Dockerfile: node:20-alpine [Backend/Dockerfile]. Frontend: build + nginx [Frontend/Dockerfile].

## 8. ONE PROBLEM SOLVED — write amplification
Writing every tick to Mongo individually is slow. Code buffers trades and does one `insertMany` per 200 [index.js:112-124], cutting DB round-trips. **Evidence:** `BATCH_SIZE=200`, buffer+flush loop. (Supporting: history de-dupe fixes duplicate-timestamp crashes in lightweight-charts [historical-chart.ts:112-116].)

## 9. WHAT I WOULD CHANGE
- **Mongo index on `timestamp`** [index.js:52] — range query is a full scan.
- **Reconnect leak** [index.js:168] — `setTimeout(start,5000)` re-runs *all* of `start()`, re-connecting producer/consumer (likely duplicate consumers). Split reconnect from init.
- **Secrets + auth** [Backend/.env; index.js:25] — key in repo, CORS `*`, no auth; move key out, rotate, add auth.

## 10. LIKELY INTERVIEW QUESTIONS
- *Why Kafka not just Redis Pub/Sub?* Code uses **both**: Kafka → durable persistence consumer, Redis → live fan-out [155-161]; rationale INFERRED, confirm.
- *What if the consumer crashes?* Group `db-saver-group` + `fromBeginning` [16,111] replays from start on restart; in-memory `tradeBuffer` (<200) is lost [112].
- *Guaranteed delivery to browser?* No — Redis Pub/Sub is fire-and-forget; offline clients miss ticks [161,78-84].
- *Why Angular + lightweight-charts?* ASK ME (choice not in code).
- *How is "24h" high/low computed?* It's **session-cumulative**, not a 24h window [dashboard.ts:54-59] (UI says "Session").

## OPEN QUESTIONS FOR ME
- Why built / Angular & lightweight-charts chosen (not in code).
- Kafka-vs-Redis rationale (INFERRED).
- Redis TTL, manual offset commits, Mongo indexes — all NOT FOUND; intended?
- `socket.io` is a dependency but unused (server uses raw `ws`) [Backend/package.json:18; index.js:3] — remove or intend to use?
