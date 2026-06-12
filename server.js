const http = require("http");
const WebSocket = require("ws");

const server = http.createServer();
const wss = new WebSocket.Server({ server });

const clients = new Set();

// ✅ funzione stato utenti
function broadcastStatus() {
    const message = JSON.stringify({
        type: "STATUS",
        online: clients.size
    });

    clients.forEach(client => {
        if (client.readyState === WebSocket.OPEN) {
            client.send(message);
        }
    });
}

wss.on("connection", (ws) => {
    console.log("Cliente connesso ✅");

    clients.add(ws);

    // aggiorna stato
    broadcastStatus();

    ws.on("message", (message) => {
        const text = message.toString();
        console.log("Messaggio:", text);

        // inoltro a tutti gli altri
        for (let client of clients) {
            if (client !== ws && client.readyState === WebSocket.OPEN) {
                client.send(text);
            }
        }
    });

    ws.on("close", () => {
        console.log("Cliente disconnesso ❌");
        clients.delete(ws);

        // aggiorna stato
        broadcastStatus();
    });
});

server.listen(process.env.PORT || 10000, () => {
    console.log("Server attivo 🚀");
});
