import { env } from './config/env';

const GCP_METADATA_URL =
  'http://metadata.google.internal/computeMetadata/v1/instance/network-interfaces/0/access-configs/0/external-ip';

// On GCP, os.networkInterfaces() only exposes the VM's internal IP, so the
// external IP has to come from the instance metadata server. SERVER_PUBLIC_IP
// overrides this for local development, where the metadata server doesn't exist.
export async function getServerPublicIp(): Promise<string> {
  if (env.serverPublicIp !== undefined && env.serverPublicIp !== '') {
    return env.serverPublicIp;
  }

  try {
    const response = await fetch(GCP_METADATA_URL, {
      headers: { 'Metadata-Flavor': 'Google' },
      signal: AbortSignal.timeout(2_000),
    });

    if (!response.ok) {
      return 'unknown';
    }

    return (await response.text()).trim();
  } catch {
    return 'unknown';
  }
}
