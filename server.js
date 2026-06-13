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

// ✅ DEBUG
console.log("MONGO URI:", process.env.MONGO_URI ? "PRESENTE ✅" : "MANCANTE ❌");

// ✅ CONNESSIONE MONGO
MongoClient.connect(process.env.MONGO_URI)
    .then(client => {
        db = client.db();
        console.log("✅ MongoDB connesso");
    })
    .catch(err => {
        console.log("❌ ERRORE MONGO:", err.message);
    });

// ✅ TEST ROUTE (serve per Render)
app.get("/", (req, res) => {
    res.send("Server attivo ✅");
});

// =================
// ✅ WEBSOCKET BASE
// =================

wss.on("connection", (ws) => {

    ws.on("message", (message) => {
        try {
            const data = JSON.parse(message.toString());

            if (data.type === "PING") {
                ws.send(JSON.stringify({ type: "PONG" }));
            }

        } catch (err) {
            console.log("Errore WS:", err.message);
        }
    });

});

// ✅ AVVIO SERVER
server.listen(process.env.PORT || 10000, () => {
    console.log("✅ SERVER COMPLETO ATTIVO");
});