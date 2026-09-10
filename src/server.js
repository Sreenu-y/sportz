import express from "express";
import http from "http";
import { matchRouter } from "./routes/matches.js";
import { attachWebSocketServer } from "./ws/server.js";
import { securityMiddleware } from "./arcjet.js";
import commentaryRouter from "./routes/commentary.js";

const PORT = process.env.PORT || 8080;
const HOST = process.env.HOST || "0.0.0.0";

const app = express();
const server = http.createServer(app);

app.get("/", (_, res) => {
  res.send("Hello World!");
});

app.use(securityMiddleware());
app.use(express.json());

app.use("/matches", matchRouter);
app.use("/matches/:id/commentary", commentaryRouter);

const { broadcastMatchCreated } = attachWebSocketServer(server);

app.locals.broadcastMatchCreated = broadcastMatchCreated;

server.listen(PORT, HOST, () => {
  const baseURL =
    HOST === "0.0.0.0" ? `http://localhost:${PORT}` : `http://${HOST}:${PORT}`;
  console.log(`Server running on ${baseURL}`);
  console.log(
    `Websocket server is running on ${baseURL.replace("http", "ws")}/ws`,
  );
});
