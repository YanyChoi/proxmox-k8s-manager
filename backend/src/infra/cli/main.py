from infra.cli.server import Server
from infra.cli.k8s import K8s
from infra.cli.proxmox import Proxmox

class CLI(object):
    def __init__(self):
        self.server = Server()
        self.k8s = K8s()
        self.proxmox = Proxmox()