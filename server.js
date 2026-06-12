const http = require("http");
const WebSocket = require("ws");

const server = http.createServer();
const wss = new WebSocket.Server({ server });

// room → clienti
const rooms = {};

// room → messaggi
const roomMessages = {};

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
                    roomMessages[room] = [];
                }

                rooms[room].add(ws);

                console.log(`Entrato nella room ${room}`);

                // ✅ INVIO STORICO
                roomMessages[room].forEach(msg => {
                    ws.send(JSON.stringify({
                        type: "MESSAGE",
                        msg: msg
                    }));
                });

                broadcastStatus(room);
            }

            // ✅ MESSAGGI
            if (data.type === "MESSAGE") {

                const room = data.room;
                if (!rooms[room]) return;

                const text = data.msg;

                // salva storico
                roomMessages[room].push(text);

                if (roomMessages[room].length > 50) {
                    roomMessages[room].shift();
                }

                // invia a tutti nella room
                rooms[room].forEach(client => {
                    if (client.readyState === WebSocket.OPEN) {
                        client.send(JSON.stringify({
                            type: "MESSAGE",
                            msg: text
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
    console.log("Server completo attivo 🚀");
});