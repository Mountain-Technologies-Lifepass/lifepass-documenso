import { Container, getContainer } from "@cloudflare/containers";

/**
 * Env keys forwarded from the Worker into the Documenso container process.
 * Secrets are Worker secrets; non-secrets can also come from wrangler `[vars]`.
 */
const DOCUMENSO_ENV_KEYS = [
  "PORT",
  "NEXTAUTH_SECRET",
  "NEXT_PRIVATE_ENCRYPTION_KEY",
  "NEXT_PRIVATE_ENCRYPTION_SECONDARY_KEY",
  "NEXT_PUBLIC_WEBAPP_URL",
  "NEXT_PRIVATE_INTERNAL_WEBAPP_URL",
  "NEXT_PRIVATE_DATABASE_URL",
  "NEXT_PRIVATE_DIRECT_DATABASE_URL",
  "NEXT_PUBLIC_UPLOAD_TRANSPORT",
  "NEXT_PRIVATE_SMTP_TRANSPORT",
  "NEXT_PRIVATE_SMTP_HOST",
  "NEXT_PRIVATE_SMTP_PORT",
  "NEXT_PRIVATE_SMTP_USERNAME",
  "NEXT_PRIVATE_SMTP_PASSWORD",
  "NEXT_PRIVATE_SMTP_FROM_NAME",
  "NEXT_PRIVATE_SMTP_FROM_ADDRESS",
  "NEXT_PRIVATE_SIGNING_TRANSPORT",
  "NEXT_PRIVATE_SIGNING_PASSPHRASE",
  "NEXT_PRIVATE_SIGNING_LOCAL_FILE_CONTENTS",
  "NEXT_PUBLIC_DISABLE_SIGNUP",
] as const;

type DocumensoEnvKey = (typeof DOCUMENSO_ENV_KEYS)[number];

type WorkerEnv = {
  DOCUMENSO: DurableObjectNamespace<DocumensoContainer>;
  /** Token gating the /__ops/restart route (Worker secret). */
  OPS_RESTART_TOKEN?: string;
} & Partial<Record<DocumensoEnvKey, string>>;

/**
 * Builds the env map Documenso expects, skipping undefined values.
 */
function buildDocumensoEnvVars(workerEnv: WorkerEnv): Record<string, string> {
  const envVars: Record<string, string> = {};

  for (const key of DOCUMENSO_ENV_KEYS) {
    const value = workerEnv[key];
    if (typeof value === "string" && value.length > 0) {
      envVars[key] = value;
    }
  }

  return envVars;
}

/**
 * Durable Object that owns a single Documenso container instance.
 * One shared instance keeps signing state warm and avoids multi-writer races.
 */
export class DocumensoContainer extends Container {
  defaultPort = 3000;
  /** Keep short signing sessions warm without pinning the database online. */
  sleepAfter = "15m";
  enableInternet = true;

  /**
   * Ensures the container is up with Worker secrets injected before proxying.
   * Documenso cold-starts slowly (migrations + Remix server).
   */
  override async fetch(request: Request): Promise<Response> {
    const envVars = buildDocumensoEnvVars(this.env as WorkerEnv);
    const missing = DOCUMENSO_ENV_KEYS.filter((key) => {
      if (
        key === "NEXT_PUBLIC_DISABLE_SIGNUP" ||
        key === "NEXT_PUBLIC_UPLOAD_TRANSPORT"
      ) {
        return false;
      }
      return !envVars[key];
    });

    if (missing.length > 0) {
      return new Response(
        `Documenso container misconfigured. Missing env: ${missing.join(", ")}`,
        { status: 500 },
      );
    }

    await this.startAndWaitForPorts({
      ports: [3000],
      startOptions: {
        envVars,
        enableInternet: true,
      },
      cancellationOptions: {
        // First boot runs DB migrations against Neon.
        portReadyTimeoutMS: 180_000,
        instanceGetTimeoutMS: 60_000,
      },
    });

    return super.fetch(request);
  }
}

/**
 * Routes all HTTP traffic to the shared Documenso container.
 */
export default {
  async fetch(request: Request, workerEnv: WorkerEnv): Promise<Response> {
    const container = getContainer(workerEnv.DOCUMENSO, "primary");

    // Ops-only: force the container to restart so it picks up new Worker
    // secrets, which are injected when the container starts.
    const url = new URL(request.url);
    if (url.pathname === "/__ops/restart") {
      const token = request.headers.get("x-ops-restart-token");
      if (!workerEnv.OPS_RESTART_TOKEN || token !== workerEnv.OPS_RESTART_TOKEN) {
        return new Response("Not found", { status: 404 });
      }
      await container.destroy();
      return new Response("Container destroyed; next request boots fresh.\n");
    }

    return container.fetch(request);
  },
};
