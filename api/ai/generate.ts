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

    const ai = new GoogleGenAI({ apiKey });

    if (type === "chat") {
      const response = await ai.models.generateContent({
        model: model,
        contents: conversation,
        config: {
          systemInstruction: systemInstruction,
        }
      });
      return res.status(200).json({ text: response.text });
    } else {
      const response = await ai.models.generateContent({
        model: model,
        contents: prompt
      });
      return res.status(200).json({ text: response.text });
    }
  } catch (error: any) {
    console.error("AI Proxy Error:", error);
    res.status(500).json({ error: error.message });
  }
}
