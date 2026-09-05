const POWENS_API_VERSION_PATH = "/2.0";

export type PowensConfig = Readonly<{
  apiBaseUrl: string;
  fingerprintKey: string;
  fingerprintKeyVersion: string;
  sourceTimeZone: string;
  userAccessToken: string;
}>;

export type PowensConsoleConfig = Readonly<{
  apiBaseUrl: string;
  clientId: string;
  clientSecret: string;
}>;

type Environment = Readonly<Record<string, string | undefined>>;

function requireEnvironmentVariable(environment: Environment, name: string) {
  const value = environment[name];

  if (value === undefined || value.trim() === "") {
    throw new Error(`${name} is not configured`);
  }

  return value;
}

function parseApiBaseUrl(value: string) {
  let url: URL;

  try {
    url = new URL(value.trim());
  } catch {
    throw new Error("POWENS_API_BASE_URL must be a valid URL");
  }

  if (url.protocol !== "https:") {
    throw new Error("POWENS_API_BASE_URL must use HTTPS");
  }

  if (url.username || url.password || url.search || url.hash) {
    throw new Error(
      "POWENS_API_BASE_URL must not contain credentials, a query, or a fragment",
    );
  }

  const path = url.pathname.replace(/\/+$/, "");

  if (path !== POWENS_API_VERSION_PATH) {
    throw new Error("POWENS_API_BASE_URL must end with /2.0");
  }

  url.pathname = path;

  return url.toString().replace(/\/$/, "");
}

export function readPowensConfig(
  environment: Environment = process.env,
): PowensConfig {
  return {
    apiBaseUrl: parseApiBaseUrl(
      requireEnvironmentVariable(environment, "POWENS_API_BASE_URL"),
    ),
    fingerprintKey: requireEnvironmentVariable(
      environment,
      "ACCOUNT_IDENTITY_FINGERPRINT_KEY",
    ),
    fingerprintKeyVersion:
      environment.ACCOUNT_IDENTITY_FINGERPRINT_KEY_VERSION?.trim() || "v1",
    sourceTimeZone: parseTimeZone(
      environment.POWENS_API_TIME_ZONE?.trim() || "Europe/Paris",
    ),
    userAccessToken: requireEnvironmentVariable(
      environment,
      "POWENS_USER_ACCESS_TOKEN",
    ),
  };
}

function parseTimeZone(value: string) {
  try {
    new Intl.DateTimeFormat("en", { timeZone: value }).format();
    return value;
  } catch {
    throw new Error("POWENS_API_TIME_ZONE must be a valid IANA time zone");
  }
}

export function readPowensConsoleConfig(
  environment: Environment = process.env,
): PowensConsoleConfig {
  return {
    apiBaseUrl: parseApiBaseUrl(
      requireEnvironmentVariable(environment, "POWENS_API_BASE_URL"),
    ),
    clientId: requireEnvironmentVariable(environment, "POWENS_CLIENT_ID"),
    clientSecret: requireEnvironmentVariable(
      environment,
      "POWENS_CLIENT_SECRET",
    ),
  };
}
