import express from "express";
import mongoose from "mongoose";
import dotenv from "dotenv";

import chatRoutes from "./src/routes/chatRoutes.js";
import numberRoutes from "./src/routes/numberRoutes.js";
import callRoutes from "./src/routes/callRoutes.js";
import telnyxWebhookRoutes from "./src/routes/telnyxWebhookRoutes.js";
import walletRoutes from "./src/routes/walletRoutes.js";


dotenv.config();

const app = express();
app.use(express.json());

mongoose.connect(process.env.MONGODB_URI);
console.log("MongoDB Connected");

app.use("/api/chat", chatRoutes);
app.use("/api/numbers", numberRoutes);
app.use("/api/calls", callRoutes);
app.use("/api/webhooks/telnyx", telnyxWebhookRoutes);
app.use("/api/wallet", authenticateUser, walletRoutes);

app.listen(5000, () => {
  console.log("Server running on http://localhost:5000");
});


const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:5000';

async function request(path, options = {}) {
  const token = localStorage.getItem('token');

  const res = await fetch(`${API_BASE}${path}`, {
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {})
    },
    ...options,
    body: options.body ? JSON.stringify(options.body) : undefined
  });

  const data = await res.json();

  if (!res.ok) {
    throw new Error(data.error || data.message || 'API Error');
  }

  return data;
}

export default {
  get: (path) => request(path),
  post: (path, body) => request(path, { method: 'POST', body })
};
