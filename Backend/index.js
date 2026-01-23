const { Kafka } = require('kafkajs');
const { createClient } = require('redis');
const WebSocket = require('ws');
const { MongoClient } = require('mongodb');
const http = require('http');

const FINNHUB_KEY = process.env.FINNHUB_KEY;

// 1. Setup Kafka
const kafka = new Kafka({
    clientId: 'trading-backend',
    brokers: ['kafka:29092'],
    retry: {
        initialRetryTime: 300,
        retries: 10 // This helps handle the "Topic not found" warm-up
    }
});
const producer = kafka.producer();
const consumer = kafka.consumer({ groupId: 'db-saver-group' });

// 2. Setup Redis
const redisClient = createClient({ url: `redis://redis:6379` });

// 3. Setup MongoDB
const mongoClient = new MongoClient('mongodb://mongodb:27017');

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

        // --- STEP 2: The Consumer (Independent Worker) ---
        await consumer.subscribe({ topic: 'market-updates', fromBeginning: true });
        
        let tradeBuffer = [];
        const Batch_SIZE= 200;       // We don't 'await' consumer.run because it's a long-running process
        consumer.run({
            eachMessage: async ({ message }) => {
                try {
                    const trade = JSON.parse(message.value.toString());
                    tradeBuffer.push({
                        ...trade, 
                        timestamp: new Date()
                    });

                    if (tradeBuffer.length >= Batch_SIZE) {
                        await tradesCollection.insertMany(tradeBuffer);
                        tradeBuffer = [];
                        console.log(`✅ Saved ${Batch_SIZE} trades to MongoDB`);
                    }
                    
                } catch (dbErr) {
                    console.error('❌ DB Save Error:', dbErr.message);
                }
            }
        });

        // --- STEP 3: The Finnhub WebSocket ---
        const socket = new WebSocket(`wss://ws.finnhub.io?token=${FINNHUB_KEY}`);

        socket.on('open', () => {
            socket.send(JSON.stringify({ type: 'subscribe', symbol: 'BINANCE:BTCUSDT' }));
            console.log('📡 WebSocket Open: Subscribed to BTCUSDT');
        });

        socket.on('message', async (data) => {
            const message = JSON.parse(data);
            
            // Finnhub sends 'ping' types to keep connection alive
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

                    console.log(`🚀 Streamed: ${trade.symbol} at $${trade.price}`);
                } catch (streamErr) {
                    console.error('❌ Streaming Error:', streamErr.message);
                }
            }
        });

        socket.on('error', (err) => console.error('WS Error:', err));
        socket.on('close', () => {
            console.log('WS Connection Closed. Restarting in 5s...');
            setTimeout(start, 5000); // Simple auto-reconnect
        });

    } catch (err) {
        console.error('❌ Critical Initialization Error:', err.message);
        console.log('🔄 Restarting process in 5 seconds...');
        setTimeout(() => process.exit(1), 5000); // Exit so Docker can restart it
    }
}

// Health check endpoint
http.createServer((req, res) => res.end('Backend Active')).listen(3000);

start();