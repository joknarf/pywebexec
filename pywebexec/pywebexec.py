import sys
from flask import Flask, request, jsonify, render_template
from flask_httpauth import HTTPBasicAuth
import subprocess
import threading
import os
import json
import uuid
import argparse
import random
import string
from datetime import datetime
import shlex
from gunicorn.app.base import Application
from datetime import timezone, timedelta
import ipaddress
from socket import gethostname, gethostbyname_ex

app = Flask(__name__)
auth = HTTPBasicAuth()

# Directory to store the command status and output
COMMAND_STATUS_DIR = '.web_status'
CONFDIR = os.path.expanduser("~/")
if os.path.isdir(f"{CONFDIR}/.config"):
    CONFDIR += '/.config'
CONFDIR += "/.pywebexec"

if not os.path.exists(COMMAND_STATUS_DIR):
    os.makedirs(COMMAND_STATUS_DIR)

def generate_random_password(length=12):
    characters = string.ascii_letters + string.digits + string.punctuation
    return ''.join(random.choice(characters) for i in range(length))


def resolve_hostname(host):
    """try get fqdn from DNS"""
    try:
        return gethostbyname_ex(host)[0]
    except OSError:
        return host


def generate_selfsigned_cert(hostname, ip_addresses=None, key=None):
    """Generates self signed certificate for a hostname, and optional IP addresses.
    from: https://gist.github.com/bloodearnest/9017111a313777b9cce5
    """
    from cryptography import x509
    from cryptography.x509.oid import NameOID
    from cryptography.hazmat.primitives import hashes
    from cryptography.hazmat.backends import default_backend
    from cryptography.hazmat.primitives import serialization
    from cryptography.hazmat.primitives.asymmetric import rsa
    
    # Generate our key
    if key is None:
        key = rsa.generate_private_key(
            public_exponent=65537,
            key_size=2048,
            backend=default_backend(),
        )
    
    name = x509.Name([
        x509.NameAttribute(NameOID.COMMON_NAME, hostname)
    ])
 
    # best practice seem to be to include the hostname in the SAN, which *SHOULD* mean COMMON_NAME is ignored.    
    alt_names = [x509.DNSName(hostname)]
    alt_names.append(x509.DNSName("localhost"))
    
    # allow addressing by IP, for when you don't have real DNS (common in most testing scenarios 
    if ip_addresses:
        for addr in ip_addresses:
            # openssl wants DNSnames for ips...
            alt_names.append(x509.DNSName(addr))
            # ... whereas golang's crypto/tls is stricter, and needs IPAddresses
            # note: older versions of cryptography do not understand ip_address objects
            alt_names.append(x509.IPAddress(ipaddress.ip_address(addr)))
    san = x509.SubjectAlternativeName(alt_names)
    
    # path_len=0 means this cert can only sign itself, not other certs.
    basic_contraints = x509.BasicConstraints(ca=True, path_length=0)
    now = datetime.now(timezone.utc)
    cert = (
        x509.CertificateBuilder()
        .subject_name(name)
        .issuer_name(name)
        .public_key(key.public_key())
        .serial_number(1000)
        .not_valid_before(now)
        .not_valid_after(now + timedelta(days=10*365))
        .add_extension(basic_contraints, False)
        .add_extension(san, False)
        .sign(key, hashes.SHA256(), default_backend())
    )
    cert_pem = cert.public_bytes(encoding=serialization.Encoding.PEM)
    key_pem = key.private_bytes(
        encoding=serialization.Encoding.PEM,
        format=serialization.PrivateFormat.TraditionalOpenSSL,
        encryption_algorithm=serialization.NoEncryption(),
    )

    return cert_pem, key_pem



class StandaloneApplication(Application):

    def __init__(self, app, options=None):
        self.options = options or {}
        self.application = app
        super().__init__()

    def load_config(self):
        config = {
            key: value for key, value in self.options.items()
            if key in self.cfg.settings and value is not None
        }
        for key, value in config.items():
            self.cfg.set(key.lower(), value)

    def load(self):
        return self.application


def start_gunicorn(daemon=False, baselog=None):
    if daemon:
        errorlog = f"{baselog}.log"
        accesslog = None # f"{baselog}.access.log"
        pidfile = f"{baselog}.pid"
    else:
        errorlog = "-"
        accesslog = "-"
        pidfile = None
    options = {
        'bind': '%s:%s' % (args.listen, args.port),
        'workers': 4,
        'timeout': 600,
        'certfile': args.cert,
        'keyfile': args.key,
        'daemon': daemon,
        'errorlog': errorlog,
        'accesslog': accesslog,
        'pidfile': pidfile,
    }
    StandaloneApplication(app, options=options).run()

def daemon_d(action, pidfilepath, hostname=None, args=None):
    """start/stop daemon"""
    import signal
    import daemon, daemon.pidfile

    pidfile = daemon.pidfile.TimeoutPIDLockFile(pidfilepath+".pid", acquire_timeout=30)
    if action == "stop":
        if pidfile.is_locked():
            pid = pidfile.read_pid()
            print(f"Stopping server pid {pid}")
            try:
                os.kill(pid, signal.SIGINT)
            except:
                return False
            return True
    elif action == "status":
        status = pidfile.is_locked()
        if status:
            print(f"pywebexec running pid {pidfile.read_pid()}")
            return True
        print("pywebexec not running")
        return False
    elif action == "start":
        print(f"Starting server")
        log = open(pidfilepath + ".log", "ab+")
        daemon_context = daemon.DaemonContext(
            stderr=log,
            pidfile=pidfile,
            umask=0o077,
            working_directory=os.getcwd(),
        )
        with daemon_context:
            try:
                start_gunicorn()
            except Exception as e:
                print(e)

def parseargs():
    global app, args
    parser = argparse.ArgumentParser(description='Run the command execution server.')
    parser.add_argument('--user', help='Username for basic auth')
    parser.add_argument('--password', help='Password for basic auth')
    parser.add_argument(
        "-l", "--listen", type=str, default="0.0.0.0", help="HTTP server listen address"
    )
    parser.add_argument(
        "-p", "--port", type=int, default=8080, help="HTTP server listen port"
    )
    parser.add_argument(
        "-d", "--dir", type=str, default=os.getcwd(), help="Serve target directory"
    )
    parser.add_argument(
        "-t",
        "--title",
        type=str,
        default="pywebexec",
        help="Web html title",
    )
    parser.add_argument("-c", "--cert", type=str, help="Path to https certificate")
    parser.add_argument("-k", "--key", type=str, help="Path to https certificate key")
    parser.add_argument("-g", "--gencert", action="store_true", help="https server self signed cert")
    parser.add_argument("action", nargs="?", help="daemon action start/stop/restart/status", choices=["start","stop","restart","status"])

    args = parser.parse_args()
    if os.path.isdir(args.dir):
        try:
            os.chdir(args.dir)
        except OSError:
            print(f"Error: cannot chdir {args.dir}", file=sys.stderr)
            sys.exit(1)
    else:
        print(f"Error: {args.dir} not found", file=sys.stderr)
        sys.exit(1)

    if args.gencert:
        hostname = resolve_hostname(gethostname())
        args.cert = args.cert or f"{CONFDIR}/pywebexec.crt"
        args.key = args.key or f"{CONFDIR}/pywebexec.key"
        if not os.path.exists(args.cert):
            (cert, key) = generate_selfsigned_cert(hostname)
            with open(args.cert, "wb") as fd:
                fd.write(cert)
            with open(args.key, "wb") as fd:
                fd.write(key)

    if args.user:
        app.config['USER'] = args.user
        if args.password:
            app.config['PASSWORD'] = args.password
        else:
            app.config['PASSWORD'] = generate_random_password()
            print(f'Generated password for user {args.user}: {app.config["PASSWORD"]}')
    else:
        app.config['USER'] = None
        app.config['PASSWORD'] = None
    return args

parseargs()

def get_status_file_path(command_id):
    return os.path.join(COMMAND_STATUS_DIR, f'{command_id}.json')

def get_output_file_path(command_id):
    return os.path.join(COMMAND_STATUS_DIR, f'{command_id}_output.txt')

def update_command_status(command_id, status, command=None, params=None, start_time=None, end_time=None, exit_code=None, pid=None):
    status_file_path = get_status_file_path(command_id)
    status_data = read_command_status(command_id) or {}
    status_data['status'] = status
    if command is not None:
        status_data['command'] = command
    if params is not None:
        status_data['params'] = params
    if start_time is not None:
        status_data['start_time'] = start_time
    if end_time is not None:
        status_data['end_time'] = end_time
    if exit_code is not None:
        status_data['exit_code'] = exit_code
    if pid is not None:
        status_data['pid'] = pid
    with open(status_file_path, 'w') as f:
        json.dump(status_data, f)

def read_command_status(command_id):
    status_file_path = get_status_file_path(command_id)
    if not os.path.exists(status_file_path):
        return None
    with open(status_file_path, 'r') as f:
        return json.load(f)

# Dictionary to store the process objects
processes = {}

def run_command(command, params, command_id):
    start_time = datetime.now().isoformat()
    update_command_status(command_id, 'running', command=command, params=params, start_time=start_time)
    try:
        output_file_path = get_output_file_path(command_id)
        with open(output_file_path, 'w') as output_file:
            # Run the command with parameters and redirect stdout and stderr to the file
            process = subprocess.Popen([command] + params, stdout=output_file, stderr=output_file, bufsize=0) #text=True)
            update_command_status(command_id, 'running', pid=process.pid)
            processes[command_id] = process
            process.wait()
            processes.pop(command_id, None)

        end_time = datetime.now().isoformat()
        # Update the status based on the result
        if process.returncode == 0:
            update_command_status(command_id, 'success', end_time=end_time, exit_code=process.returncode)
        elif process.returncode == -15:
            update_command_status(command_id, 'aborted', end_time=end_time, exit_code=process.returncode)
        else:
            update_command_status(command_id, 'failed', end_time=end_time, exit_code=process.returncode)
    except Exception as e:
        end_time = datetime.now().isoformat()
        update_command_status(command_id, 'failed', end_time=end_time, exit_code=1)
        with open(get_output_file_path(command_id), 'a') as output_file:
            output_file.write(str(e))

def auth_required(f):
    if app.config.get('USER'):
        return auth.login_required(f)
    return f

@app.route('/run_command', methods=['POST'])
@auth_required
def run_command_endpoint():
    data = request.json
    command = data.get('command')
    params = data.get('params', [])

    if not command:
        return jsonify({'error': 'command is required'}), 400

    # Ensure the command is an executable in the current directory
    command_path = os.path.join(".", os.path.basename(command))
    if not os.path.isfile(command_path) or not os.access(command_path, os.X_OK):
        return jsonify({'error': 'command must be an executable in the current directory'}), 400

    # Split params using shell-like syntax
    try:
        params = shlex.split(' '.join(params))
    except ValueError as e:
        return jsonify({'error': str(e)}), 400

    # Generate a unique command_id
    command_id = str(uuid.uuid4())

    # Set the initial status to running and save command details
    update_command_status(command_id, 'running', command, params)

    # Run the command in a separate thread
    thread = threading.Thread(target=run_command, args=(command_path, params, command_id))
    thread.start()

    return jsonify({'message': 'Command is running', 'command_id': command_id})

@app.route('/stop_command/<command_id>', methods=['POST'])
@auth_required
def stop_command(command_id):
    status = read_command_status(command_id)
    if not status or 'pid' not in status:
        return jsonify({'error': 'Invalid command_id or command not running'}), 400

    pid = status['pid']
    end_time = datetime.now().isoformat()
    try:
        os.kill(pid, 15)  # Send SIGTERM
        update_command_status(command_id, 'aborted', end_time=end_time, exit_code=-15)
        return jsonify({'message': 'Command aborted'})
    except Exception as e:
        status_data = read_command_status(command_id) or {}
        status_data['status'] = 'failed'
        status_data['end_time'] = end_time
        status_data['exit_code'] = 1
        with open(get_status_file_path(command_id), 'w') as f:
            json.dump(status_data, f)
        with open(get_output_file_path(command_id), 'a') as output_file:
            output_file.write(str(e))
        return jsonify({'error': 'Failed to terminate command'}), 500

@app.route('/command_status/<command_id>', methods=['GET'])
@auth_required
def get_command_status(command_id):
    status = read_command_status(command_id)
    if not status:
        return jsonify({'error': 'Invalid command_id'}), 404

    # output_file_path = get_output_file_path(command_id)
    # if os.path.exists(output_file_path):
    #     with open(output_file_path, 'r') as output_file:
    #         output = output_file.read()
    #     status['output'] = output

    return jsonify(status)

@app.route('/')
@auth_required
def index():
    return render_template('index.html', title=args.title)

@app.route('/commands', methods=['GET'])
@auth_required
def list_commands():
    commands = []
    for filename in os.listdir(COMMAND_STATUS_DIR):
        if filename.endswith('.json'):
            command_id = filename[:-5]
            status = read_command_status(command_id)
            if status:
                try:
                    params = shlex.join(status['params'])
                except AttributeError:
                    params = " ".join([shlex.quote(p) if " " in p else p for p in status['params']])
                command = status['command'] + ' ' + params
                commands.append({
                    'command_id': command_id,
                    'status': status['status'],
                    'start_time': status.get('start_time', 'N/A'),
                    'end_time': status.get('end_time', 'N/A'),
                    'command': command,
                    'exit_code': status.get('exit_code', 'N/A')
                })
    # Sort commands by start_time in descending order
    commands.sort(key=lambda x: x['start_time'], reverse=True)
    return jsonify(commands)

@app.route('/command_output/<command_id>', methods=['GET'])
@auth_required
def get_command_output(command_id):
    output_file_path = get_output_file_path(command_id)
    if os.path.exists(output_file_path):
        with open(output_file_path, 'r') as output_file:
            output = output_file.read()
        status_data = read_command_status(command_id) or {}
        return jsonify({'output': output, 'status': status_data.get("status")})
    return jsonify({'error': 'Invalid command_id'}), 404

@app.route('/executables', methods=['GET'])
@auth_required
def list_executables():
    executables = [f for f in os.listdir('.') if os.path.isfile(f) and os.access(f, os.X_OK)]
    return jsonify(executables)

@auth.verify_password
def verify_password(username, password):
    return username == app.config['USER'] and password == app.config['PASSWORD']

def main():
    basef = f"{CONFDIR}/pywebexec_{args.listen}:{args.port}"
    if not os.path.exists(CONFDIR):
        os.mkdir(CONFDIR, mode=0o700)
    if args.action == "start":
        return start_gunicorn(daemon=True, baselog=basef)
    if args.action:
        return daemon_d(args.action, pidfilepath=basef)
    return start_gunicorn()

if __name__ == '__main__':
    main()
    # app.run(host='0.0.0.0', port=5000)