const http = require("http");
const WebSocket = require("ws");

const server = http.createServer();
const wss = new WebSocket.Server({ server });

const rooms = {};
const roomMessages = {};
const messageState = {}; // 🔥 salva stato messaggi
const messageSenders = {};

function broadcastStatus(room) {
    if (!rooms[room]) return;

    const msg = JSON.stringify({
        type: "STATUS",
        online: rooms[room].size
    });

    rooms[room].forEach(c => {
        if (c.readyState === WebSocket.OPEN) {
            c.send(msg);
        }
    });
}

wss.on("connection", (ws) => {

    ws.room = null;

    ws.on("message", (message) => {

        try {
            const raw = message.toString();
            if (raw === "ping") return;

            const data = JSON.parse(raw);

            // ✅ JOIN
            if (data.type === "JOIN") {
                const room = data.room;
                ws.room = room;

                if (!rooms[room]) {
                    rooms[room] = new Set();
                    roomMessages[room] = [];
                }

                rooms[room].add(ws);

                // ✅ storico con stato
                roomMessages[room].forEach(msg => {
                    const state = messageState[msg.id] || "⏳";

                    ws.send(JSON.stringify({
                        type: "MESSAGE",
                        id: msg.id,
                        msg: msg.msg,
                        senderId: msg.senderId,
                        status: state
                    }));
                });

                broadcastStatus(room);
            }

            // ✅ MESSAGE
            if (data.type === "MESSAGE") {

                const room = data.room;
                if (!rooms[room]) return;

                messageSenders[data.id] = ws;

                roomMessages[room].push(data);
                messageState[data.id] = "⏳";

                if (roomMessages[room].length > 50) {
                    roomMessages[room].shift();
                }

                let deliveredNow = false;

                rooms[room].forEach(client => {
                    if (client !== ws && client.readyState === WebSocket.OPEN) {
                        client.send(JSON.stringify(data));
                        deliveredNow = true;
                    }
                });

                if (!deliveredNow) {
                    setTimeout(() => {
                        if (rooms[room].size <= 1) {
                            const sender = messageSenders[data.id];
                            if (sender) {
                                messageState[data.id] = "❌";

                                sender.send(JSON.stringify({
                                    type: "FAILED",
                                    id: data.id
                                }));
                            }
                        }
                    }, 3000);
                }
            }

            // ✅ DELIVERED
            if (data.type === "DELIVERED") {

                const sender = messageSenders[data.id];

                if (sender) {
                    messageState[data.id] = "✅";

                    sender.send(JSON.stringify({
                        type: "DELIVERED",
                        id: data.id
                    }));
                }
            }

        } catch (e) {
            console.log("Errore parsing:", message.toString());
        }
    });

    ws.on("close", () => {
        if (ws.room && rooms[ws.room]) {
            rooms[ws.room].delete(ws);
            broadcastStatus(ws.room);
        }
    });
});

// ✅ riduce "fantasma"
wss.on("connection", (ws) => {
    ws.isAlive = true;

    ws.on("pong", () => {
        ws.isAlive = true;
    });
});

// controllo alive
setInterval(() => {
    wss.clients.forEach(ws => {
        if (!ws.isAlive) {
            ws.terminate();
            return;
        }

        ws.isAlive = false;
        ws.ping();
    });
}, 10000);

server.listen(process.env.PORT || 10000, () => {
    console.log("Server FULL FIX ✅");
});