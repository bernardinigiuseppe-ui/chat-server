const http = require("http");
const WebSocket = require("ws");

const server = http.createServer();
const wss = new WebSocket.Server({ server });

const rooms = {};
const roomMessages = {};
const messageState = {};
const messageSenders = {};

// ✅ PRESENCE REAL TIME (client vivi)
function getAliveClients(room) {
    if (!rooms[room]) return [];

    return Array.from(rooms[room]).filter(
        c => c.readyState === WebSocket.OPEN && c.isAlive === true
    );
}

function broadcastStatus(room) {
    const alive = getAliveClients(room);

    const msg = JSON.stringify({
        type: "STATUS",
        online: alive.length
    });

    alive.forEach(c => c.send(msg));
}

// ✅ gestione connessione
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

                let deliveredNow = false;

                const aliveClients = getAliveClients(room);

                aliveClients.forEach(client => {
                    if (client !== ws) {
                        client.send(JSON.stringify(data));
                        deliveredNow = true;
                    }
                });

                // ✅ FIX VERO → basato su clienti vivi
                if (!deliveredNow) {
                    setTimeout(() => {

                        const aliveNow = getAliveClients(room);

                        // ✅ se sei SOLO realmente
                        if (aliveNow.length <= 1) {

                            const sender = messageSenders[data.id];

                            if (sender && sender.readyState === WebSocket.OPEN) {
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

// ✅ controllo zombie (fondamentale)
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
}, 5000); // 🔥 più veloce (prima era 10s)

server.listen(process.env.PORT || 10000, () => {
    console.log("Server FIX PRESENCE REALE ✅");
});