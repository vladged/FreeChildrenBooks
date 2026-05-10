const {
  getPublicErrorReason,
  getTableClient,
  jsonResponse
} = require("../shared/storage");

const tableName = "VisitorCounters";
const totalsEntity = {
  partitionKey: "site",
  rowKey: "totals"
};

module.exports = async function (context, req) {
  try {
    const visitorId = cleanVisitorId(req.body && req.body.visitorId);

    if (!visitorId) {
      context.res = jsonResponse(400, { error: "visitorId is required" });
      return;
    }

    const country = getCountry(req);
    const tableClient = await getTableClient(tableName);
    const isNewVisitor = await ensureVisitor(tableClient, visitorId, country);
    const totals = await updateTotals(tableClient, isNewVisitor);

    context.res = jsonResponse(200, {
      totalVisits: totals.totalVisits,
      uniqueVisitors: totals.uniqueVisitors,
      country
    });
  } catch (error) {
    context.log.error(error);
    context.res = jsonResponse(503, {
      error: "Visit counter is unavailable",
      reason: getPublicErrorReason(error)
    });
  }
};

async function ensureVisitor(tableClient, visitorId, country) {
  const entity = {
    partitionKey: "visitor",
    rowKey: visitorId,
    country,
    firstSeenAt: new Date().toISOString()
  };

  try {
    await tableClient.createEntity(entity);
    return true;
  } catch (error) {
    if (error.statusCode === 409) {
      return false;
    }

    throw error;
  }
}

async function updateTotals(tableClient, isNewVisitor) {
  for (let attempt = 0; attempt < 5; attempt += 1) {
    const totals = await getTotals(tableClient);
    const nextTotals = {
      ...totals,
      totalVisits: Number(totals.totalVisits || 0) + 1,
      uniqueVisitors: Number(totals.uniqueVisitors || 0) + (isNewVisitor ? 1 : 0),
      updatedAt: new Date().toISOString()
    };

    try {
      await tableClient.updateEntity(nextTotals, "Merge");
      return nextTotals;
    } catch (error) {
      if (error.statusCode !== 412) {
        throw error;
      }
    }
  }

  throw new Error("Could not update totals after retries");
}

async function getTotals(tableClient) {
  try {
    return await tableClient.getEntity(totalsEntity.partitionKey, totalsEntity.rowKey);
  } catch (error) {
    if (error.statusCode !== 404) {
      throw error;
    }
  }

  const initialTotals = {
    ...totalsEntity,
    totalVisits: 0,
    uniqueVisitors: 0,
    updatedAt: new Date().toISOString()
  };

  try {
    await tableClient.createEntity(initialTotals);
  } catch (error) {
    if (error.statusCode !== 409) {
      throw error;
    }
  }

  return tableClient.getEntity(totalsEntity.partitionKey, totalsEntity.rowKey);
}

function cleanVisitorId(visitorId) {
  if (typeof visitorId !== "string") {
    return "";
  }

  return visitorId.replace(/[^a-zA-Z0-9-]/g, "").slice(0, 80);
}

function getCountry(req) {
  return (
    req.headers["x-ms-client-country"] ||
    req.headers["cf-ipcountry"] ||
    req.headers["x-vercel-ip-country"] ||
    "Unavailable"
  );
}
