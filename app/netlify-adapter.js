import serverless from "serverless-http";
// Convert Netlify's Request/Response API to Express without opening a listening socket.
// A streamed Response preserves MP3/PDF downloads above the buffered binary limit.
export function netlifyAdapter(app) {
  const handle = serverless(app, { binary: ["audio/mpeg", "application/pdf"] });
  return async (request, context = {}) => {
    const url = new URL(request.url),
      body = ["GET", "HEAD"].includes(request.method)
        ? null
        : Buffer.from(await request.arrayBuffer());
    const event = {
      httpMethod: request.method,
      path:
        url.pathname.replace(/^\/\.netlify\/functions\/api(?=\/|$)/, "") || "/",
      headers: Object.fromEntries(request.headers),
      queryStringParameters: Object.fromEntries(url.searchParams),
      multiValueQueryStringParameters: Object.fromEntries(
        [...new Set(url.searchParams.keys())].map((k) => [
          k,
          url.searchParams.getAll(k),
        ]),
      ),
      body: body?.toString("base64") || null,
      isBase64Encoded: !!body,
      requestContext: { identity: { sourceIp: context.ip || "127.0.0.1" } },
    };
    const response = await handle(event, {}),
      bytes = Buffer.from(
        response.body || "",
        response.isBase64Encoded ? "base64" : "utf8",
      ),
      headers = new Headers(response.headers);
    headers.delete("content-length");
    if (request.method === "HEAD" || [204, 304].includes(response.statusCode))
      return new Response(null, { status: response.statusCode, headers });
    const stream = new ReadableStream({
      start(controller) {
        controller.enqueue(bytes);
        controller.close();
      },
    });
    return new Response(stream, { status: response.statusCode, headers });
  };
}
