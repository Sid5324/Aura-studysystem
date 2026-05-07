import express, { Request, Response } from "express";
import { createServer as createViteServer } from "vite";
import path from "path";
import { fileURLToPath } from "url";
import { GoogleGenAI } from "@google/genai";
import cors from "cors";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function startServer() {
  const app = express();
  const PORT = process.env.PORT || 3000;

  app.use(cors());
  app.use(express.json());

  // AI Proxy Endpoint
  app.post("/api/ai/generate", async (req: Request, res: Response) => {
    try {
      const { prompt, model = "gemini-3-flash-preview", type = "standard", conversation, systemInstruction } = req.body;
      const apiKey = process.env.GEMINI_API_KEY;
      
      if (!apiKey) {
        return res.status(500).json({ error: "GEMINI_API_KEY not configured on server" });
      }

      const genAI = new (GoogleGenAI as any)(apiKey);
      const aiModel = genAI.getGenerativeModel({ model });

      if (type === "chat") {
        const chat = aiModel.startChat({
          history: conversation.slice(0, -1), // everything except the new message
          systemInstruction: systemInstruction,
        });
        const lastMsg = conversation[conversation.length - 1];
        const result = await chat.sendMessage(lastMsg.parts[0].text);
        return res.json({ text: result.response.text() });
      } else {
        const result = await aiModel.generateContent(prompt);
        return res.json({ text: result.response.text() });
      }
    } catch (error: any) {
      console.error("AI Proxy Error:", error);
      res.status(500).json({ error: error.message });
    }
  });

  // Health check
  app.get("/api/health", (req, res) => {
    res.json({ status: "ok", env: process.env.NODE_ENV });
  });

  // Vite middleware for development
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    // SPA fallback
    app.get("*", (req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  app.listen(Number(PORT), "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
