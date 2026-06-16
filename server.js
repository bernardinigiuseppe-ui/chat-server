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
// ✅ AVVIO SERVER
async function startServer() {
    try {
        const client = await MongoClient.connect(process.env.MONGO_URI);
        db = client.db();

        console.log("✅ MongoDB connesso");

        server.listen(process.env.PORT || 10000, () => {
            console.log("✅ SERVER ATTIVO");
        });

    } catch (err) {
        console.log("❌ ERRORE MONGO:", err.message);
    }
}

startServer();

// ==========================
// ✅ TEST
app.get("/", (req, res) => {
    res.send("Server attivo ✅");
});

// ==========================
// ✅ CREATE USER
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

        const result = await db.collection("users").insertOne({
            username,
            createdAt: Date.now(),
            contacts: []
        });

        console.log("✅ UTENTE CREATO:", username);

        res.json({
            userId: result.insertedId.toString(),
            username
        });

    } catch (err) {
        console.log("❌ CREATE ERROR:", err.message);
        res.json({ error: "Errore server" });
    }
});

// ==========================
// ✅ LOGIN
app.post("/login", async (req, res) => {
    try {
        const { username } = req.body;

        if (!username) {
            return res.json({ error: "Username mancante" });
        }

        const user = await db.collection("users").findOne({ username });

        if (!user) {
            return res.json({ error: "Utente non trovato" });
        }

        console.log("✅ LOGIN:", username);

        res.json({
            userId: user._id.toString(),
            username: user.username
        });

    } catch (err) {
        console.log("❌ LOGIN ERROR:", err.message);
        res.json({ error: "Errore server" });
    }
});

// ==========================
// ✅ ADD CONTACT
app.post("/add-contact", async (req, res) => {
    try {
        const { userId, username } = req.body;

        if (!userId || !username) {
            return res.json({ error: "Dati mancanti" });
        }

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

        console.log("✅ CONTATTO AGGIUNTO");

        res.json({ success: true });

    } catch (err) {
        console.log("❌ ADD CONTACT ERROR:", err.message);
        res.json({ error: "Errore server" });
    }
});

// ==========================
// ✅ GET CONTACTS
app.get("/contacts/:userId", async (req, res) => {
    try {

        const user = await db.collection("users").findOne({
            _id: new ObjectId(req.params.userId)
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

    } catch (err) {
        console.log("❌ CONTACTS ERROR:", err.message);
        res.json([]);
    }
});

// ==========================
// ✅ WEBSOCKET CHAT
const rooms = {};

wss.on("connection", (ws) => {

    console.log("🔌 WS CONNESSO");

    ws.on("message", (message) => {

        console.log("📥 RAW:", message.toString());

        try {
            const data = JSON.parse(message.toString());

            console.log("✅ PARSED:", data);

            const roomId = [data.userId, data.otherUserId]
                .sort()
                .join("_");

            // ✅ JOIN
            if (data.type === "JOIN") {

                if (!rooms[roomId]) {
                    rooms[roomId] = new Set();
                }

                rooms[roomId].add(ws);
                ws.room = roomId;

                console.log("👥 JOIN:", roomId, "| clients:", rooms[roomId].size);
            }

            // ✅ MESSAGE
            if (data.type === "MESSAGE") {

                console.log("📤 MESSAGE:", data.msg);

                if (!rooms[roomId]) {
                    console.log("❌ ROOM NON ESISTE → MESSAGE SCARTATO");
                    return;
                }

                console.log("👥 CLIENTS IN ROOM:", rooms[roomId].size);

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

        console.log("🔴 WS CHIUSO");

        if (ws.room && rooms[ws.room]) {
            rooms[ws.room].delete(ws);
        }
    });
});
