// A small helper for sending errors with the right status code.
// Anywhere in the code we can write:  throw new HttpError(409, "Already marked as taken.")
// and the error handler in app.js turns it into a proper reply.

export class HttpError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}
