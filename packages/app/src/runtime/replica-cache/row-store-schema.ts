// Bump when persisted replica fields change semantically so the next launch refetches
// authoritative rows instead of painting stale partial data from the previous shape.
export const REPLICA_ROW_STORE_SCHEMA_VERSION = 2;

export const REPLICA_SINGLETON_ROW_ID = "singleton";
