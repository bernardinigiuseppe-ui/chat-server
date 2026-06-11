const http = require("http");
const WebSocket = require("ws");

const PORT = process.env.PORT || 10000;

// server HTTP obbligatorio per Render
const server = http.createServer();

const wss = new WebSocket.Server({ server });

const clients = new Set();

wss.on("connection", (ws) => {
    console.log("Cliente connesso ✅");

    clients.add(ws);

    ws.on("message", (message) => {
        const text = message.toString();
        console.log("Messaggio:", text);

        for (let client of clients) {
            if (client !== ws && client.readyState === WebSocket.OPEN) {
                client.send(text);
            }
        }
    });

    ws.on("close", () => {
        clients.delete(ws);
    });
});

server.listen(PORT, () => {
    console.log("Server in ascolto su porta " + PORT);
});
