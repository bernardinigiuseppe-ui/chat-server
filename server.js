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
// ✅ CONNECT MONGO (BLOCCANTE)
async function startServer() {
    try {
        const client = await MongoClient.connect(process.env.MONGO_URI);
        db = client.db();
        console.log("✅ MongoDB connesso");

        // ✅ SERVER PARTE SOLO DOPO MONGO
        server.listen(process.env.PORT || 10000, () => {
            console.log("✅ SERVER COMPLETO ATTIVO");
        });

    } catch (err) {
        console.log("❌ ERRORE MONGO:", err.message);
    }
}

startServer();

// ==========================
// ✅ TEST ROUTE
app.get("/", (req, res) => {
    res.send("Server attivo ✅");
});

// ==========================
// ✅ CREA UTENTE (FIXATO)
app.post("/create-user", async (req, res) => {

    try {

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

        console.log("✅ UTENTE CREATO:", username);

        res.json({
            userId: result.insertedId.toString(),
            username
        });

    } catch (err) {
        console.log("❌ ERRORE CREATE USER:", err.message);
        res.json({ error: "Errore server" });
    }
});

// ==========================
// ✅ GET USERS (DEBUG)
app.get("/users", async (req, res) => {

    const users = await db.collection("users").find({}).toArray();

    res.json(users.map(u => ({
        userId: u._id.toString(),
        username: u.username
    })));
});

// ==========================
// ✅ ADD CONTACT (FIXATO)
app.post("/add-contact", async (req, res) => {

    try {

        const { userId, username } = req.body;

        const contact = await db.collection("users").findOne({ username });

        if (!contact) {
            return res.json({ error: "Utente non trovato" });
        }

        if (contact._id.toString() === userId) {
            return res.json({ error: "Non puoi aggiungere te stesso" });
        }

        const result = await db.collection("users").updateOne(
            { _id: new ObjectId(userId) },
            { $addToSet: { contacts: contact._id.toString() } }
        );

        if (result.modifiedCount === 0) {
            return res.json({ error: "Contatto già presente" });
        }

        res.json({ success: true });

    } catch (err) {
        console.log("❌ ERRORE ADD CONTACT:", err.message);
        res.json({ error: "Errore server" });
    }
});

// ==========================
// ✅ GET CONTACTS
app.get("/contacts/:userId", async (req, res) => {

    const userId = req.params.userId;

    const user = await db.collection("users").findOne({
        _id: new ObjectId(userId)
    });

    if (!user || !user.contacts) {
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
// ✅ WEBSOCKET
const rooms = {};

wss.on("connection", (ws) => {

    ws.on("message", (message) => {

        try {
            const data = JSON.parse(message.toString());

            const roomId = [data.userId, data.otherUserId].sort().join("_");

            if (data.type === "JOIN") {

                ws.room = roomId;

                if (!rooms[roomId]) {
                    rooms[roomId] = new Set();
                }

                rooms[roomId].add(ws);
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
            console.log("Errore WS:", err.message);
        }
    });

    ws.on("close", () => {
        if (ws.room && rooms[ws.room]) {
            rooms[ws.room].delete(ws);
        }
    });
});
