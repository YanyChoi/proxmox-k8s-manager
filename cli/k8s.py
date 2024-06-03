class K8s(object):
    def install(self):
        print('Installing k8s.')
    def get_token(self):
        print('Getting k8s token.')
    def status(self, cluster: str):
        print(f'Status of k8s cluster {cluster}.')