

const payload = {
    jsonrpc: "2.0",
    id: 1,
    method: "tools/call",
    params: {
        name: "get_forecast",
        arguments: {
            latitude: 35.6895,
            longitude: 139.6917,
            days: 1
        }
    }
};

async function test() {
    console.log("Sending request...");
    try {
        const res = await fetch("http://localhost:3000/api/mcp", {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                "Accept": "application/json, text/event-stream"
            },
            body: JSON.stringify(payload)
        });

        if (!res.ok) {
            console.error("HTTP Error:", res.status, await res.text());
            return;
        }

        const text = await res.text();
        console.log("Raw Response:", text);

        // Parse SSE to find data: {...}
        const lines = text.split("\n");
        let data;
        for (const line of lines) {
            if (line.startsWith("data:")) {
                const jsonStr = line.substring(5).trim();
                try {
                    data = JSON.parse(jsonStr);
                    break;
                } catch (e) {
                    console.error("Failed to parse JSON line:", line);
                }
            }
        }

        if (!data) {
            // Fallback: try parsing the whole text as JSON (in case it wasn't SSE)
            try {
                data = JSON.parse(text);
            } catch (e) {
                console.error("Could not parse response as SSE or JSON:", text);
                return;
            }
        }

        if (data.error) {
            console.error("RPC Error:", data.error);
            return;
        }

        const result = data.result;
        const weather = result.structuredContent;

        console.log("Result Kind:", weather.kind);
        if (weather.daily && weather.daily.length > 0) {
            const today = weather.daily[0];
            console.log("First day date:", today.date);

            if (today.hourly) {
                console.log("✅ Hourly data object present");
                console.log("   Time count:", today.hourly.time?.length);
                console.log("   Temp count:", today.hourly.temperature_2m?.length);
                console.log("   WeatherCode count:", today.hourly.weathercode?.length);
                console.log("   PrecipProb count:", today.hourly.precipitation_probability?.length);

                if (today.hourly.time?.length === 24) {
                    console.log("✅ Hourly data count is 24 as expected.");
                } else {
                    console.error("❌ Hourly data count mismatch (expected 24).");
                }

                console.log("   Sample[0] Time:", today.hourly.time[0]);
                console.log("   Sample[0] Temp:", today.hourly.temperature_2m[0]);
                console.log("   Sample[0] Code:", today.hourly.weathercode[0]);
            } else {
                console.error("❌ Hourly data MISSING in daily object!");
            }
        } else {
            console.error("❌ No daily data found.");
        }

    } catch (e) {
        console.error("Test execution failed:", e);
    }
}

// Wait a bit for server to be ready if we just started it
test();
