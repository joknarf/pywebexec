import sys
from flask import Flask, request, jsonify, render_template, session, redirect, url_for
from flask_httpauth import HTTPBasicAuth
import threading
import os
import json
import uuid
import argparse
import random
import string
from datetime import datetime, timezone, timedelta
import time
import shlex
from gunicorn.app.base import Application
import ipaddress
from socket import socket, gethostname, gethostbyname_ex, gethostbyaddr, inet_aton, inet_ntoa, AF_INET, SOCK_STREAM
import ssl
import re
import pwd
from secrets import token_urlsafe
import pexpect
import signal
import fcntl
import termios
import struct
import subprocess


if os.environ.get('PYWEBEXEC_LDAP_SERVER'):
    from ldap3 import Server, Connection, ALL, SIMPLE, SUBTREE, Tls

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

# Directory to store the command status and output
CWD = os.getcwd()
COMMAND_STATUS_DIR = '.web_status'
CONFDIR = os.path.expanduser("~/").rstrip('/')
if os.path.isdir(f"{CONFDIR}/.config"):
    CONFDIR += '/.config'
CONFDIR += "/.pywebexec"
term_command_id = str(uuid.uuid4())

# In-memory cache for command statuses
command_status_cache = {}

def generate_random_password(length=12):
    characters = string.ascii_letters + string.digits + string.punctuation
    return ''.join(random.choice(characters) for i in range(length))


def resolve_hostname(host):
    """try get fqdn from DNS/hosts"""
    try:
        hostinfo = gethostbyname_ex(host)
        return (hostinfo[0].rstrip('.'), hostinfo[2][0])
    except OSError:
        return (host, host)


def resolve_ip(ip):
    """try resolve hostname by reverse dns query on ip addr"""
    ip = inet_ntoa(inet_aton(ip))
    try:
        ipinfo = gethostbyaddr(ip)
        return (ipinfo[0].rstrip('.'), ipinfo[2][0])
    except OSError:
        return (ip, ip)


def is_ip(host):
    """determine if host is valid ip"""
    try:
        inet_aton(host)
        return True
    except OSError:
        return False


def resolve(host_or_ip):
    """resolve hostname from ip / hostname"""
    if is_ip(host_or_ip):
        return resolve_ip(host_or_ip)
    return resolve_hostname(host_or_ip)


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



class PyWebExec(Application):

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


ANSI_ESCAPE = re.compile(br'(?:\x1B[@-Z\\-_]|\x1B([(]B|>)|(?:\x1B\[|\x9B)[0-?]*[ -/]*[@-~]|\x1B\[[0-9]{1,2};[0-9]{1,2}[m|K]|\x1B\[[0-9;]*[mGKHF]|[\x00-\x1F\x7F])')

def strip_ansi_control_chars(text):
    """Remove ANSI and control characters from the text."""
    return ANSI_ESCAPE.sub(b'', text)


def decode_line(line: bytes) -> str:
    """try decode line exception on binary"""
    try:
        return strip_ansi_control_chars(line).decode().strip(" ")
    except UnicodeDecodeError:
        return ""


def last_line(fd, maxline=1000):
    """last non empty line of file"""
    line = "\n"
    fd.seek(0, os.SEEK_END)
    size = 0
    last_pos = 0
    while line in ["", "\n", "\r"] and size < maxline:
        try:  # catch if file empty / only empty lines
            if last_pos:
                fd.seek(last_pos-2, os.SEEK_SET)
            while fd.read(1) not in [b"\n", b"\r"]:
                fd.seek(-2, os.SEEK_CUR)
                size += 1
        except OSError:
            fd.seek(0)
            line = decode_line(fd.readline())
            break
        last_pos = fd.tell()
        line = decode_line(fd.readline())
    return line.strip()


def get_last_non_empty_line_of_file(file_path):
    """Get the last non-empty line of a file."""
    with open(file_path, 'rb') as f:
        return last_line(f)
    

def start_gunicorn(daemonized=False, baselog=None):
    pidfile = f"{baselog}.pid"
    if daemonized:
        if daemon_d('status', pidfilepath=baselog, silent=True):
            print(f"Error: pywebexec already running on {args.listen}:{args.port}", file=sys.stderr)
            return 1

    if sys.stdout.isatty():
        errorlog = "-"
        accesslog = None #"-"
    else:
        errorlog = f"{baselog}.log"
        accesslog = None # f"{baselog}.access.log"

    options = {
        'bind': '%s:%s' % (args.listen, args.port),
        'workers': 4,
        'timeout': 600,
        'certfile': args.cert,
        'keyfile': args.key,
        'daemon': daemonized,
        'errorlog': errorlog,
        'accesslog': accesslog,
        'pidfile': pidfile,
    }
    PyWebExec(app, options=options).run()
    return 0

def daemon_d(action, pidfilepath, silent=False, hostname=None, args=None):
    """start/stop daemon"""
    import daemon, daemon.pidfile

    pidfile = daemon.pidfile.TimeoutPIDLockFile(pidfilepath+".pid", acquire_timeout=30)
    if action == "stop":
        if pidfile.is_locked():
            pid = pidfile.read_pid()
            print(f"Stopping server pid {pid}")
            n = 20
            while n > 0:
                try:
                    os.kill(pid, signal.SIGINT)
                    time.sleep(0.25)
                    n -= 1
                except ProcessLookupError:
                    return True
            print("Failed to stop server", file=sys.stderr)
            return True
    elif action == "status":
        status = pidfile.is_locked()
        if status:
            print(f"pywebexec running pid {pidfile.read_pid()}")
            return True
        if not silent:
            print("pywebexec not running")
        return False
    elif action == "start":
        status = pidfile.is_locked()
        if status:
            print(f"pywebexc already running pid {pidfile.read_pid()}", file=sys.stderr)
            sys.exit(1)
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

def start_term():
    os.environ["PYWEBEXEC"] = " (shared)"
    os.chdir(CWD)
    start_time = datetime.now().isoformat()
    user = pwd.getpwuid(os.getuid())[0]
    print(f"Starting terminal session for {user} : {term_command_id}")
    update_command_status(term_command_id, {
        'status': 'running',
        'command': 'term',
        'params': [user, os.ttyname(sys.stdout.fileno())],
        'start_time': start_time,
        'user': user
    })
    output_file_path = get_output_file_path(term_command_id)
    res = script(output_file_path)
    end_time = datetime.now().isoformat()
    update_command_status(term_command_id, {
        'status': 'success',
        'end_time': end_time,
        'exit_code': res
    })
    print("Terminal session ended")
    return res


def print_urls(command_id=None):
    protocol = 'https' if args.cert else 'http'
    url_params = ""
    token = os.environ.get("PYWEBEXEC_TOKEN")
    if token:
        url_params = f"?token={token}"
    if command_id:
        print(f"{protocol}://{hostname}:{args.port}/dopopup/{command_id}{url_params}")
        print(f"{protocol}://{ip}:{args.port}/dopopup/{command_id}{url_params}")
    else:
        print(f"{protocol}://{hostname}:{args.port}{url_params}")
        print(f"{protocol}://{ip}:{args.port}{url_params}")


def is_port_in_use(address, port):
    with socket(AF_INET, SOCK_STREAM) as s:
        return s.connect_ex((address, port)) == 0


def parseargs():
    global app, args, COMMAND_STATUS_DIR, hostname, ip

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
        "-d", "--dir", type=str, help=f"Serve target directory. default {CONFDIR}"
    )
    parser.add_argument(
        "-t",
        "--title",
        type=str,
        default="PyWebExec",
        help="Web html title",
    )
    parser.add_argument("-c", "--cert", type=str, help="Path to https certificate")
    parser.add_argument("-k", "--key", type=str, help="Path to https certificate key")
    parser.add_argument("-g", "--gencert", action="store_true", help="https server self signed cert")
    parser.add_argument("-T", "--tokenurl", action="store_true", help="generate safe url to access")
    parser.add_argument("action", nargs="?", help="daemon action start/stop/restart/status/shareterm/term",
                        choices=["start","stop","restart","status","shareterm", "term"])

    args = parser.parse_args()
    if not os.path.exists(CONFDIR):
        os.mkdir(CONFDIR, mode=0o700)
    args.dir = args.dir or CONFDIR
    if os.path.isdir(args.dir):
        try:
            os.chdir(args.dir)
        except OSError:
            print(f"Error: cannot chdir {args.dir}", file=sys.stderr)
            sys.exit(1)
    else:
        print(f"Error: {args.dir} not found", file=sys.stderr)
        sys.exit(1)
    if not os.path.exists(COMMAND_STATUS_DIR):
        os.mkdir(COMMAND_STATUS_DIR, mode=0o700)
    if args.action == "term":
        COMMAND_STATUS_DIR = f"{os.getcwd()}/{COMMAND_STATUS_DIR}"
        sys.exit(start_term())

    (hostname, ip) = resolve(gethostname()) if args.listen == '0.0.0.0' else resolve(args.listen)

    if args.tokenurl:
        token = os.environ.get("PYWEBEXEC_TOKEN", token_urlsafe())
        os.environ["PYWEBEXEC_TOKEN"] = token
        app.config["TOKEN_URL"] = token

    if args.gencert:
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

def get_status_file_path(command_id):
    return os.path.join(COMMAND_STATUS_DIR, f'{command_id}.json')

def get_output_file_path(command_id):
    return os.path.join(COMMAND_STATUS_DIR, f'{command_id}_output.txt')

def update_command_status(command_id, updates):
    status_file_path = get_status_file_path(command_id)
    status_data = read_command_status(command_id) or {}
    status_data.update(updates)
    if status_data['status'] != 'running':
        output_file_path = get_output_file_path(command_id)
        if os.path.exists(output_file_path):
            status_data['last_output_line'] = get_last_non_empty_line_of_file(output_file_path)
    with open(status_file_path, 'w') as f:
        json.dump(status_data, f)
    
    # Update cache if status is not "running"
    if status_data['status'] != 'running':
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
        try:
            status_data = json.load(f)
        except json.JSONDecodeError:
            return None
    
    # Cache the status if it is not "running"
    if status_data['status'] != 'running':
        command_status_cache[command_id] = status_data
    
    return status_data

def sigwinch_passthrough(sig, data):
    s = struct.pack("HHHH", 0, 0, 0, 0)
    a = struct.unpack('hhhh', fcntl.ioctl(sys.stdout.fileno(), termios.TIOCGWINSZ, s))
    global p, term_command_id
    p.setwinsize(a[0], a[1])
    update_command_status(term_command_id, {
        'rows': a[0],
        'cols': a[1],
    })


def script(output_file):
    global p
    shell = os.environ.get('SHELL', 'sh')
    with open(output_file, 'wb') as fd:
        p = pexpect.spawn(shell, echo=True)
        p.logfile_read = fd
        # Set the window size
        sigwinch_passthrough(None, None)
        signal.signal(signal.SIGWINCH, sigwinch_passthrough)
        p.interact()
    

def run_command(command, params, command_id, user):
    start_time = datetime.now().isoformat()
    update_command_status(command_id, {
        'status': 'running',
        'command': command,
        'params': params,
        'start_time': start_time,
        'user': user
    })
    output_file_path = get_output_file_path(command_id)
    try:
        with open(output_file_path, 'wb') as fd:
            p = pexpect.spawn(command, params, ignore_sighup=True, timeout=None)
            update_command_status(command_id, {
                'status': 'running',
                'pid': p.pid,
                'user': user
            })
            p.setwinsize(24, 125)
            p.logfile = fd
            p.expect(pexpect.EOF)
            fd.flush()
            status = p.wait()
            end_time = datetime.now().isoformat()
            # Update the status based on the result
            if status is None:
                exit_code = -15
                update_command_status(command_id, {
                    'status': 'aborted',
                    'end_time': end_time,
                    'exit_code': exit_code,
                    'user': user
                })
            else:
                exit_code = status
                if exit_code == 0:
                    update_command_status(command_id, {
                        'status': 'success',
                        'end_time': end_time,
                        'exit_code': exit_code,
                        'user': user
                    })
                else:
                    update_command_status(command_id, {
                        'status': 'failed',
                        'end_time': end_time,
                        'exit_code': exit_code,
                        'user': user
                    })
    except Exception as e:
        end_time = datetime.now().isoformat()
        update_command_status(command_id, {
            'status': 'failed',
            'end_time': end_time,
            'exit_code': 1,
            'user': user
        })
        with open(get_output_file_path(command_id), 'a') as output_file:
            output_file.write(str(e))

@app.route('/stop_command/<command_id>', methods=['POST'])
def stop_command(command_id):
    status = read_command_status(command_id)
    if not status or 'pid' not in status:
        return jsonify({'error': 'Invalid command_id or command not running'}), 400

    pid = status['pid']
    end_time = datetime.now().isoformat()
    try:
        #update_command_status(command_id, 'aborted', end_time=end_time, exit_code=-15)
        os.killpg(os.getpgid(pid), 15)  # Send SIGTERM to the process group
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

parseargs()


@app.before_request
def check_authentication():
    # Check for token in URL if TOKEN_URL is set
    token = app.config.get('TOKEN_URL')
    if token and request.endpoint not in ['login', 'static']:
        if request.args.get('token') == token:
            return
        return jsonify({'error': 'Forbidden'}), 403
    
    if not app.config['USER'] and not app.config['LDAP_SERVER']:
        return

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
    tls_configuration = Tls(validate=ssl.CERT_NONE, version=ssl.PROTOCOL_TLSv1_2) if app.config['LDAP_SERVER'].startswith("ldaps:") else None
    server = Server(app.config['LDAP_SERVER'], tls=tls_configuration, get_info=ALL)
    user_filter = f"({app.config['LDAP_USER_ID']}={username})"
    try:
        # Bind with the bind DN and password
        conn = Connection(server, user=app.config['LDAP_BIND_DN'], password=app.config['LDAP_BIND_PASSWORD'], authentication=SIMPLE, auto_bind=True, read_only=True)
        try:
            conn.search(search_base=app.config['LDAP_BASE_DN'], search_filter=user_filter, search_scope=SUBTREE)
            if len(conn.entries) == 0:
                print(f"User {username} not found in LDAP.")
                return False
            user_dn = conn.entries[0].entry_dn
        finally:
            conn.unbind()
        
        # Bind with the user DN and password to verify credentials
        conn = Connection(server, user=user_dn, password=password, authentication=SIMPLE, auto_bind=True, read_only=True)
        try:
            if not app.config['LDAP_GROUPS'] and conn.result["result"] == 0:
                return True
            group_filter = "".join([f'({group})' for group in app.config['LDAP_GROUPS'].split(",")])
            group_filter = f"(&{group_filter}(|(member={user_dn})(uniqueMember={user_dn})))"
            conn.search(search_base=app.config['LDAP_BASE_DN'], search_filter=group_filter, search_scope=SUBTREE)
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

    # Get the user from the session
    user = session.get('username', '-')
    command_id = str(uuid.uuid4())
    # Set the initial status to running and save command details
    update_command_status(command_id, {
        'status': 'running',
        'command': command,
        'params': params,
        'user': user
    })

    # Run the command in a separate thread
    thread = threading.Thread(target=run_command, args=(command_path, params, command_id, user))
    thread.start()

    return jsonify({'message': 'Command is running', 'command_id': command_id})

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
                    params = shlex.join(status.get('params', []))
                except AttributeError:
                    params = " ".join([shlex.quote(p) if " " in p else p for p in status['params']])
                command = status.get('command', '-') + ' ' + params
                last_line = status.get('last_output_line')
                if last_line is None:
                    output_file_path = get_output_file_path(command_id)
                    if os.path.exists(output_file_path):
                        last_line = get_last_non_empty_line_of_file(output_file_path)
                commands.append({
                    'command_id': command_id,
                    'status': status['status'],
                    'start_time': status.get('start_time', 'N/A'),
                    'end_time': status.get('end_time', 'N/A'),
                    'command': command,
                    'exit_code': status.get('exit_code', 'N/A'),
                    'last_output_line': last_line,
                })
    # Sort commands by start_time in descending order
    commands.sort(key=lambda x: x['start_time'], reverse=True)
    return jsonify(commands)

@app.route('/command_output/<command_id>', methods=['GET'])
def get_command_output(command_id):
    offset = int(request.args.get('offset', 0))
    maxsize = int(request.args.get('maxsize', 10485760))
    output_file_path = get_output_file_path(command_id)
    if os.path.exists(output_file_path):
        with open(output_file_path, 'rb') as output_file:
            output_file.seek(offset)
            output = output_file.read().decode('utf-8', errors='replace')
            new_offset = output_file.tell()
        status_data = read_command_status(command_id) or {}
        token = app.config.get("TOKEN_URL")
        token_param = f"&token={token}" if token else ""
        response = {
            'output': output[-maxsize:],
            'status': status_data.get("status"),
            'cols': status_data.get("cols"),
            'links': {
                'next': f'{request.url_root}command_output/{command_id}?offset={new_offset}&maxsize={maxsize}{token_param}'
            }
        }
        if request.headers.get('Accept') == 'text/plain':
            return f"{output}\nstatus: {status_data.get('status')}", 200, {'Content-Type': 'text/plain'}
        return jsonify(response)
    return jsonify({'error': 'Invalid command_id'}), 404

@app.route('/executables', methods=['GET'])
def list_executables():
    executables = [f for f in os.listdir('.') if os.path.isfile(f) and os.access(f, os.X_OK)]
    executables.sort()  # Sort the list of executables alphabetically
    return jsonify(executables)

@app.route('/popup/<command_id>')
def popup(command_id):
    return render_template('popup.html', command_id=command_id)

@app.route('/dopopup/<command_id>')
def do_popup(command_id):
    return f"""
    <html>
    <head>
        <script type="text/javascript">
            window.onload = function() {{
                window.open('/popup/{command_id}', '_blank', 'width=1000,height=600');
                window.close();
            }};
        </script>
    </head>
    <body>
    </body>
    </html>
    """

def main():
    global COMMAND_STATUS_DIR
    basef = f"{CONFDIR}/pywebexec_{args.listen}:{args.port}"
    if args.action == "restart":
        daemon_d('stop', pidfilepath=basef)
        args.action = "start"
    port_used = is_port_in_use(args.listen, args.port)
    if args.action != "stop":
        print("Starting server:")
        print_urls()
    if args.action != "stop" and port_used:
        print(f"Error: port {args.port} already in use", file=sys.stderr)
        return 1
    if args.action == "shareterm":
        COMMAND_STATUS_DIR = f"{os.getcwd()}/{COMMAND_STATUS_DIR}"
        sys.argv.remove("shareterm")
        with open(basef + ".log", "ab+") as log:
            pywebexec = subprocess.Popen([sys.executable] + sys.argv, stdout=log, stderr=log)
            print_urls(term_command_id)
            res = start_term()
            print("Stopping server")
            time.sleep(1)
            pywebexec.terminate()
        sys.exit(res)

    if args.action == "start":
        return start_gunicorn(daemonized=True, baselog=basef)
    if args.action:
        return daemon_d(args.action, pidfilepath=basef)
    return start_gunicorn(baselog=basef)


if __name__ == '__main__':
    sys.exit(main())
    # app.run(host='0.0.0.0', port=5000)
