type RouteHandler = (request: Request) => Response | Promise<Response>;

type ExecuteRouteOptions = {
  body?: BodyInit;
  headers?: HeadersInit;
  method?: string;
  path: string;
};

export function executeRoute(
  handler: RouteHandler,
  { body, headers, method = "GET", path }: ExecuteRouteOptions,
) {
  return handler(
    new Request(new URL(path, "http://route.test"), {
      body,
      headers,
      method,
    }),
  );
}

export function executeJsonRoute(
  handler: RouteHandler,
  options: Omit<ExecuteRouteOptions, "body"> & { body: unknown },
) {
  const headers = new Headers(options.headers);
  if (!headers.has("content-type")) {
    headers.set("content-type", "application/json");
  }

  return executeRoute(handler, {
    ...options,
    body: JSON.stringify(options.body),
    headers,
    method: options.method ?? "POST",
  });
}
