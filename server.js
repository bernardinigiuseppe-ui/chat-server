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

// ==========================
// ✅ TEST ROUTE (Render)
app.get("/", (req, res) => {
    res.send("Server attivo ✅");
});
// ==========================

// ==========================
// ✅ MONGO CONNECT
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
        createdAt: Date.now(),
        contacts: []
    };

    const result = await db.collection("users").insertOne(user);

    res.json({
        userId: result.insertedId.toString(),
        username
    });
});
// ==========================

// ==========================
// ✅ OTTIENI TUTTI GLI UTENTI (debug)
app.get("/users", async (req, res) => {

    const users = await db.collection("users").find({}).toArray();

    res.json(users.map(u => ({
        userId: u._id.toString(),
        username: u.username
    })));
});
// ==========================

// ==========================
// ✅ AGGIUNGI CONTATTO
app.post("/add-contact", async (req, res) => {

    const { userId, username } = req.body;

    if (!userId || !username) {
        return res.json({ error: "Dati mancanti" });
    }

    const contact = await db.collection("users").findOne({ username });

    if (!contact) {
        return res.json({ error: "Utente non trovato" });
    }

    await db.collection("users").updateOne(
        { _id: new ObjectId(userId) },
        { $addToSet: { contacts: contact._id.toString() } }
    );

    res.json({ success: true });
});
// ==========================

// ==========================
// ✅ OTTIENI CONTATTI
app.get("/contacts/:userId", async (req, res) => {

    const userId = req.params.userId;

    const user = await db.collection("users").findOne({
        _id: new ObjectId(userId)
    });

    if (!user || !user.contacts || user.contacts.length === 0) {
        return res.json([]);
    }

    const contacts = await db.collection("users")
        .find({
            _id: { $in: user.contacts.map(id => new ObjectId(id)) }
        })
        .toArray();

    res.json(contacts.map(u => ({
        userId: u._id.toString(),
        username: u.username
    })));
});
// ==========================

// ==========================
// ✅ WEBSOCKET CHAT
const rooms = {};

wss.on("connection", (ws) => {

    ws.on("message", async (message) => {

        try {
            const data = JSON.parse(message.toString());

            // ✅ CREA ROOM PRIVATA (ordine consistente)
            if (data.type === "JOIN") {

                const roomId = [data.userId, data.otherUserId].sort().join("_");

                ws.room = roomId;

                if (!rooms[roomId]) {
                    rooms[roomId] = new Set();
                }

                rooms[roomId].add(ws);
            }

            // ✅ INVIO MESSAGGI
            if (data.type === "MESSAGE") {

                const roomId = [data.userId, data.otherUserId].sort().join("_");

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

// ✅ START SERVER
server.listen(process.env.PORT || 10000, () => {
    console.log("✅ SERVER COMPLETO ATTIVO");
});
