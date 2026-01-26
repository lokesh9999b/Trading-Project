const { Kafka } = require('kafkajs');
const { createClient } = require('redis');
const WebSocket = require('ws'); // For both Finnhub client AND our Server
const { MongoClient } = require('mongodb');
const http = require('http');

const FINNHUB_KEY = process.env.FINNHUB_KEY;

// --- 1. Infrastructure Setup ---
const kafka = new Kafka({
    clientId: 'trading-backend',
    brokers: ['kafka:29092'],
    retry: { initialRetryTime: 300, retries: 10 }
});
const producer = kafka.producer();
const consumer = kafka.consumer({ groupId: 'db-saver-group' });
const redisClient = createClient({ url: `redis://redis:6379` });
const mongoClient = new MongoClient('mongodb://mongodb:27017');

// --- 2. Create the HTTP Server & WebSocket Server ---
const server = http.createServer((req, res) => {
    res.writeHead(200, { 'Content-Type': 'text/plain' });
    res.end('Backend Active with WebSocket Support');
});

// Attach WebSocket Server to the same HTTP server
const wss = new WebSocket.Server({ server });

// Function to broadcast to all connected Angular clients
const broadcastToClients = (data) => {
    wss.clients.forEach((client) => {
        if (client.readyState === WebSocket.OPEN) {
            client.send(JSON.stringify(data));
        }
    });
};

wss.on('connection', (ws) => {
    console.log('💎 New Angular client connected');
    ws.on('close', () => console.log('👤 Client disconnected'));
});

// --- 3. Main Logic ---
async function start() {
    try {
        console.log("⏳ Connecting to infrastructure...");
        await redisClient.connect();
        await producer.connect();
        await mongoClient.connect();
        await consumer.connect();
        
        const db = mongoClient.db('trading_db');
        const tradesCollection = db.collection('trades');
        console.log("✅ All systems connected: Redis, Kafka, MongoDB");

        // --- Consumer Logic (Save to DB) ---
        await consumer.subscribe({ topic: 'market-updates', fromBeginning: true });
        let tradeBuffer = [];
        const BATCH_SIZE = 200;

        consumer.run({
            eachMessage: async ({ message }) => {
                try {
                    const trade = JSON.parse(message.value.toString());
                    tradeBuffer.push({ ...trade, timestamp: new Date() });

                    if (tradeBuffer.length >= BATCH_SIZE) {
                        await tradesCollection.insertMany(tradeBuffer);
                        tradeBuffer = [];
                        console.log(`✅ Saved ${BATCH_SIZE} trades to MongoDB`);
                    }
                } catch (dbErr) {
                    console.error('❌ DB Save Error:', dbErr.message);
                }
            }
        });

        // --- Finnhub WebSocket (Source of Data) ---
        const finnhubWs = new WebSocket(`wss://ws.finnhub.io?token=${FINNHUB_KEY}`);

        finnhubWs.on('open', () => {
            finnhubWs.send(JSON.stringify({ type: 'subscribe', symbol: 'BINANCE:BTCUSDT' }));
            console.log('📡 Connected to Finnhub: Subscribed to BTCUSDT');
        });

        finnhubWs.on('message', async (data) => {
            const message = JSON.parse(data);
            
            if (message.type === 'trade') {
                const trade = {
                    price: message.data[0].p,
                    symbol: message.data[0].s,
                    time: new Date(message.data[0].t).toISOString()
                };

                try {
                    // 1. Quick Cache (Redis)
                    await redisClient.set('latest_btc_price', JSON.stringify(trade));

                    // 2. Durable Stream (Kafka)
                    await producer.send({
                        topic: 'market-updates',
                        messages: [{ value: JSON.stringify(trade) }],
                    });

                    // 3. LIVE BROADCAST to Angular 🚀
                    broadcastToClients(trade);

                    console.log(`🚀 Streamed & Broadcasted: ${trade.symbol} at $${trade.price}`);
                } catch (streamErr) {
                    console.error('❌ Streaming Error:', streamErr.message);
                }
            }
        });

        finnhubWs.on('close', () => {
            console.log('Finnhub WS Closed. Restarting in 5s...');
            setTimeout(start, 5000);
        });

    } catch (err) {
        console.error('❌ Critical Error:', err.message);
        setTimeout(() => process.exit(1), 5000);
    }
}

// Start the server on port 3000
server.listen(3000, () => {
    console.log('🚀 Server listening on http://localhost:3000');
});

start();