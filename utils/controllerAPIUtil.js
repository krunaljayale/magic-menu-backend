// utils/controllerUtils.js

/**
 * Check if value is a plain JS object ({}), not Date / ObjectId / Buffer / class instance.
 */
function isPlainObject(value) {
  if (!value || typeof value !== "object") return false;
  return value.constructor && value.constructor === Object;
}

/**
 * Lightweight check for BSON ObjectId-like objects (works for mongoose ObjectId)
 */
function isObjectIdLike(value) {
  return (
    value &&
    typeof value === "object" &&
    (value._bsontype === "ObjectID" ||
      typeof value.toHexString === "function" ||
      (value.constructor && value.constructor.name === "ObjectID"))
  );
}

/**
 * Check if value is empty for arrays or plain objects.
 */
function isEmpty(val) {
  if (val == null) return true;
  if (Array.isArray(val)) return val.length === 0;
  if (isPlainObject(val)) return Object.keys(val).length === 0;
  return false;
}

/**
 * Recursively remove keys that are null/undefined/empty plain objects/arrays.
 * Preserve non-plain objects (Date, ObjectId, Buffer, class instances).
 */
function cleanObject(obj) {
  // Arrays: clean members and remove empty/null entries
  if (Array.isArray(obj)) {
    const cleaned = obj
      .map((v) => (v && typeof v === "object" ? cleanObject(v) : v))
      .filter((v) => v !== null && v !== undefined && !(typeof v === "object" && isEmpty(v)));
    return cleaned;
  }

  // If not a plain object (e.g. Date, ObjectId, Buffer, class instance) keep as-is
  if (obj && typeof obj === "object" && !isPlainObject(obj)) {
    return obj;
  }

  // Plain object: recurse
  if (isPlainObject(obj)) {
    const out = {};
    for (const [k, v] of Object.entries(obj)) {
      if (v === null || v === undefined) continue;

      if (Array.isArray(v)) {
        const cleaned = cleanObject(v);
        if (cleaned.length === 0) continue;
        out[k] = cleaned;
        continue;
      }

      if (isPlainObject(v)) {
        const cleaned = cleanObject(v);
        if (isEmpty(cleaned)) continue;
        out[k] = cleaned;
        continue;
      }

      // Non-plain object (Date/ObjectId/Buffer/etc.) — keep as is
      if (v && typeof v === "object" && !isPlainObject(v)) {
        out[k] = v;
        continue;
      }

      // primitive
      out[k] = v;
    }
    return out;
  }

  // primitives
  return obj;
}

function formatLocationObject(loc) {
  if (!loc || typeof loc !== "object") return null;
  const parts = [];
  if (loc.title) parts.push(String(loc.title).trim());
  if (loc.houseNo !== undefined && loc.houseNo !== null) parts.push(String(loc.houseNo).trim());
  if (loc.buildingNo) parts.push(String(loc.buildingNo).trim());
  if (loc.address) parts.push(String(loc.address).trim());
  if (loc.landmark) parts.push(String(loc.landmark).trim());
  const formatted = parts.filter(Boolean).join(", ");
  return formatted || null;
}

function buildMapUrls(lat, lng) {
  if (lat == null || lng == null) return null;
  const latStr = encodeURIComponent(String(lat));
  const lngStr = encodeURIComponent(String(lng));
  const google = `https://www.google.com/maps/search/?api=1&query=${latStr},${lngStr}`;
  const osm = `https://www.openstreetmap.org/?mlat=${latStr}&mlon=${lngStr}#map=18/${latStr}/${lngStr}`;
  return { mapUrl: google, osmUrl: osm };
}

function toIsoOrNull(val) {
  if (val == null) return null;
  if (val instanceof Date) return val.toISOString();
  if (typeof val === "string") {
    const d = new Date(val);
    return isNaN(d.getTime()) ? null : d.toISOString();
  }
  if (typeof val === "number") {
    const d = new Date(val);
    return isNaN(d.getTime()) ? null : d.toISOString();
  }
  if (typeof val === "object" && val.$date) {
    try {
      const d = new Date(val.$date);
      return isNaN(d.getTime()) ? null : d.toISOString();
    } catch (e) {
      return null;
    }
  }
  return null;
}

module.exports = { cleanObject, isEmpty, isPlainObject, isObjectIdLike ,formatLocationObject,buildMapUrls,toIsoOrNull };
