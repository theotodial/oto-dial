const SLOW_QUERY_MS = Math.max(
  1,
  Number.parseInt(process.env.MONGO_SLOW_QUERY_MS || "500", 10)
);

const ENABLE_QUERY_LOGGING = process.env.MONGO_QUERY_LOGGING !== "false";

const QUERY_OPERATIONS = [
  "find",
  "findOne",
  "countDocuments",
  "findOneAndUpdate",
  "findOneAndDelete",
  "updateOne",
  "deleteMany",
];

function preview(value) {
  try {
    return JSON.stringify(value).slice(0, 280);
  } catch {
    return "[unserializable]";
  }
}

function logQuery({ label, operation, durationMs, filter, update, pipeline, error }) {
  if (!ENABLE_QUERY_LOGGING) return;

  const slow = durationMs >= SLOW_QUERY_MS;
  const prefix = slow ? "[mongo:slow]" : "[mongo]";
  const parts = [`${prefix} ${label}.${operation} ${durationMs}ms`];

  if (filter && Object.keys(filter).length > 0) {
    parts.push(`filter=${preview(filter)}`);
  }
  if (update && Object.keys(update).length > 0) {
    parts.push(`update=${preview(update)}`);
  }
  if (pipeline) {
    parts.push(`pipeline=${preview(pipeline)}`);
  }
  if (error) {
    parts.push(`error=${error}`);
  }

  console.log(parts.join(" "));
}

function attachQueryHooks(schema, label) {
  for (const operation of QUERY_OPERATIONS) {
    schema.pre(operation, function preQueryLog() {
      this.__perfStartedAt = Date.now();
    });

    schema.post(operation, function postQueryLog() {
      const durationMs = Date.now() - (this.__perfStartedAt || Date.now());
      logQuery({
        label,
        operation,
        durationMs,
        filter: this.getFilter?.() || {},
        update: this.getUpdate?.() || {},
      });
    });

    schema.post(operation, function postQueryError(error, _result, next) {
      const durationMs = Date.now() - (this.__perfStartedAt || Date.now());
      logQuery({
        label,
        operation,
        durationMs,
        filter: this.getFilter?.() || {},
        update: this.getUpdate?.() || {},
        error: error?.message || String(error),
      });
      next(error);
    });
  }
}

export function mongoPerformancePlugin(schema, options = {}) {
  const label = options.label || "mongo";

  attachQueryHooks(schema, label);

  schema.pre("aggregate", function preAggregateLog() {
    this.__perfStartedAt = Date.now();
  });

  schema.post("aggregate", function postAggregateLog() {
    const durationMs = Date.now() - (this.__perfStartedAt || Date.now());
    logQuery({
      label,
      operation: "aggregate",
      durationMs,
      pipeline: this.pipeline?.() || [],
    });
  });

  schema.post("aggregate", function postAggregateError(error, _result, next) {
    const durationMs = Date.now() - (this.__perfStartedAt || Date.now());
    logQuery({
      label,
      operation: "aggregate",
      durationMs,
      pipeline: this.pipeline?.() || [],
      error: error?.message || String(error),
    });
    next(error);
  });
}
