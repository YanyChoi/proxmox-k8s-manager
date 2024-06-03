class VMTemplateData():
    hostname: str
    id: str
    bridge: str
    password: str
    image_url: str
    storage_target: str

    def __init__(self, hostname: str, id: str, bridge: str, password: str, image_url: str):
        self.hostname = hostname
        self.id = id
        self.bridge = bridge
        self.password = password
        self.image_url = image_url
        self.storage_target = 'local-lvm'