const { Kafka } = require('kafkajs');
const { createClient } = require('redis');
const WebSocket = require('ws'); 
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

const wss = new WebSocket.Server({ server });

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
        await redisClient.connect();
        await producer.connect();
        await mongoClient.connect();
        await consumer.connect();
        
        const db = mongoClient.db('trading_db');
        const tradesCollection = db.collection('trades');
        console.log("✅ All systems connected");

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
                    }
                } catch (dbErr) {
                    console.error('❌ DB Save Error:', dbErr.message);
                }
            }
        });

        const finnhubWs = new WebSocket(`wss://ws.finnhub.io?token=${FINNHUB_KEY}`);

        finnhubWs.on('open', () => {
            finnhubWs.send(JSON.stringify({ type: 'subscribe', symbol: 'BINANCE:BTCUSDT' }));
            console.log('📡 Connected to Finnhub');
        });

        finnhubWs.on('message', async (data) => {
            const message = JSON.parse(data);
            
            if (message.type === 'trade') {
                // FIXED: Explicitly map the 'v' field for volume
                const trade = {
                    price: message.data[0].p,
                    symbol: message.data[0].s,
                    volume: message.data[0].v, // <--- Correctly capture volume
                    time: new Date(message.data[0].t).toISOString()
                };

                try {
                    await redisClient.set('latest_btc_price', JSON.stringify(trade));
                    await producer.send({
                        topic: 'market-updates',
                        messages: [{ value: JSON.stringify(trade) }],
                    });
                    broadcastToClients(trade);
                    console.log(`🚀 Broadcasted: ${trade.symbol} | Vol: ${trade.volume}`);
                } catch (streamErr) {
                    console.error('❌ Streaming Error:', streamErr.message);
                }
            }
        });

        finnhubWs.on('close', () => setTimeout(start, 5000));

    } catch (err) {
        console.error('❌ Critical Error:', err.message);
        setTimeout(() => process.exit(1), 5000);
    }
}

server.listen(3000, () => console.log('🚀 Server listening on port 3000'));
start();