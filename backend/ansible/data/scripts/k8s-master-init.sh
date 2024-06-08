#!/bin/bash

echo "[TASK 0] Set SSHD Configuration"
sudo rm /etc/ssh/sshd_config.d/*
sudo service sshd restart

echo "[TASK 1] Update APT Sources"
sudo sed -i 's|security.ubuntu.com|mirror.kakao.com|g; s|archive.ubuntu.com|mirror.kakao.com|g' /etc/apt/sources.list
sudo apt-get update -y

echo "[TASK 2] Install NFS Client"
sudo apt-get install -y nfs-common

echo "[TASK 3] Install Docker"
echo -L https://get.docker.com | sh -

echo "[TASK 4] Update Containerd Configuration"
containerd config default | sudo tee /etc/containerd/config.toml >/dev/null 2>&1
sudo sed -i 's/SystemdCgroup \= false/SystemdCgroup \= true/g' /etc/containerd/config.toml
sudo tee /etc/modules-load.d/containerd.conf <<EOF
overlay
br_netfilter
EOF
sudo modprobe overlay
sudo modprobe br_netfilter

echo "[TASK 5] Install Kubeadm"
sudo apt-get update
sudo apt-get install -y apt-transport-https ca-certificates curl gpg

curl -fsSL https://pkgs.k8s.io/core:/stable:/v1.30/deb/Release.key | sudo gpg --dearmor -o /etc/apt/keyrings/kubernetes-apt-keyring.gpg
echo 'deb [signed-by=/etc/apt/keyrings/kubernetes-apt-keyring.gpg] https://pkgs.k8s.io/core:/stable:/v1.30/deb/ /' | sudo tee /etc/apt/sources.list.d/kubernetes.list
sudo apt-get update
sudo apt-get install -y kubelet kubeadm kubectl
sudo apt-mark hold kubelet kubeadm kubectl

echo "[TASK 6] Initialize Kubernetes Cluster"

cat << EOF > /tmp/kubeadm-config.yaml
apiVersion: kubeadm.k8s.io/v1beta3
kind: ClusterConfiguration
kubernetesVersion: v1.30.1
controlPlaneEndpoint: $K8S_API:6443
networking:
  dnsDomain: cluster.local
  podSubnet: $POD_CIDR
  serviceSubnet: $SERVICE_CIDR
etcd:
  local:
    dataDir: /var/lib/etcd
dns:
  type: CoreDNS
scheduler: {}
---
apiVersion: kubeadm.k8s.io/v1beta3
kind: InitConfiguration
localAPIEndpoint:
  advertiseAddress:
  bindPort: 0
nodeRegistration:
  name: $$(hostname -s)
skipPhases:
  - addon/kube-proxy
EOF

sudo kubeadm init --config /tmp/kubeadm-config.yaml

echo "[TASK 7] Install Helm & Cilium"
curl -L https://raw.githubusercontent.com/helm/helm/main/scripts/get-helm-3 | bash
helm repo add cilium https://helm.cilium.io/
helm install cilium cilium/cilium --version 1.15.5 \
    --namespace kube-system \
    --set kubeProxyReplacement=true

echo "[TASK 8] Copy Kube Config to User Directory & Ansible Host"
export HOME=/root
mkdir -p $$HOME/.kube
sudo cp -i /etc/kubernetes/admin.conf $$HOME/.kube/config
sudo chown $$(id -u):$$(id -g) $$HOME/.kube/config

echo "[TASK 8] Expose Kubernetes Certificates"
mkdir /root/certs
CAHASH=$$(openssl x509 -pubkey -in /etc/kubernetes/pki/ca.crt | openssl rsa -pubin -outform der 2>/dev/null | openssl dgst -sha256 -hex | sed 's/^.* //')
TOKEN=$$(kubeadm token list | awk '/authentication/{print $1}')
echo "$${K8S_API} $${CAHASH} $${TOKEN}" > /tmp/certs/k8s

cp /etc/kubernetes/admin.conf /tmp/certs
cp /etc/kubernetes/pki/etcd/ca.crt /tmp/certs
cp /etc/kubernetes/pki/etcd/ca.key /tmp/certs
cp /etc/kubernetes/pki/ca.crt /tmp/certs
cp /etc/kubernetes/pki/ca.key /tmp/certs
cp /etc/kubernetes/pki/front-proxy-ca.crt /tmp/certs
cp /etc/kubernetes/pki/front-proxy-ca.key /tmp/certs
cp /etc/kubernetes/pki/sa.key /tmp/certs
cp /etc/kubernetes/pki/sa.pub /tmp/certs
nohup python3 -m http.server 20080 --directory /tmp/certs &
