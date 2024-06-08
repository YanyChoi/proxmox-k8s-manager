#!/bin/bash

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

echo "[TASK 6] Download Certificates from Master"
count=0
while true ; do
    if curl -s "$K8S_API:$DEFAULT_PORT/k8s" ; then
        DATA=$(curl -s "$K8S_API:$DEFAULT_PORT/k8s")
        K8S_API=$(echo "$DATA" | cut -d' ' -f1)
        CAHASH=$(echo "$DATA" | cut -d' ' -f2)
        TOKEN=$(echo "$DATA" | cut -d' ' -f3)

        break
    fi

    count=$((count+1))

    if [[ ${count} == "3600" ]]; then
        break
    fi

    sleep 1
done

if [ -z "$K8S_API" ] || [ -z "$CAHASH" ] || [ -z "$TOKEN" ] ; then
    echo "Some value is empty. k8s_api : $K8S_API, cahash : $CAHASH, token :$TOKEN, Quit..."
    exit 0
fi

mkdir -p /etc/kubernetes/pki/etcd/
curl -o /etc/kubernetes/pki/etcd/ca.crt "$K8S_API:$DEFAULT_PORT/etcd-ca.crt"
curl -o /etc/kubernetes/pki/etcd/ca.key "$K8S_API:$DEFAULT_PORT/etcd-ca.key"
curl -o /etc/kubernetes/pki/ca.crt "$K8S_API:$DEFAULT_PORT/ca.crt"
curl -o /etc/kubernetes/pki/ca.key "$K8S_API:$DEFAULT_PORT/ca.key"
curl -o /etc/kubernetes/pki/front-proxy-ca.crt "$K8S_API:$DEFAULT_PORT/front-proxy-ca.crt"
curl -o /etc/kubernetes/pki/front-proxy-ca.key "$K8S_API:$DEFAULT_PORT/front-proxy-ca.key"
curl -o /etc/kubernetes/pki/sa.key "$K8S_API:$DEFAULT_PORT/sa.key"
curl -o /etc/kubernetes/pki/sa.pub "$K8S_API:$DEFAULT_PORT/sa.pub"


echo "[TASK 7] Initialize Kubernetes Cluster"

INTERNALIP=$(ip -f inet -o addr show eth0 | cut -d\  -f 7 | cut -d/ -f 1)
cat << EOF > /tmp/join-config.yaml
apiVersion: kubeadm.k8s.io/v1beta2
kind: JoinConfiguration
controlPlane:
  localAPIEndpoint:
    advertiseAddress: ""
    bindPort: 0
discovery:
  bootstrapToken:
    apiServerEndpoint: ${K8S_API}:6443
    caCertHashes:
    - sha256:${CAHASH}
    token: ${TOKEN}
    unsafeSkipCAVerification: false
nodeRegistration:
  name: $(hostname -s)
  kubeletExtraArgs:
    node-ip: "${INTERNALIP}"
EOF
kubeadm join --config /tmp/join-config.yaml