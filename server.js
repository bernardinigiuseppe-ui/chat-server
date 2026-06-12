const http = require("http");
const WebSocket = require("ws");

const server = http.createServer();
const wss = new WebSocket.Server({ server });

// room -> clienti
const rooms = {};

// room -> messaggi (storico)
const roomMessages = {};

// id messaggio -> mittente
const messageSenders = {};

// ✅ aggiorna stato utenti
function broadcastStatus(room) {
    if (!rooms[room]) return;

    const msg = JSON.stringify({
        type: "STATUS",
        online: rooms[room].size
    });

    rooms[room].forEach(client => {
        if (client.readyState === WebSocket.OPEN) {
            client.send(msg);
        }
    });
}

wss.on("connection", (ws) => {

    ws.room = null;

    ws.on("message", (message) => {

        try {
            const raw = message.toString();

            // ✅ FIX: ignora ping
            if (raw === "ping") return;

            const data = JSON.parse(raw);

            // ✅ JOIN ROOM
            if (data.type === "JOIN") {

                const room = data.room;
                ws.room = room;

                if (!rooms[room]) {
                    rooms[room] = new Set();
                    roomMessages[room] = [];
                }

                rooms[room].add(ws);

                console.log("JOIN room:", room);

                // ✅ invio storico
                roomMessages[room].forEach(msg => {
                    ws.send(JSON.stringify(msg));
                });

                broadcastStatus(room);
            }

            // ✅ INVIO MESSAGGIO
            if (data.type === "MESSAGE") {

                const room = data.room;
                if (!rooms[room]) return;

                console.log("MSG:", data.msg);

                // ✅ salva mittente
                messageSenders[data.id] = ws;

                // ✅ salva storico
                roomMessages[room].push(data);

                if (roomMessages[room].length > 50) {
                    roomMessages[room].shift();
                }

                let deliveredNow = false;

                // ✅ invia agli altri client
                rooms[room].forEach(client => {
                    if (client !== ws && client.readyState === WebSocket.OPEN) {
                        client.send(JSON.stringify(data));
                        deliveredNow = true;
                    }
                });

                // ✅ FAILED DOPO 3s se nessuno online
                if (!deliveredNow) {
                    setTimeout(() => {
                        if (rooms[room].size <= 1) {

                            const sender = messageSenders[data.id];

                            if (sender && sender.readyState === WebSocket.OPEN) {
                                console.log("FAILED:", data.id);

                                sender.send(JSON.stringify({
                                    type: "FAILED",
                                    id: data.id
                                }));
                            }
                        }
                    }, 3000);
                }
            }

            // ✅ ACK (solo al mittente originale)
            if (data.type === "DELIVERED") {

                const sender = messageSenders[data.id];

                if (sender && sender.readyState === WebSocket.OPEN) {
                    console.log("DELIVERED:", data.id);

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

        console.log("Client disconnesso");
    });
});

server.listen(process.env.PORT || 10000, () => {
    console.log("Server STABILE DEFINITIVO 🚀");
});