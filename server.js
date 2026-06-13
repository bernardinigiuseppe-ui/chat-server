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
// =====================
// ✅ REGISTER
// =====================
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

// =====================
// ✅ LOGIN
// =====================
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
