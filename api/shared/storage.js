const { TableClient, AzureNamedKeyCredential } = require("@azure/data-tables");

const tableClients = new Map();

async function getTableClient(tableName) {
  if (!tableClients.has(tableName)) {
    tableClients.set(tableName, createTableClient(tableName));
  }

  return tableClients.get(tableName);
}

async function createTableClient(tableName) {
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

function getConnectionStringValue(connectionString, key) {
  const parts = connectionString.split(";");
  const match = parts.find((part) => part.toLowerCase().startsWith(`${key.toLowerCase()}=`));
  return match ? match.slice(key.length + 1) : "";
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

module.exports = {
  getPublicErrorReason,
  getTableClient,
  jsonResponse
};
