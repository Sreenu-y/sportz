import express from "express";
import { matchRouter } from "./routes/matches.js";

const app = express();

const PORT = process.env.PORT || 8080;

app.use(express.json());

app.get("/", (_, res) => {
  res.send("Hello World!");
});

app.use("/matches", matchRouter);

app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
