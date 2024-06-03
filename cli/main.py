from cli.server import Server
from cli.k8s import K8s
from cli.proxmox import Proxmox

class CLI(object):
    def __init__(self):
        self.server = Server()
        self.k8s = K8s()
        self.proxmox = Proxmox()


import fire

if __name__ == '__main__':
    fire.Fire(CLI)