const http = require("http");
const WebSocket = require("ws");

const server = http.createServer();
const wss = new WebSocket.Server({ server });

const rooms = {};
const roomMessages = {};
const messageState = {};
const messageSenders = {};

// ✅ prende SOLO client reali
function getActiveClients(room, sender) {
    if (!rooms[room]) return [];

    return Array.from(rooms[room]).filter(
        c =>
            c !== sender &&
            c.readyState === WebSocket.OPEN &&
            c.isAlive === true
    );
}

// ✅ broadcast stato
function broadcastStatus(room) {
    if (!rooms[room]) return;

    const active = getActiveClients(room, null);

    const msg = JSON.stringify({
        type: "STATUS",
        online: active.length
    });

    active.forEach(c => c.send(msg));
}

// ✅ connessione
wss.on("connection", (ws) => {

    ws.room = null;
    ws.isAlive = true;

    ws.on("pong", () => {
        ws.isAlive = true;
    });

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
                    ws.send(JSON.stringify({
                        type: "MESSAGE",
                        id: msg.id,
                        msg: msg.msg,
                        senderId: msg.senderId,
                        status: messageState[msg.id] || "⏳"
                    }));
                });

                broadcastStatus(room);
            }

            // ✅ MESSAGE
            if (data.type === "MESSAGE") {

                const room = data.room;
                if (!rooms[room]) return;

                messageSenders[data.id] = ws;
                messageState[data.id] = "⏳";

                roomMessages[room].push(data);

                if (roomMessages[room].length > 50) {
                    roomMessages[room].shift();
                }

                const receivers = getActiveClients(room, ws);

                // ✅ NESSUNO online → FAILED immediato
                if (receivers.length === 0) {

                    messageState[data.id] = "❌";

                    ws.send(JSON.stringify({
                        type: "FAILED",
                        id: data.id
                    }));

                    return;
                }

                // ✅ invia ai client attivi
                receivers.forEach(client => {
                    client.send(JSON.stringify(data));
                });
            }

            // ✅ DELIVERED
            if (data.type === "DELIVERED") {

                const sender = messageSenders[data.id];

                if (sender && sender.readyState === WebSocket.OPEN) {

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

// ✅ elimina client zombie
setInterval(() => {
    wss.clients.forEach(ws => {

        if (!ws.isAlive) {
            ws.terminate();
            return;
        }

        ws.isAlive = false;

        try {
            ws.ping();
        } catch (_) {}
    });
}, 3000); // ✅ molto reattivo

server.listen(process.env.PORT || 10000, () => {
    console.log("Server STABILE DEFINITIVO ✅");
});
