export type PowensTransportErrorKind =
  | "cancelled"
  | "invalid-response"
  | "network"
  | "timeout";

export class PowensTransportError extends Error {
  readonly kind: PowensTransportErrorKind;

  constructor(
    message: string,
    kind: PowensTransportErrorKind,
    options?: ErrorOptions,
  ) {
    super(message, options);
    this.name = "PowensTransportError";
    this.kind = kind;
  }
}

type PowensApiErrorOptions = {
  code?: string;
  description?: string;
  providerMessage?: string;
  requestId?: number;
  status: number;
};

export class PowensApiError extends Error {
  readonly code: string | undefined;
  readonly description: string | undefined;
  readonly providerMessage: string | undefined;
  readonly requestId: number | undefined;
  readonly status: number;

  constructor({
    code,
    description,
    providerMessage,
    requestId,
    status,
  }: PowensApiErrorOptions) {
    super(
      `Powens request failed with status ${status}${code ? ` (${code})` : ""}`,
    );
    this.name = "PowensApiError";
    this.code = code;
    this.description = description;
    this.providerMessage = providerMessage;
    this.requestId = requestId;
    this.status = status;
  }
}
