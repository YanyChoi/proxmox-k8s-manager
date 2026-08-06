#!/usr/bin/env bash
#
# Run this after EVERY Kubespray run (cluster.yml, scale.yml, or a --tags
# network re-run). Kubespray resets /opt/cni/bin to kube:root, and Cilium
# cannot write there.
#
# Cilium >= 1.19 runs its mount-cgroup init container as root but with
# `drop: ALL`, which removes CAP_DAC_OVERRIDE -- so root is subject to normal
# permission checks. /opt/cni/bin owned by kube:root mode 755 is therefore
# unwritable, and the container dies with:
#
#   cp: cannot create regular file '/hostbin/cilium-mount': Permission denied
#
# The pods land in Init:CrashLoopBackOff, every node goes NotReady, and
# coredns sits Pending. Kubespray exposes no variable for this, hence a script.
#
#   ./scripts/fix-cni-bin-ownership.sh                       # default node list
#   NODES="10.100.1.11 10.100.2.11" ./scripts/fix-cni-bin-ownership.sh
set -euo pipefail

NODES="${NODES:-10.100.1.11 10.100.1.12 10.100.1.13 10.100.2.11 10.100.2.12 10.100.2.13}"
SSH_USER="${SSH_USER:-ubuntu}"

for node in $NODES; do
    printf '%-16s ' "$node"
    if ssh -o BatchMode=yes -o StrictHostKeyChecking=no -o ConnectTimeout=10 \
           "${SSH_USER}@${node}" 'sudo chown root:root /opt/cni/bin' 2>/dev/null; then
        echo "ok"
    else
        echo "FAILED"
    fi
done

echo
echo "Now restart the Cilium agents so they retry the init container:"
echo "  kubectl -n kube-system delete pod -l k8s-app=cilium"
echo "  kubectl -n kube-system rollout status ds/cilium"
