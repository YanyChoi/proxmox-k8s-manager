import { Client } from 'ssh2';
import { proxmoxConfig } from '../config/proxmox';

export interface SSHExecResult {
  stdout: string;
  stderr: string;
  code: number;
}

export class ProxmoxSSHClient {
  constructor(
    private host: string = proxmoxConfig.host,
    private port: number = proxmoxConfig.ssh.port,
    private username: string = proxmoxConfig.ssh.user,
    private privateKey: string = proxmoxConfig.ssh.privateKey
  ) {}

  async exec(command: string): Promise<SSHExecResult> {
    return new Promise((resolve, reject) => {
      const conn = new Client();

      conn
        .on('ready', () => {
          conn.exec(command, (err, stream) => {
            if (err) {
              conn.end();
              return reject(err);
            }

            let stdout = '';
            let stderr = '';

            stream
              .on('close', (code: number) => {
                conn.end();
                resolve({ stdout, stderr, code });
              })
              .on('data', (data: Buffer) => {
                stdout += data.toString();
              })
              .stderr.on('data', (data: Buffer) => {
                stderr += data.toString();
              });
          });
        })
        .on('error', (err) => {
          reject(err);
        })
        .connect({
          host: this.host,
          port: this.port,
          username: this.username,
          privateKey: this.privateKey,
        });
    });
  }

  async downloadCloudImage(url: string, destPath: string): Promise<string> {
    const filename = url.split('/').pop() || 'cloud-image.img';
    const fullPath = `${destPath}/${filename}`;

    // Remove existing file if it exists, then download
    const command = `rm -f "${fullPath}" && wget -q -O "${fullPath}" "${url}" && echo "${fullPath}"`;

    console.log(`Downloading cloud image via SSH: ${url}`);
    const result = await this.exec(command);

    if (result.code !== 0) {
      throw new Error(`Failed to download cloud image: ${result.stderr}`);
    }

    console.log(`Cloud image downloaded to: ${fullPath}`);
    return fullPath;
  }

  async getStoragePath(storage: string): Promise<string> {
    // Get the storage configuration to find the path
    const command = `pvesm status --storage ${storage} -o jsonraw 2>/dev/null || cat /etc/pve/storage.cfg | grep -A 10 "^dir: ${storage}" | grep path | awk '{print $2}'`;
    const result = await this.exec(command);

    if (result.code !== 0 || !result.stdout.trim()) {
      // Default paths for common storages
      if (storage === 'local') {
        return '/var/lib/vz';
      }
      throw new Error(`Failed to get storage path for ${storage}: ${result.stderr}`);
    }

    // Try to parse JSON first (pvesm status output)
    try {
      const data = JSON.parse(result.stdout);
      if (data.path) return data.path;
    } catch {
      // Not JSON, use the grep output
    }

    return result.stdout.trim() || '/var/lib/vz';
  }

  async createVM(
    vmid: number,
    name: string,
    memory: number,
    cores: number,
    sockets: number
  ): Promise<void> {
    const command = `qm create ${vmid} --name "${name}" --memory ${memory} --cores ${cores} --sockets ${sockets} --cpu host --net0 virtio,bridge=vmbr0 --scsihw virtio-scsi-pci`;
    console.log(`Creating VM via SSH: ${command}`);
    const result = await this.exec(command);
    if (result.code !== 0) {
      throw new Error(`Failed to create VM: ${result.stderr}`);
    }
  }

  async importDisk(
    vmid: number,
    storage: string,
    imagePath: string
  ): Promise<void> {
    const command = `qm set ${vmid} --scsi0 ${storage}:0,import-from=${imagePath}`;
    console.log(`Importing disk via SSH: ${command}`);
    const result = await this.exec(command);
    if (result.code !== 0) {
      throw new Error(`Failed to import disk: ${result.stderr}`);
    }
  }

  async configureVM(
    vmid: number,
    options: {
      ide2?: string;
      boot?: string;
      serial0?: string;
      vga?: string;
      ciuser?: string;
      cipassword?: string;
      sshkeys?: string;
      cicustom?: string;
      ipconfig0?: string;
    }
  ): Promise<void> {
    const args: string[] = [];
    if (options.ide2) args.push(`--ide2 ${options.ide2}`);
    if (options.boot) args.push(`--boot ${options.boot}`);
    if (options.serial0) args.push(`--serial0 ${options.serial0}`);
    if (options.vga) args.push(`--vga ${options.vga}`);
    if (options.ciuser) args.push(`--ciuser ${options.ciuser}`);
    if (options.cipassword) args.push(`--cipassword ${options.cipassword}`);
    if (options.cicustom) args.push(`--cicustom ${options.cicustom}`);
    if (options.ipconfig0) args.push(`--ipconfig0 ${options.ipconfig0}`);

    // Handle SSH keys - write to temp file since --sshkeys expects a file path
    let sshKeyTempFile: string | null = null;
    if (options.sshkeys) {
      sshKeyTempFile = `/tmp/sshkeys-${vmid}.pub`;
      const writeKeyResult = await this.exec(`echo '${options.sshkeys}' > ${sshKeyTempFile}`);
      if (writeKeyResult.code !== 0) {
        throw new Error(`Failed to write SSH key temp file: ${writeKeyResult.stderr}`);
      }
      args.push(`--sshkeys ${sshKeyTempFile}`);
    }

    if (args.length === 0) return;

    const command = `qm set ${vmid} ${args.join(' ')}`;
    console.log(`Configuring VM via SSH: ${command}`);
    const result = await this.exec(command);

    // Clean up temp file
    if (sshKeyTempFile) {
      await this.exec(`rm -f ${sshKeyTempFile}`);
    }

    if (result.code !== 0) {
      throw new Error(`Failed to configure VM: ${result.stderr}`);
    }
  }

  async resizeDisk(vmid: number, disk: string, size: string): Promise<void> {
    const command = `qm resize ${vmid} ${disk} ${size}`;
    console.log(`Resizing disk via SSH: ${command}`);
    const result = await this.exec(command);
    if (result.code !== 0) {
      throw new Error(`Failed to resize disk: ${result.stderr}`);
    }
  }

  async convertToTemplate(vmid: number): Promise<void> {
    const command = `qm template ${vmid}`;
    console.log(`Converting to template via SSH: ${command}`);
    const result = await this.exec(command);
    if (result.code !== 0) {
      throw new Error(`Failed to convert to template: ${result.stderr}`);
    }
  }

  async writeSnippet(
    storage: string,
    filename: string,
    content: string
  ): Promise<string> {
    const storagePath = await this.getStoragePath(storage);
    const snippetsDir = `${storagePath}/snippets`;
    const fullPath = `${snippetsDir}/${filename}`;

    // Ensure snippets directory exists
    await this.exec(`mkdir -p ${snippetsDir}`);

    // Write content to file using heredoc to handle multiline content
    const escapedContent = content.replace(/'/g, "'\\''");
    const command = `cat > '${fullPath}' << 'SNIPPET_EOF'\n${content}\nSNIPPET_EOF`;

    console.log(`Writing snippet via SSH: ${fullPath}`);
    const result = await this.exec(command);
    if (result.code !== 0) {
      throw new Error(`Failed to write snippet: ${result.stderr}`);
    }

    return fullPath;
  }
}

export const createProxmoxSSHClient = (): ProxmoxSSHClient => {
  return new ProxmoxSSHClient();
};
