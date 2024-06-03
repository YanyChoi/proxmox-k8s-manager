import subprocess
from pathlib import Path
class Server(object):
    """asdf"""
    def start(self):
        subprocess.run([f'{Path(__file__).parent.parent.parent.parent}/scripts/start.sh'])
    def stop(self):

        print('Stopping server.')
    def status(self):
        print('Status of server.')