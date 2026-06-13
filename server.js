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

// ✅ TEST HTTP (serve per Render)
app.get("/", (req, res) => {
    res.send("Server attivo ✅");
});

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

// ✅ WS BASE (solo test)
wss.on("connection", (ws) => {

    ws.on("message", (msg) => {
        console.log("Messaggio ricevuto:", msg.toString());
    });

});

// ✅ AVVIO
server.listen(process.env.PORT || 10000, () => {
    console.log("✅ SERVER COMPLETO ATTIVO");
});
