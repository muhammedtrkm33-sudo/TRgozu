// Kandilli API Mocking Utility for Testing
window.mockKandilliResponse = function(isSuccess, events = []) {
    const originalFetch = window.fetchKandilliData;

    window.fetchKandilliData = async function() {
        if (!isSuccess) throw new Error("Mocked API Failure");
        return events.map(e => ({
            lat: e.lat || 39.0,
            lng: e.lng || 35.0,
            magnitude: e.mag || 4.0,
            place: e.place || "Mocked Location",
            time: e.time || new Date().toISOString()
        }));
    };

    console.log(" Kandilli API has been mocked.");
    return () => {
        window.fetchKandilliData = originalFetch;
        console.log(" Kandilli API restored.");
    };
};

// Example usage:
// const restore = mockKandilliResponse(true, [{ lat: 39.92, lng: 32.85, mag: 5.2, place: "Ankara Test" }]);
// ... test SOS logic ...
// restore();
