require("dotenv").config();

const express = require("express");
const http = require("http");
const WebSocket = require("ws");
const cors = require("cors");
const bodyParser = require("body-parser");

// ✅ FIX: import corretto Mongo
const { MongoClient, ObjectId } = require("mongodb");

const app = express();
app.use(cors());
app.use(bodyParser.json());

const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

let db;

// ==========================
// ✅ DEBUG + CONNESSIONE MONGO
// ==========================

console.log("MONGO URI:", process.env.MONGO_URI ? "PRESENTE ✅" : "MANCANTE ❌");

MongoClient.connect(process.env.MONGO_URI)
    .then(client => {
        db = client.db();
        console.log("✅ MongoDB connesso");
    })
    .catch(err => {
        console.log("❌ ERRORE MONGO:");
        console.log(err.message);
    });

// ==========================
// ✅ API LOGIN / REGISTER
// ==========================

app.post("/register", async (req, res) => {

    const { username, password } = req.body;

    if (!username || !password) {
        return res.json({ error: "Dati mancanti" });
    }

    const existing = await db.collection("users").findOne({ username });

    if (existing) {
        return res.json({ error: "Utente esiste" });
    }

    const user = {
        username,
        password,
        createdAt: Date.now()
    };

    const result = await db.collection("users").insertOne(user);

    res.json({
        userId: result.insertedId,
        username
    });
});

app.post("/login", async (req, res) => {

    const { username, password } = req.body;

    const user = await db.collection("users").findOne({
        username,
        password
    });

    if (!user) {
        return res.json({ error: "Credenziali errate" });
    }

    res.json({
        userId: user._id,
        username: user.username
    });
});

// ==========================
// ✅ WEBSOCKET CHAT
// ==========================

const rooms = {};

wss.on("connection", (ws) => {

    ws.room = null;
    ws.userId = null;

    ws.on("message", async (message) => {

        try {
            const data = JSON.parse(message.toString());

            // ✅ JOIN
            if (data.type === "JOIN") {

                ws.room = data.room;
                ws.userId = data.userId;

                if (!rooms[data.room]) {
                    rooms[data.room] = new Set();
                }

                rooms[data.room].add(ws);

                // ✅ storico dal DB
                const history = await db.collection("messages")
                    .find({ room: data.room })
                    .sort({ timestamp: 1 })
                    .limit(50)
                    .toArray();

                history.forEach(msg => {
                    ws.send(JSON.stringify({
                        type: "MESSAGE",
                        id: msg._id.toString(),
                        msg: msg.text,
                        senderId: msg.senderId,
                        timestamp: msg.timestamp,
                        status: msg.status || "⏳"
                    }));
                });

                broadcastStatus(data.room);
            }

            // ✅ MESSAGE
            if (data.type === "MESSAGE") {

                const messageObj = {
                    room: data.room,
                    text: data.msg,
                    senderId: data.userId,
                    timestamp: Date.now(),
                    status: "⏳"
                };

                // ✅ salva su DB
                const result = await db.collection("messages").insertOne(messageObj);

                messageObj._id = result.insertedId;

                // ✅ invio a tutti
                rooms[data.room].forEach(client => {