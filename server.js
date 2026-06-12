const http = require("http");
const WebSocket = require("ws");

const server = http.createServer();
const wss = new WebSocket.Server({ server });

const rooms = {};
const roomMessages = {};

// 🔥 traccia messaggi → mittente
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
            const data = JSON.parse(message.toString());

            // ✅ JOIN
            if (data.type === "JOIN") {

                const room = data.room;
                ws.room = room;

                if (!rooms[room]) {
                    rooms[room] = new Set();
                    roomMessages[room] = [];
                }

                rooms[room].add(ws);

                // storico
                roomMessages[room].forEach(msg => {
                    ws.send(JSON.stringify(msg));
                });

                broadcastStatus(room);
            }

            // ✅ MESSAGE
            if (data.type === "MESSAGE") {

                const room = data.room;
                if (!rooms[room]) return;

                // 🔥 salva mittente
                messageSenders[data.id] = ws;

                // salva storico
                roomMessages[room].push(data);

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

                // FAILED ritardato
                if (!deliveredNow) {
                    setTimeout(() => {
                        if (rooms[room].size <= 1) {

                            const sender = messageSenders[data.id];

                            if (sender && sender.readyState === WebSocket.OPEN) {
                                sender.send(JSON.stringify({
                                    type: "FAILED",
                                    id: data.id
                                }));
                            }
                        }
                    }, 3000);
                }
            }

            // ✅ ACK → SOLO al mittente originale
            if (data.type === "DELIVERED") {

                const sender = messageSenders[data.id];

                if (sender && sender.readyState === WebSocket.OPEN) {
                    sender.send(JSON.stringify({
                        type: "DELIVERED",
                        id: data.id
                    }));
                }
            }

        } catch (e) {
            console.log("Errore parsing");
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
    console.log("Server FIX ACK attivo 🚀");
});