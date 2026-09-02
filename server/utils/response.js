/** Send a successful JSON response in a consistent shape. */
export function sendSuccess(
  res,
  data = null,
  message = "OK",
  statusCode = 200,
) {
  return res.status(statusCode).json({ success: true, message, data });
}
