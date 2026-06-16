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
    const { username } = req.body;

    const existing = await db.collection("users").findOne({ username });
    if (existing) return res.json({ error: "Username già esistente" });

    const result = await db.collection("users").insertOne({
        username,
        createdAt: Date.now(),
        contacts: []
    });

    res.json({
        userId: result.insertedId.toString(),
        username
    });
});

// ==========================
// ✅ LOGIN
app.post("/login", async (req, res) => {
    const { username } = req.body;

    const user = await db.collection("users").findOne({ username });
    if (!user) return res.json({ error: "Utente non trovato" });

    res.json({
        userId: user._id.toString(),
        username: user.username
    });
});

// ==========================
// ✅ ADD CONTACT
app.post("/add-contact", async (req, res) => {

    const { userId, username } = req.body;

    const contact = await db.collection("users").findOne({ username });
    if (!contact) return res.json({ error: "Utente non trovato" });

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
});

// ==========================
// ✅ CONTACTS
app.get("/contacts/:userId", async (req, res) => {

    const user = await db.collection("users").findOne({
        _id: new ObjectId(req.params.userId)
    });

    if (!user || !user.contacts.length) return res.json([]);

    const contacts = await db.collection("users")
        .find({ _id: { $in: user.contacts.map(id => new ObjectId(id)) } })
        .toArray();

    res.json(contacts.map(u => ({
        userId: u._id.toString(),
        username: u.username
    })));
});

// ==========================
// ✅ WEBSOCKET CHAT (FIXATO)
const rooms = {};

wss.on("connection", (ws) => {

    console.log("🔌 WS CONNESSO");

    ws.on("message", (message) => {

        try {
            const data = JSON.parse(message.toString());

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

                console.log("👥 JOIN:", roomId, "clients:", rooms[roomId].size);
            }

            // ✅ MESSAGE (FIX CRITICO)
            if (data.type === "MESSAGE") {

                if (!rooms[roomId]) {
                    rooms[roomId] = new Set();
                }

                console.log("📩 MSG:", data.userId, "→", data.otherUserId);
                console.log("👥 ROOM:", roomId, "clients:", rooms[roomId].size);

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
            console.log("❌ WS ERROR:", err.message);
        }
    });

    ws.on("close", () => {
        if (ws.room && rooms[ws.room]) {
            rooms[ws.room].delete(ws);
            console.log("🔴 WS DISCONNESSO");
        }
    });
});


-------------------------------------------------

package com.example.calculatorapp

import android.os.Bundle
import android.widget.*
import androidx.appcompat.app.AppCompatActivity
import org.json.JSONObject
import android.util.Log

class ChatActivity : AppCompatActivity() {

    private lateinit var listView: ListView
    private lateinit var input: EditText
    private lateinit var sendBtn: Button

    private val messages = mutableListOf<String>()
    private lateinit var adapter: ArrayAdapter<String>

    private lateinit var userId: String
    private lateinit var otherUserId: String

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)

        val layout = LinearLayout(this)
        layout.orientation = LinearLayout.VERTICAL

        listView = ListView(this)
        input = EditText(this)
        sendBtn = Button(this)
        sendBtn.text = "Invia"

        layout.addView(listView)
        layout.addView(input)
        layout.addView(sendBtn)

        setContentView(layout)

        adapter = ArrayAdapter(this, android.R.layout.simple_list_item_1, messages)
        listView.adapter = adapter

        val prefs = getSharedPreferences("chat_prefs", MODE_PRIVATE)
        userId = prefs.getString("user_id", "") ?: ""
        otherUserId = intent.getStringExtra("otherUserId") ?: ""

        // ✅ JOIN SEMPRE
        joinChat()

        WebSocketManager.onMessageReceived = { text ->

            Log.d("CHAT_MSG", text)

            val json = JSONObject(text)
            val msg = json.optString("msg", "")
            val sender = json.optString("senderId", "")

            if (msg.isNotEmpty()) {
                runOnUiThread {
                    if (sender == userId) {
                        messages.add("ME: $msg")
                    } else {
                        messages.add("ALTRO: $msg")
                    }
                    adapter.notifyDataSetChanged()
                }
            }
        }

        sendBtn.setOnClickListener {

            val msg = input.text.toString()
            if (msg.isEmpty()) return@setOnClickListener

            val json = JSONObject()
            json.put("type", "MESSAGE")
            json.put("userId", userId)
            json.put("otherUserId", otherUserId)
            json.put("msg", msg)

            Log.d("SEND", json.toString())

            WebSocketManager.sendMessage(json.toString())

            input.setText("")
        }
    }

    private fun joinChat() {
        val json = JSONObject()
        json.put("type", "JOIN")
        json.put("userId", userId)
        json.put("otherUserId", otherUserId)

        Log.d("JOIN", json.toString())

        WebSocketManager.sendMessage(json.toString())
    }
}
