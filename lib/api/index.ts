export { ProxmoxAPIClient, createProxmoxClient } from './proxmox-client';
export { VMTemplateManager, createVMTemplateManager } from './vm-template';
export { ProxmoxSSHClient, createProxmoxSSHClient } from './ssh-client';
export { KubernetesClusterManager, createKubernetesClusterManager } from './k8s-cluster';
export { RouterManager, createRouterManager } from './router';
export { installTailscaleOperator } from './tailscale-operator';
export type { TemplateOptions } from './vm-template';
export type {
  ClusterOptions,
  ClusterNode,
  ClusterStatus,
  RouterProvisionOptions,
  OperatorProvisionOptions,
} from './k8s-cluster';
export type { RouterOptions, RouterResult } from './router';
export type { OperatorOptions, OperatorResult } from './tailscale-operator';
