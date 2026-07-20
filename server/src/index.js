import express from "express";

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());

app.get("/api/health", (req, res) => {
  res.json({ status: "ok", service: "pharmate-server" });
});

app.listen(PORT, () => {
  console.log(`PharMate server listening on http://localhost:${PORT}`);
});
