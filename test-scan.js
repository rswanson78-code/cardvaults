async function test() {
  const payload = {
    category: "Football",
    prompt: `You are an expert sports card identifier. Analyze the card image(s) and extract information. Respond ONLY with a JSON object:\n{"playerName":"","brand":"","set":"","variation":"","year":"","cardNumber":"","serialNumber":"","estimatedCondition":""}`,
    images: [{ 
      type: "image", 
      source: { 
        type: "base64", 
        media_type: "image/jpeg", 
        data: "/9j/4AAQSkZJRgABAQEASABIAAD/2wBDAAYEBQYFBAYGBQYHBwYIChAKCgkJChQODwwQFxQYGBcUFhYaHSUfGhsjHBYWICwgIyYnKSopGR8tMC0oMCUoKSj/2wBDAQcHBwoIChMKChMoGhYaKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCj/wAARCgABAAEDASIAAhEBAxEB/8QAFAABAAAAAAAAAAAAAAAAAAAABv/EABQQAQAAAAAAAAAAAAAAAAAAAAD/xAAUAQEAAAAAAAAAAAAAAAAAAAAA/8QAFBEBAAAAAAAAAAAAAAAAAAAAAP/aAAwDAQACEQMRAD8ABgAAAP/Z" 
      } 
    }]
  };

  try {
    const res = await fetch('http://localhost:3000/api/scan', {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    });
    
    console.log("HTTP Status:", res.status, res.statusText);
    const text = await res.text();
    console.log("Response Body:", text);
    
    // Simulate what the UI parser does
    if (res.ok) {
        const data = JSON.parse(text);
        let contentText = data.content?.map(i => i.text || "").join("") || "";
        console.log("Extracting JSON from:", contentText);
        const startIndex = contentText.indexOf('{');
        const endIndex = contentText.lastIndexOf('}');
        if (startIndex !== -1 && endIndex !== -1) {
            console.log("Parsed result:", JSON.parse(contentText.substring(startIndex, endIndex + 1)));
        } else {
            console.log("Failed to find JSON block");
        }
    }
  } catch(e) {
    console.error("Fetch Error:", e);
  }
}

test();
