import ansible_runner

def play(self, playbook_path: str) -> None:
    print(f'Playing {playbook_path}...')
    r = ansible_runner.run(private_data_dir='.', playbook=playbook_path)
    for each_host_event in r.events:
        print(each_host_event['event'])
    print("Final status:")
    print(r.stats)
