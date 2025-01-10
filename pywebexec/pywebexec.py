import sys
from flask import Flask, request, jsonify, render_template, session, redirect, url_for
from flask_httpauth import HTTPBasicAuth
import subprocess
import threading
import os
import json
import uuid
import argparse
import random
import string
from datetime import datetime, timezone, timedelta
import shlex
from gunicorn.app.base import Application
import ipaddress
from socket import gethostname, gethostbyname_ex
import ssl

if os.environ.get('PYWEBEXEC_LDAP_SERVER'):
    try:
        from ldap3 import Server, Connection, ALL, SIMPLE, SUBTREE, Tls
    except:
        print("Need to install ldap3: pip install ldap3", file=sys.stderr)
        sys.exit(1)

app = Flask(__name__)
app.secret_key = os.urandom(24)  # Secret key for session management
app.config['SESSION_COOKIE_SAMESITE'] = 'Lax'  # Add SameSite attribute to session cookies
auth = HTTPBasicAuth()

app.config['LDAP_SERVER'] = os.environ.get('PYWEBEXEC_LDAP_SERVER')
app.config['LDAP_USER_ID'] = os.environ.get('PYWEBEXEC_LDAP_USER_ID', "uid")
app.config['LDAP_GROUPS'] = os.environ.get('PYWEBEXEC_LDAP_GROUPS')
app.config['LDAP_BASE_DN'] = os.environ.get('PYWEBEXEC_LDAP_BASE_DN')
app.config['LDAP_BIND_DN'] = os.environ.get('PYWEBEXEC_LDAP_BIND_DN')
app.config['LDAP_BIND_PASSWORD'] = os.environ.get('PYWEBEXEC_LDAP_BIND_PASSWORD')
app.config['LDAP_USE_SSL'] = int(os.environ.get('PYWEBEXEC_LDAP_USE_SSL', False))

# Directory to store the command status and output
COMMAND_STATUS_DIR = '.web_status'
CONFDIR = os.path.expanduser("~/")
if os.path.isdir(f"{CONFDIR}/.config"):
    CONFDIR += '/.config'
CONFDIR += "/.pywebexec"

if not os.path.exists(COMMAND_STATUS_DIR):
    os.makedirs(COMMAND_STATUS_DIR)

# In-memory cache for command statuses
command_status_cache = {}

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


def decode_line(line: bytes) -> str:
    """try decode line exception on binary"""
    try:
        return line.decode()
    except UnicodeDecodeError:
        return ""


def last_line(fd, maxline=1000):
    """last non empty line of file"""
    line = "\n"
    fd.seek(0, os.SEEK_END)
    size = 0
    while line in ["\n", "\r"] and size < maxline:
        try:  # catch if file empty / only empty lines
            while fd.read(1) not in [b"\n", b"\r"]:
                fd.seek(-2, os.SEEK_CUR)
                size += 1
        except OSError:
            fd.seek(0)
            line = decode_line(fd.readline())
            break
        line = decode_line(fd.readline())
        fd.seek(-4, os.SEEK_CUR)
    return line.strip()


def get_last_non_empty_line_of_file(file_path):
    """Get the last non-empty line of a file."""
    with open(file_path, 'rb') as f:
        return last_line(f)
    

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
    parser.add_argument('-u', '--user', help='Username for basic auth')
    parser.add_argument('-P', '--password', help='Password for basic auth')
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
    if status != 'running':
        output_file_path = get_output_file_path(command_id)
        if os.path.exists(output_file_path):
            status_data['last_output_line'] = get_last_non_empty_line_of_file(output_file_path)
    with open(status_file_path, 'w') as f:
        json.dump(status_data, f)
    
    # Update cache if status is not "running"
    if status != 'running':
        command_status_cache[command_id] = status_data
    elif command_id in command_status_cache:
        del command_status_cache[command_id]

def read_command_status(command_id):
    # Return cached status if available
    if command_id in command_status_cache:
        return command_status_cache[command_id]
    
    status_file_path = get_status_file_path(command_id)
    if not os.path.exists(status_file_path):
        return None
    with open(status_file_path, 'r') as f:
        status_data = json.load(f)
    
    # Cache the status if it is not "running"
    if status_data['status'] != 'running':
        command_status_cache[command_id] = status_data
    
    return status_data

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

@app.before_request
def check_authentication():
    if 'username' not in session and request.endpoint not in ['login', 'static']:
        return auth.login_required(lambda: None)()

@auth.verify_password
def verify_password(username, password):
    if not username:
        return False
    if app.config['USER']:
        if username == app.config['USER'] and password == app.config['PASSWORD']:
            session['username'] = username
            return True
    elif app.config['LDAP_SERVER']:
        if verify_ldap(username, password):
            session['username'] = username
            return True
    return False

def verify_ldap(username, password):
    tls_configuration = Tls(validate=ssl.CERT_NONE, version=ssl.PROTOCOL_TLSv1_2) if app.config['LDAP_USE_SSL'] else None
    server = Server(app.config['LDAP_SERVER'], use_ssl=app.config['LDAP_USE_SSL'], tls=tls_configuration, get_info=ALL)
    user_filter = f"({app.config['LDAP_USER_ID']}={username})"
    try:
        # Bind with the bind DN and password
        conn = Connection(server, user=app.config['LDAP_BIND_DN'], password=app.config['LDAP_BIND_PASSWORD'], authentication=SIMPLE, auto_bind=True)
        try:
            conn.search(search_base=app.config['LDAP_BASE_DN'], search_filter=user_filter)
            if len(conn.entries) == 0:
                print(f"User {username} not found in LDAP.")
                return False
            user_dn = conn.entries[0].entry_dn
        finally:
            conn.unbind()
        
        # Bind with the user DN and password to verify credentials
        conn = Connection(server, user=user_dn, password=password, authentication=SIMPLE, auto_bind=True)
        try:
            if not app.config['LDAP_GROUPS'] and conn.result["result"] == 0:
                return True
            group_filter = "".join([f'(ou={group})' for group in app.config['LDAP_GROUPS'].split(",")])
            group_filter = f"(&{group_filter}(|(member={user_dn})(uniqueMember={user_dn})))"
            conn.search(search_base=app.config['LDAP_BASE_DN'], search_filter=group_filter)
            result = len(conn.entries) > 0
            if not result:
                print(f"User {username} is not a member of groups {app.config['LDAP_GROUPS']}.")
            return result
        finally:
            conn.unbind()
    except Exception as e:
        print(f"LDAP authentication failed: {e}")
        return False

@app.route('/run_command', methods=['POST'])
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
def index():
    return render_template('index.html', title=args.title)

@app.route('/commands', methods=['GET'])
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
                    'exit_code': status.get('exit_code', 'N/A'),
                    'last_output_line': status.get('last_output_line', get_last_non_empty_line_of_file(get_output_file_path(command_id))),
                })
    # Sort commands by start_time in descending order
    commands.sort(key=lambda x: x['start_time'], reverse=True)
    return jsonify(commands)

@app.route('/command_output/<command_id>', methods=['GET'])
def get_command_output(command_id):
    output_file_path = get_output_file_path(command_id)
    if os.path.exists(output_file_path):
        with open(output_file_path, 'r') as output_file:
            output = output_file.read()
        status_data = read_command_status(command_id) or {}
        return jsonify({'output': output, 'status': status_data.get("status")})
    return jsonify({'error': 'Invalid command_id'}), 404

@app.route('/executables', methods=['GET'])
def list_executables():
    executables = [f for f in os.listdir('.') if os.path.isfile(f) and os.access(f, os.X_OK)]
    return jsonify(executables)

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
