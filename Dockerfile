# syntax=docker/dockerfile:1
#
# The app and Ansible must share an image: runKubespray() spawns
# `ansible-playbook` as a local subprocess rather than talking to a remote
# runner, so Kubespray has to be on the same filesystem as the Next.js server.
#
# Build on an amd64 host (the Proxmox mgmt VM), not on an arm64 Mac.

############################  build  ############################
FROM node:22-bookworm-slim AS build

WORKDIR /app
RUN npm install -g pnpm@11.20.0

COPY package.json pnpm-lock.yaml ./
# --ignore-scripts: pnpm 11 fails hard on unapproved native build scripts
# (cpu-features, sharp, ssh2, unrs-resolver) and `pnpm approve-builds` is
# interactive. Skipping them is safe here: the app declares no lifecycle
# scripts of its own, nothing uses next/image so sharp is unused, and ssh2
# only loses the optional cpu-features accelerator and falls back to pure JS.
RUN pnpm install --frozen-lockfile --ignore-scripts

COPY . .
RUN pnpm build

###########################  runtime  ###########################
FROM node:22-bookworm-slim AS runtime

# openssh-client: Ansible shells out to ssh, and retrieveKubeconfig() spawns it
#                 directly to fetch /etc/kubernetes/admin.conf
# git:            used to clone Kubespray below
RUN apt-get update \
 && apt-get install -y --no-install-recommends \
      ca-certificates git openssh-client sshpass \
 && rm -rf /var/lib/apt/lists/*

COPY --from=ghcr.io/astral-sh/uv:0.8.15 /uv /usr/local/bin/uv

# Runs scripts/create-cluster.ts, which drives the same code path as
# POST /api/clusters but as a foreground process -- the playbook outlives a
# comfortable HTTP request. Global install so it does not perturb the
# lockfile that the build stage installs with --frozen-lockfile.
RUN npm install -g tsx@4

ARG KUBESPRAY_VERSION=v2.31.0
RUN git clone --branch "${KUBESPRAY_VERSION}" --depth 1 \
      https://github.com/kubernetes-sigs/kubespray.git /opt/kubespray

# Ansible 11 (core 2.18) needs Python >= 3.11; bookworm ships 3.11, but pin
# 3.12 via uv so the container matches what the mgmt VM was verified against.
# The venv path is not arbitrary: runKubespray() looks for
# ${KUBESPRAY_PATH}/venv/bin/ansible-playbook and silently falls back to a
# system ansible-playbook (which does not exist here) if it is missing.
RUN uv python install 3.12 \
 && uv venv --python 3.12 /opt/kubespray/venv \
 && uv pip install --python /opt/kubespray/venv/bin/python \
      -r /opt/kubespray/requirements.txt

WORKDIR /app
COPY --from=build /app/.next         ./.next
COPY --from=build /app/node_modules  ./node_modules
COPY --from=build /app/public        ./public
COPY --from=build /app/package.json  ./package.json
COPY --from=build /app/next.config.ts ./next.config.ts

# Read at runtime via process.cwd(), not bundled by next build -- this is the
# customised group_vars (cilium L2, pod/service CIDRs, apiserver LB).
COPY --from=build /app/lib/templates ./lib/templates
# Kept so scripts/create-cluster.ts can be run inside the container.
COPY --from=build /app/lib           ./lib
COPY --from=build /app/scripts       ./scripts
COPY --from=build /app/tsconfig.json ./tsconfig.json

ENV NODE_ENV=production \
    KUBESPRAY_PATH=/opt/kubespray \
    KUBESPRAY_INVENTORY_DIR=/data/inventories \
    ANSIBLE_HOST_KEY_CHECKING=False \
    PORT=3000

EXPOSE 3000
CMD ["node_modules/.bin/next", "start"]
