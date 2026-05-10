(function () {
  const visitorKey = "childrenBooksVisitorId";
  const visitCount = document.querySelector("#visit-count");
  const uniqueCount = document.querySelector("#unique-count");
  const visitorCountry = document.querySelector("#visitor-country");
  const legacyVisitorCount = document.querySelector("#visitorCount");

  function getVisitorId() {
    const existingVisitorId = localStorage.getItem(visitorKey);

    if (existingVisitorId) {
      return existingVisitorId;
    }

    const newVisitorId =
      window.crypto && window.crypto.randomUUID
        ? window.crypto.randomUUID()
        : `${Date.now()}-${Math.random().toString(16).slice(2)}`;

    localStorage.setItem(visitorKey, newVisitorId);
    return newVisitorId;
  }

  function setUnavailable() {
    if (visitCount) visitCount.textContent = "Unavailable";
    if (uniqueCount) uniqueCount.textContent = "Unavailable";
    if (visitorCountry) visitorCountry.textContent = "Unavailable";
    if (legacyVisitorCount) legacyVisitorCount.textContent = "Visitors: Unavailable";
  }

  fetch("/api/visit", {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      visitorId: getVisitorId()
    })
  })
    .then((response) => {
      if (!response.ok) {
        throw new Error("Visit counter failed");
      }

      return response.json();
    })
    .then((data) => {
      const totalVisits = Number(data.totalVisits || 0).toLocaleString();
      const uniqueVisitors = Number(data.uniqueVisitors || 0).toLocaleString();

      if (visitCount) visitCount.textContent = totalVisits;
      if (uniqueCount) uniqueCount.textContent = uniqueVisitors;
      if (visitorCountry) visitorCountry.textContent = data.country || "Unavailable";
      if (legacyVisitorCount) legacyVisitorCount.textContent = `Visitors: ${totalVisits}`;
    })
    .catch(setUnavailable);
})();
