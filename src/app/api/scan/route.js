import { NextResponse } from 'next/server';

export async function POST(req) {
  try {
    const { category, prompt, images } = await req.json();
    const apiKey = process.env.GEMINI_API_KEY;

    if (!apiKey || apiKey === "YOUR_API_KEY_HERE") {
      return NextResponse.json({ 
        content: [{ text: JSON.stringify({
          playerName: "Error: Missing API Key",
          brand: "Check .env.local",
          set: "Add GEMINI_API_KEY",
          variation: "", year: "", cardNumber: "", serialNumber: "", estimatedCondition: ""
        }) }] 
      }, { status: 200 }); // Return 200 so UI shows error text nicely without crashing
    }

    // Convert Anthropic structure to Gemini structure
    const parts = images.map(img => {
      if (img.type === "text") {
        return { text: img.text };
      } else if (img.type === "image") {
        return {
          inlineData: {
            mimeType: img.source.media_type,
            data: img.source.data
          }
        };
      }
    });

    parts.push({ text: prompt });

    const geminiPayload = {
      contents: [{ role: "user", parts }],
      generationConfig: {
        responseMimeType: "application/json"
      }
    };

    const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(geminiPayload)
    });

    const data = await res.json();
    
    if (!res.ok) {
        console.error("Google AI Error:", data);
        return NextResponse.json({
          content: [{ text: JSON.stringify({ playerName: "API Error", brand: data.error?.message || "Unknown error" }) }]
        }, { status: 200 });
    }

    const text = data.candidates?.[0]?.content?.parts?.[0]?.text || "{}";
    
    // Return Anthropic formatted response so the client code works cleanly
    return NextResponse.json({
      content: [{ text: text }]
    });

  } catch (error) {
    console.error("Scan Server Error:", error);
    return NextResponse.json({
      content: [{ text: JSON.stringify({ playerName: "Server Error", brand: error.message }) }]
    }, { status: 200 });
  }
}
