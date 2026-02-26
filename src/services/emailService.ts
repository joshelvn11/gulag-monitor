import { MonitorConfig } from "../types.js";

export type SendEmailInput = {
  to: string[];
  subject: string;
  text: string;
};

export type SendEmailResult = {
  providerMessageId: string | null;
  responseCode: number;
};

const DEFAULT_FROM_NAME = "Gulag Monitor";

export class EmailSendError extends Error {
  responseCode: number | null;

  constructor(message: string, responseCode: number | null) {
    super(message);
    this.name = "EmailSendError";
    this.responseCode = responseCode;
  }
}

function trimTrailingSlash(value: string): string {
  return value.replace(/\/+$/, "");
}

function parseResendErrorBody(body: unknown, fallback: string): string {
  if (!body || typeof body !== "object") {
    return fallback;
  }
  const record = body as Record<string, unknown>;
  if (typeof record.message === "string" && record.message.trim()) {
    return record.message.trim();
  }
  if (record.error && typeof record.error === "object") {
    const error = record.error as Record<string, unknown>;
    if (typeof error.message === "string" && error.message.trim()) {
      return error.message.trim();
    }
  }
  return fallback;
}

export class EmailService {
  private readonly apiKey: string;
  private readonly fromEmail: string;
  private readonly fromAddress: string;
  private readonly apiBase: string;

  constructor(config: MonitorConfig) {
    this.apiKey = config.resendApiKey.trim();
    this.fromEmail = config.resendFromEmail.trim();
    this.fromAddress = this.fromEmail
      ? this.fromEmail.includes("<") && this.fromEmail.includes(">")
        ? this.fromEmail
        : `${DEFAULT_FROM_NAME} <${this.fromEmail}>`
      : "";
    this.apiBase = trimTrailingSlash(config.resendApiBase.trim() || "https://api.resend.com");
  }

  isConfigured(): boolean {
    return Boolean(this.apiKey && this.fromEmail);
  }

  async sendEmail(input: SendEmailInput): Promise<SendEmailResult> {
    if (!this.isConfigured()) {
      throw new EmailSendError("EMAIL_NOT_CONFIGURED", null);
    }

    const response = await fetch(`${this.apiBase}/emails`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${this.apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: this.fromAddress,
        to: input.to,
        subject: input.subject,
        text: input.text,
      }),
    });

    let parsedBody: unknown = null;
    try {
      parsedBody = await response.json();
    } catch {
      parsedBody = null;
    }

    if (!response.ok) {
      const message = parseResendErrorBody(parsedBody, `RESEND_REQUEST_FAILED_${response.status}`);
      throw new EmailSendError(message, response.status);
    }

    const providerMessageId =
      parsedBody && typeof parsedBody === "object" && typeof (parsedBody as Record<string, unknown>).id === "string"
        ? ((parsedBody as Record<string, unknown>).id as string)
        : null;

    return {
      providerMessageId,
      responseCode: response.status,
    };
  }
}
