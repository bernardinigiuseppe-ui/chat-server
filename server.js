const http = require("http");
const WebSocket = require("ws");

const server = http.createServer();
const wss = new WebSocket.Server({ server });

const rooms = {};
const roomMessages = {};
const messageState = {};
const messageSenders = {};

function getClients(room, sender) {
    if (!rooms[room]) return [];

    return Array.from(rooms[room]).filter(
        c => c !== sender && c.readyState === WebSocket.OPEN
    );
}

function broadcastStatus(room) {
    if (!rooms[room]) return;

    const online = Array.from(rooms[room]).filter(
        c => c.readyState === WebSocket.OPEN
    ).length;

    const msg = JSON.stringify({
        type: "STATUS",
        online
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

                // ✅ storico con stato salvato
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

                const receivers = getClients(room, ws);

                // ✅ invio ai client (se presenti)
                receivers.forEach(client => {
                    client.send(JSON.stringify(data));
                });
            }

            // ✅ DELIVERED (ricevuto)
            if (data.type === "DELIVERED") {

                messageState[data.id] = "✅";

                const sender = messageSenders[data.id];
                if (sender && sender.readyState === WebSocket.OPEN) {
                    sender.send(JSON.stringify({
                        type: "DELIVERED",
                        id: data.id
                    }));
                }
            }

            // ✅ READ (letto)
            if (data.type === "READ") {

                messageState[data.id] = "👁";

                const sender = messageSenders[data.id];
                if (sender && sender.readyState === WebSocket.OPEN) {
                    sender.send(JSON.stringify({
                        type: "READ",
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

server.listen(process.env.PORT || 10000, () => {
    console.log("Server DELIVERY + READ ✅");
});