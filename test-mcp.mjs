

const payload = {
  jsonrpc: "2.0",
  id: 1,
  method: "tools/call",
  params: {
    name: "geocode_place",
    arguments: {
      place: "Tokyo"
    }
  }
};

// Wait for server startup
setTimeout(async () => {
  try {
    const response = await fetch("http://localhost:3000/api/mcp", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Accept": "application/json, text/event-stream"
      },
      body: JSON.stringify(payload),
    });
    const text = await response.text();
    console.log("Status:", response.status);
    console.log("Response:", text);
  } catch (e) {
    console.error("Error:", e.message);
  }
}, 3000);
