require("dotenv").config();

const express = require("express");
const http = require("http");
const WebSocket = require("ws");
const cors = require("cors");
const bodyParser = require("body-parser");
const { MongoClient } = require("mongodb");

const app = express();
app.use(cors());
app.use(bodyParser.json());

const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

let db;

// ==========================
// ✅ TEST HTTP (Render)
app.get("/", (req, res) => {
    res.send("Server attivo ✅");
});
// ==========================

// ==========================
// ✅ CONNECT MONGO
console.log("MONGO URI:", process.env.MONGO_URI ? "PRESENTE ✅" : "MANCANTE ❌");

MongoClient.connect(process.env.MONGO_URI)
    .then(client => {
        db = client.db();
        console.log("✅ MongoDB connesso");
    })
    .catch(err => {
        console.log("❌ ERRORE MONGO:", err.message);
    });
// ==========================

// ==========================
// ✅ CREA UTENTE (nickname)
app.post("/create-user", async (req, res) => {

    const { username } = req.body;

    if (!username) {
        return res.json({ error: "Username obbligatorio" });
    }

    const existing = await db.collection("users").findOne({ username });

    if (existing) {
        return res.json({ error: "Username già esistente" });
    }

    const user = {
        username,
        createdAt: Date.now()
    };

    const result = await db.collection("users").insertOne(user);

    res.json({
        userId: result.insertedId,
        username
    });
});
// ==========================

// ==========================
// ✅ OTTIENI TUTTI GLI UTENTI
app.get("/users", async (req, res) => {

    const users = await db.collection("users")
        .find({})
        .toArray();

    res.json(users.map(u => ({
        userId: u._id.toString(),
        username: u.username
    })));
});
// ==========================

// ==========================
// ✅ WEBSOCKET (CHAT)
const rooms = {};

wss.on("connection", (ws) => {

    ws.on("message", async (message) => {

        try {
            const data = JSON.parse(message.toString());

            // ✅ JOIN ROOM
            if (data.type === "JOIN") {

                ws.room = data.room;

                if (!rooms[data.room]) {
                    rooms[data.room] = new Set();
                }

                rooms[data.room].add(ws);
            }

            // ✅ MESSAGE
            if (data.type === "MESSAGE") {

                if (!rooms[data.room]) return;

                rooms[data.room].forEach(client => {
                    if (client.readyState === WebSocket.OPEN) {
                        client.send(JSON.stringify({
                            type: "MESSAGE",
                            msg: data.msg,
                            senderId: data.senderId
                        }));
                    }
                });
            }

        } catch (err) {
            console.log("Errore WS:", err.message);
        }
    });

    ws.on("close", () => {
        if (ws.room && rooms[ws.room]) {
            rooms[ws.room].delete(ws);
        }
    });
});
// ==========================

// ✅ AVVIO SERVER
server.listen(process.env.PORT || 10000, () => {
    console.log("✅ SERVER COMPLETO ATTIVO");
});
