async function testFetch() {
    try {
        console.log("Fetching geocoding-api.open-meteo.com...");
        const res1 = await fetch("https://geocoding-api.open-meteo.com/v1/search?name=Tokyo&count=1");
        console.log("Geocoding Status:", res1.status);

        console.log("Fetching api.open-meteo.com...");
        const res2 = await fetch("https://api.open-meteo.com/v1/forecast?latitude=35.6895&longitude=139.6917&current_weather=true");
        console.log("Forecast Status:", res2.status);
    } catch (e) {
        console.error("Fetch Failed:", e);
    }
}
testFetch();
