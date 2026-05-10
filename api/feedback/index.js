const crypto = require("crypto");
const {
  getPublicErrorReason,
  getTableClient,
  jsonResponse
} = require("../shared/storage");

const tableName = "VisitorFeedback";

module.exports = async function (context, req) {
  try {
    const feedback = parseFeedback(req.body);

    if (!feedback.message) {
      context.res = jsonResponse(400, { error: "Feedback message is required" });
      return;
    }

    const tableClient = await getTableClient(tableName);
    const createdAt = new Date().toISOString();

    await tableClient.createEntity({
      partitionKey: createdAt.slice(0, 10),
      rowKey: `${Date.now()}-${crypto.randomUUID()}`,
      message: feedback.message,
      name: feedback.name,
      page: feedback.page,
      userAgent: cleanText(req.headers["user-agent"], 300),
      createdAt
    });

    context.res = jsonResponse(200, { ok: true });
  } catch (error) {
    context.log.error(error);
    context.res = jsonResponse(503, {
      error: "Feedback is unavailable",
      reason: getPublicErrorReason(error)
    });
  }
};

function parseFeedback(body) {
  return {
    message: cleanText(body && body.message, 300),
    name: cleanText(body && body.name, 120),
    page: cleanText(body && body.page, 500)
  };
}

function cleanText(value, maxLength) {
  if (typeof value !== "string") {
    return "";
  }

  return value.replace(/\s+/g, " ").trim().slice(0, maxLength);
}
