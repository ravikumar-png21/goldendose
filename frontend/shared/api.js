// The frontend's only way of talking to the backend.
// Every screen calls api("GET", "/api/today") and so on, instead of writing fetch() itself.
// That keeps the token, JSON handling and error messages in one place.

export class ApiError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status; // 0 means "couldn't reach the backend at all" (no internet)
  }
}

export function createApi(getToken) {
  // { raw }: send a file. { blob: true }: get a file back (a prescription, a spreadsheet).
  return async function api(method, path, body, { raw, blob } = {}) {
    const headers = {};
    const token = getToken();
    if (token) headers.Authorization = `Bearer ${token}`;

    let payload;
    if (raw) {
      payload = raw;                                   // a file, such as a photo
      headers["Content-Type"] = raw.type || "application/octet-stream";
    } else if (body !== undefined) {
      payload = JSON.stringify(body);                  // normal data, sent as JSON
      headers["Content-Type"] = "application/json";
    }

    let response;
    try {
      response = await fetch(path, { method, headers, body: payload });
    } catch {
      throw new ApiError(0, "No internet connection. Check Wi-Fi or mobile data and try again.");
    }

    if (blob && response.ok) return response.blob();
    const text = await response.text();
    let data = null;
    if (text) {
      try { data = JSON.parse(text); } catch { data = null; }
    }
    if (!response.ok) throw new ApiError(response.status, data?.error ?? "Something went wrong. Try again.");
    return data;
  };
}
