const http = require("http");
const WebSocket = require("ws");

const server = http.createServer();
const wss = new WebSocket.Server({ server });

// rooms: { "1234": Set(), "abcd": Set() }
const rooms = {};

// funzione status (per ogni room)
function broadcastStatus(room) {
    if (!rooms[room]) return;

    const message = JSON.stringify({
        type: "STATUS",
        online: rooms[room].size
    });

    rooms[room].forEach(client => {
        if (client.readyState === WebSocket.OPEN) {
            client.send(message);
        }
    });
}

wss.on("connection", (ws) => {
    console.log("Cliente connesso ✅");

    ws.room = null;

    ws.on("message", (message) => {
        try {
            const data = JSON.parse(message.toString());

            // ✅ JOIN ROOM
            if (data.type === "JOIN") {
                const room = data.room;

                ws.room = room;

                if (!rooms[room]) {
                    rooms[room] = new Set();
                }

                rooms[room].add(ws);

                console.log(`Entrato nella room ${room}`);

                broadcastStatus(room);
            }

            // ✅ MESSAGGI
            if (data.type === "MESSAGE") {
                const room = data.room;

                if (!rooms[room]) return;

                rooms[room].forEach(client => {
                    if (client !== ws && client.readyState === WebSocket.OPEN) {
                        client.send(JSON.stringify({
                            type: "MESSAGE",
                            msg: data.msg
                        }));
                    }
                });
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

        console.log("Cliente disconnesso ❌");
    });
});

server.listen(process.env.PORT || 10000, () => {
    console.log("Server ROOM attivo 🚀");
});