const { TableClient, AzureNamedKeyCredential } = require("@azure/data-tables");

const tableName = "VisitorCounters";
const totalsEntity = {
  partitionKey: "site",
  rowKey: "totals"
};

let tableClientPromise;

module.exports = async function (context, req) {
  try {
    const visitorId = cleanVisitorId(req.body && req.body.visitorId);

    if (!visitorId) {
      context.res = jsonResponse(400, { error: "visitorId is required" });
      return;
    }

    const country = getCountry(req);
    const tableClient = await getTableClient();
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

async function getTableClient() {
  if (!tableClientPromise) {
    tableClientPromise = createTableClient();
  }

  return tableClientPromise;
}

async function createTableClient() {
  const connectionString =
    process.env.VISITOR_COUNTER_STORAGE || process.env.AzureWebJobsStorage;

  if (!connectionString) {
    const error = new Error("Missing storage connection string");
    error.publicReason = "missing-storage-setting";
    throw error;
  }

  const accountName = getConnectionStringValue(connectionString, "AccountName");
  const accountKey = getConnectionStringValue(connectionString, "AccountKey");
  const tableEndpoint =
    getConnectionStringValue(connectionString, "TableEndpoint") ||
    `https://${accountName}.table.core.windows.net`;

  if (!accountName || !accountKey) {
    const error = new Error("Storage connection string must include AccountName and AccountKey");
    error.publicReason = "invalid-storage-connection-string";
    throw error;
  }

  const credential = new AzureNamedKeyCredential(accountName, accountKey);
  const client = new TableClient(tableEndpoint, tableName, credential);

  try {
    await client.createTable();
  } catch (error) {
    if (error.statusCode !== 409) {
      throw error;
    }
  }

  return client;
}

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

function getConnectionStringValue(connectionString, key) {
  const parts = connectionString.split(";");
  const match = parts.find((part) => part.toLowerCase().startsWith(`${key.toLowerCase()}=`));
  return match ? match.slice(key.length + 1) : "";
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

function jsonResponse(status, body) {
  return {
    status,
    headers: {
      "Content-Type": "application/json",
      "Cache-Control": "no-store"
    },
    body
  };
}

function getPublicErrorReason(error) {
  if (error && error.publicReason) {
    return error.publicReason;
  }

  if (error && (error.statusCode === 401 || error.statusCode === 403)) {
    return "storage-auth-failed";
  }

  if (error && error.statusCode) {
    return `storage-error-${error.statusCode}`;
  }

  return "unknown";
}
