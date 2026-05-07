import { GoogleGenAI } from "@google/genai";

export default async function handler(req: any, res: any) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method Not Allowed' });
  }

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
        history: (conversation || []).slice(0, -1),
        systemInstruction: systemInstruction,
      });
      const lastMsg = conversation[conversation.length - 1];
      const result = await chat.sendMessage(lastMsg.parts[0].text);
      return res.status(200).json({ text: result.response.text() });
    } else {
      const result = await aiModel.generateContent(prompt);
      return res.status(200).json({ text: result.response.text() });
    }
  } catch (error: any) {
    console.error("AI Proxy Error:", error);
    res.status(500).json({ error: error.message });
  }
}
