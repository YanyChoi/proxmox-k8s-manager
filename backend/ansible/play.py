import ansible_runner

from config.config import Config
from ansible.generators.playbook import write_playbook
from ansible.generators.cloud_init import generate_cloud_init

def generate(config: Config):
    print("Generating...")
    count = 0
    for type in ["ROUTER", "VPN", "NFS", "LB", "MASTER_INIT", "MASTER_JOIN", "WORKER"]:
        if type != "MASTER_JOIN" and type != "WORKER":
            count += 1
            generate_cloud_init(type, count, config)
        if type == "MASTER_JOIN":
            for _ in range(1, config.master.nodes):
                count += 1
                generate_cloud_init(type, count, config)
        if type == "WORKER":
            for _ in range(1, config.worker.nodes):
                count += 1
                generate_cloud_init(type, count, config)
    

def play(playbook_path: str) -> None:
    print(f'Playing {playbook_path}...')
    r = ansible_runner.run(private_data_dir='.', playbook=playbook_path)
    for each_host_event in r.events:
        print(each_host_event['event'])
    print("Final status:")
    print(r.stats)