import { Socket } from 'net';

/**
 * Polls a TCP port until it accepts a connection or the timeout elapses.
 * Shared by node and router provisioning to decide a freshly booted VM is
 * reachable before handing off to Ansible / verifying the router.
 */
export async function waitForPort(
  host: string,
  port: number,
  timeoutMs: number
): Promise<boolean> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const open = await new Promise<boolean>((resolve) => {
      const socket = new Socket();
      const done = (result: boolean) => {
        socket.destroy();
        resolve(result);
      };
      socket.setTimeout(3000);
      socket.once('connect', () => done(true));
      socket.once('timeout', () => done(false));
      socket.once('error', () => done(false));
      socket.connect(port, host);
    });
    if (open) return true;
    await new Promise((resolve) => setTimeout(resolve, 5000));
  }
  return false;
}
