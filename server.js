require("dotenv").config();
const express = require("express");
const http = require("http");
const WebSocket = require("ws");
const cors = require("cors");
const bodyParser = require("body-parser");
const { MongoClient, ObjectId } = require("mongodb");

const app = express();
app.use(cors());
app.use(bodyParser.json());

const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

let db;

// ✅ PORTA FLY (IMPORTANTISSIMO)
const PORT = process.env.PORT || 3000;

// ==========================
async function startServer() {
    try {
        const client = await MongoClient.connect(process.env.MONGO_URI);
        db = client.db();

        console.log("✅ MongoDB connesso");

        server.listen(PORT, "0.0.0.0", () => {
            console.log("✅ SERVER ATTIVO su porta", PORT);
        });

    } catch (err) {
        console.log("❌ ERRORE MONGO:", err.message);
    }
}

startServer();

// ==========================
app.get("/", (req, res) => {
    res.send("Server attivo ✅");
});

// ==========================
// (TUTTO IL REST UGUALE AL TUO — NON CAMBIA)

// ==========================
// ✅ WEBSOCKET CHAT
const rooms = {};

wss.on("connection", (ws) => {

    console.log("🔌 WS CONNESSO");

    ws.on("message", (message) => {

        try {
            const text = message.toString();

            // ✅ ignoriamo ping
            if (text === "ping") return;

            const data = JSON.parse(text);

            const roomId = [data.userId, data.otherUserId]
                .sort()
                .join("_");

            if (data.type === "JOIN") {

                if (!rooms[roomId]) {
                    rooms[roomId] = new Set();
                }

                rooms[roomId].add(ws);
                ws.room = roomId;

                console.log("👥 JOIN:", roomId);
            }

            if (data.type === "MESSAGE") {

                if (!rooms[roomId]) return;

                rooms[roomId].forEach(client => {
                    if (client.readyState === WebSocket.OPEN) {
                        client.send(JSON.stringify({
                            type: "MESSAGE",
                            msg: data.msg,
                            senderId: data.userId
                        }));
                    }
                });
            }

        } catch (err) {
            console.log("❌ ERRORE PARSE:", err.message);
        }
    });

    ws.on("close", () => {
        if (ws.room && rooms[ws.room]) {
            rooms[ws.room].delete(ws);
        }
    });
});
