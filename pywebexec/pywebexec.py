import sys
from flask import Flask, request, jsonify, render_template, session, redirect, url_for, Response, stream_with_context
from flask_httpauth import HTTPBasicAuth
import threading
import os
import json
import uuid
import argparse
import shutil
import random
import string
from datetime import datetime, timezone, timedelta
import time
import shlex
from gunicorn.app.base import Application
import ipaddress
from socket import socket, AF_INET, SOCK_STREAM
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
import logging
from pathlib import Path
import pyte
from . import host_ip
import yaml

if os.environ.get('PYWEBEXEC_LDAP_SERVER'):
    from ldap3 import Server, Connection, ALL, SIMPLE, SUBTREE, Tls

app = Flask(__name__)
app.secret_key = os.urandom(24)  # Secret key for session management
app.json.sort_keys = False
app.config['SESSION_COOKIE_SAMESITE'] = 'Lax'  # Add SameSite attribute to session cookies
app.config['SESSION_COOKIE_HTTPONLY'] = True
auth = HTTPBasicAuth()

app.config['LDAP_SERVER'] = os.environ.get('PYWEBEXEC_LDAP_SERVER')
app.config['LDAP_USER_ID'] = os.environ.get('PYWEBEXEC_LDAP_USER_ID', "uid") # sAMAccountName
app.config['LDAP_GROUPS'] = os.environ.get('PYWEBEXEC_LDAP_GROUPS')
app.config['LDAP_BASE_DN'] = os.environ.get('PYWEBEXEC_LDAP_BASE_DN')
app.config['LDAP_BIND_DN'] = os.environ.get('PYWEBEXEC_LDAP_BIND_DN')
app.config['LDAP_BIND_PASSWORD'] = os.environ.get('PYWEBEXEC_LDAP_BIND_PASSWORD')

app.config["JSON_SORT_KEYS"] = False

# Get the Gunicorn error logger
gunicorn_logger = logging.getLogger('gunicorn.error')
app.logger.handlers = gunicorn_logger.handlers
app.logger.setLevel(logging.INFO)  # Set the logging level to INFO

# Directory to store the command status and output
CWD = os.getcwd()
PYWEBEXEC = os.path.abspath(__file__)
COMMAND_STATUS_DIR = '.web_status'
CONFDIR = os.path.expanduser("~/").rstrip('/')
if os.path.isdir(f"{CONFDIR}/.config"):
    CONFDIR += '/.config'
CONFDIR += "/.pywebexec"
term_command_id = str(uuid.uuid4())
tty_cols = 125
tty_rows = 30

# In-memory cache for command statuses
status_cache = {}

def generate_random_password(length=12):
    characters = string.ascii_letters + string.digits + string.punctuation
    return ''.join(random.choice(characters) for i in range(length))




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
                                                                                                    #38;2;66;59;165m
ANSI_ESCAPE = re.compile(br'(?:\x1B[@-Z\\-_]|\x1B([(]B|>)|(?:\x1B\[|\x9B)[0-?]*[ -/]*[@-~]|\x1B\[([0-9]{1,2};){0,4}[0-9]{1,3}[m|K]|\x1B\[[0-9;]*[mGKHF]|[\x00-\x1F\x7F])')
ANSI_ESCAPE = re.compile(br'(?:\x1B[@-Z\\-_]|\x1B([(]B|>)|(?:\x1B\[|\x9B)[0-?]*[ -/]*[@-~]|\x1B\[([0-9]{1,2};){0,4}[0-9]{1,3}[m|K]|\x1B\[[0-9;]*[mGKHF])')
ANSI_ESCAPE = re.compile(br'(\x1B\[([0-9]{1,2};){0,4}[0-9]{1,3}[m|K]|\x1B\[[0-9;]*[mGKHF])')

def strip_ansi_control_chars(text):
    """Remove ANSI and control characters from the text."""
    return ANSI_ESCAPE.sub(b'', text)


def decode_line(line: bytes) -> str:
    """try decode line exception on binary"""
    try:
        return get_visible_line(line.decode())
    except UnicodeDecodeError:
        return ""

def get_visible_output(output, cols, rows):
    """pyte vt100 render to get last line"""
    try:
        screen = pyte.Screen(cols, rows)
        stream = pyte.Stream(screen)
        stream.feed(output)
        return "\n".join(screen.display).strip()
    except UnicodeDecodeError:
        return ""


def get_visible_line(line, cols, rows):
    """pyte vt100 render to get last line"""
    try:
        screen = pyte.Screen(cols, rows)
        stream = pyte.ByteStream(screen)
        stream.feed(line)
        visible_line = ""
        for visible_line in reversed(screen.display):
            visible_line = visible_line.strip(" ")
            if visible_line:
                return visible_line
    except:
        return ""
    return ""


def get_last_line(file_path, cols=None, rows=None, maxsize=2048):
    """Retrieve last non empty line after vt100 interpretation"""
    cols = cols or tty_cols
    rows = rows or tty_rows
    with open(file_path, 'rb') as fd:
        try:
            fd.seek(-maxsize, os.SEEK_END)
        except OSError:
            fd.seek(0)
        return get_visible_line(fd.read(), cols, rows)


def start_gunicorn(daemonized=False, baselog=None):
    check_processes()
    pidfile = f"{baselog}.pid"
    if daemonized:
        if daemon_d('status', pidfilepath=baselog, silent=True):
            print(f"Error: pywebexec already running on {args.listen}:{args.port}", file=sys.stderr)
            return 1

    if daemonized or not sys.stdout.isatty():
        errorlog = f"{baselog}.log"
        accesslog = None #f"{baselog}.access.log"
    else:
        errorlog = "-"
        accesslog = None #"-"
    options = {
        'bind': '%s:%s' % (args.listen, args.port),
        'workers': 1,
        'threads': 4,
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
    start_time = datetime.now(timezone.utc).isoformat()
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
    end_time = datetime.now(timezone.utc).isoformat()
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
        print(f"web popup: {protocol}://{hostname}:{args.port}/commands/{command_id}/dopopup{url_params}", flush=True)
        print(f"web popup: {protocol}://{ip}:{args.port}/commands/{command_id}/dopopup{url_params}", flush=True)
        print(f"raw output: {protocol}://{hostname}:{args.port}/commands/{command_id}/output_raw{url_params}", flush=True)
        print(f"raw output: {protocol}://{ip}:{args.port}/commands/{command_id}/output_raw{url_params}", flush=True)
    else:
        print(f"web commands: {protocol}://{hostname}:{args.port}{url_params}", flush=True)
        print(f"web commands: {protocol}://{ip}:{args.port}{url_params}", flush=True)


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
    parser.add_argument("-C", "--cols", type=int, default=tty_cols, help="terminal columns")
    parser.add_argument("-R", "--rows", type=int, default=tty_rows, help="terminal rows")
    parser.add_argument("action", nargs="?", help="daemon action start/stop/restart/status/shareterm/term",
                        choices=["start","stop","restart","status","shareterm", "term", "run", "run-para"])
    parser.add_argument("command", nargs="*", help="command to run")    

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
    elif args.action == "run":
        command = args.command[0]
        params = args.command[1:]
        command_id = term_command_id
        print("Command:", command_id, flush=True)
        exit_code = run_command("localhost", args.user, command, params, command_id, args.rows, args.cols)
        sys.exit(exit_code)
    elif args.action == "run-para":
        runpara = shutil.which("run-para")
        if not runpara:
            print("Error: run-para not found, install using pip install run-para", file=sys.stderr)
            sys.exit(1)
        args.command = sys.argv[sys.argv.index("run-para")+1:]
        try:
            commandindex = args.command.index("--")
        except ValueError:
            print("Error: run-para: No command supplied", file=sys.stderr)
            sys.exit(1)
        runparams = args.command[0:commandindex]
        command = args.command[commandindex+1:]
        result = subprocess.run([runpara, '-n', *runparams, "--", sys.argv[0], "-d", args.dir, "-u", args.user,
                                 "-C", str(args.cols), "-R", str(args.rows), "--", "run", *command], bufsize=0)
        sys.exit(result.returncode)

    (hostname, ip) = host_ip.get_host_ip(args.listen)

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
    status = read_command_status(command_id)
    status.update(updates)
    status = status.copy()
    if status.get('status') != 'running':
        output_file_path = get_output_file_path(command_id)
        if os.path.exists(output_file_path):
            status['last_output_line'] = get_last_line(output_file_path, status.get('cols'), status.get('rows'))
    if 'last_read' in status:
        del status['last_read']
    with open(status_file_path, 'w') as f:
        json.dump(status, f)
    os.sync()
    status_cache[command_id] = status


def read_command_status(command_id):
    # Return cached status if available
    global status_cache
    if not command_id in status_cache:
        status_cache[command_id] = {}
    status_data = status_cache[command_id]
    status = status_data.get('status')
    if status and status != "running":
        return status_data
    if status_data.get('last_read',0)>datetime.now().timestamp()-0.5:
        return status_data
    status_file_path = get_status_file_path(command_id)
    if not os.path.exists(status_file_path):
        return status_data
    with open(status_file_path, 'r') as f:
        try:
            status_data.update(json.load(f))
        except json.JSONDecodeError:
            return status_data
    status_data['last_read'] = datetime.now().timestamp()
    #status_cache[command_id] = status_data
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
        update_command_status(term_command_id, {"pid": p.pid})
        # Set the window size
        sigwinch_passthrough(None, None)
        signal.signal(signal.SIGWINCH, sigwinch_passthrough)
        p.interact()


def run_command(fromip, user, command, params, command_id, rows, cols):
    # app.logger.info(f'{fromip} run_command {command_id} {user}: {command} {params}')
    log_info(fromip, user, f'run_command {command_id}: {command_str(command, params)}')
    start_time = datetime.now(timezone.utc).isoformat()
    if user:
        os.environ['PYWEBEXEC_USER'] = user
    update_command_status(command_id, {
        'command': command,
        'params': params,
        'start_time': start_time,
        'status': 'running',
        'from': fromip,
        'user': user,
        'cols': cols,
        'rows': rows,
    })
    output_file_path = get_output_file_path(command_id)
    try:
        with open(output_file_path, 'wb') as fd:
            p = pexpect.spawn(command, params, ignore_sighup=True, timeout=None, dimensions=(rows, cols))
            update_command_status(command_id, {
                'pid': p.pid,
            })
            p.logfile = fd
            p.expect(pexpect.EOF)
            fd.flush()
            status = p.wait()
            end_time = datetime.now(timezone.utc).isoformat()
            # Update the status based on the result
            if status is None:
                exit_code = -15
                update_command_status(command_id, {
                    'status': 'aborted',
                    'end_time': end_time,
                    'exit_code': exit_code,
                })
                log_info(fromip, user, f'run_command {command_id}: {command_str(command, params)}: command aborted')
            else:
                exit_code = status
                if exit_code == 0:
                    update_command_status(command_id, {
                        'status': 'success',
                        'end_time': end_time,
                        'exit_code': exit_code,
                    })
                    log_info(fromip, user, f'run_command {command_id}: {command_str(command, params)}: completed successfully')
                else:
                    update_command_status(command_id, {
                        'status': 'failed',
                        'end_time': end_time,
                        'exit_code': exit_code,
                    })
                    log_info(fromip, user, f'run_command {command_id}: {command_str(command, params)}: exit code {exit_code}')

    except Exception as e:
        end_time = datetime.now(timezone.utc).isoformat()
        update_command_status(command_id, {
            'status': 'failed',
            'end_time': end_time,
            'exit_code': 1,
        })
        with open(get_output_file_path(command_id), 'a') as output_file:
            output_file.write(str(e))
        app.logger.error(fromip, user, f'Error running command {command_id}: {e}')
        exit_code = 1
    return exit_code

def command_str(command, params):
    try:
        params = shlex.join(params)
    except AttributeError:
        params = " ".join([shlex.quote(p) if " " in p else p for p in params])
    return f"{command} {params}"


def read_commands():
    global status_cache
    commands = []
    for filename in os.listdir(COMMAND_STATUS_DIR):
        if filename.endswith('.json'):
            command_id = filename[:-5]
            status = read_command_status(command_id)
            if status:
                cmd = status.get('command', '-')
                params = status.get('params', [])
                if cmd.endswith('/run-para'):
                    cmd = "batch"
                    index = params.index('run')
                    if index:
                        params = params[index+1:]
                        params[0] = os.path.basename(params[0])
                command = command_str(cmd, params)
                if status.get('status') == 'running' and status.get('last_update',0)<datetime.now().timestamp()-5:
                    output_file_path = get_output_file_path(command_id)
                    if os.path.exists(output_file_path):
                        size = os.path.getsize(output_file_path)
                        if size != status.get('size'):
                            status.update({
                                'size': size,
                                'last_update': datetime.now().timestamp(),
                                'last_output_line': get_last_line(output_file_path, status.get('cols'), status.get('rows')),
                            })
                commands.append({
                    'command_id': command_id,
                    'status': status.get('status'),
                    'start_time': status.get('start_time', 'N/A'),
                    'end_time': status.get('end_time', 'N/A'),
                    'command': command,
                    'user': status.get('user'),
                    'exit_code': status.get('exit_code', 'N/A'),
                    'last_output_line': status.get('last_output_line'),
                })
    return commands

def is_process_alive(pid):
    try:
        os.kill(pid, 0)
    except ProcessLookupError:
        return False
    except PermissionError:
        return True
    return True

def check_processes():
    for filename in os.listdir(COMMAND_STATUS_DIR):
        if filename.endswith('.json'):
            command_id = filename[:-5]
            status = read_command_status(command_id)
            if status.get('status') == 'running' and 'pid' in status:
                if not is_process_alive(status['pid']):
                    end_time = datetime.now(timezone.utc).isoformat()
                    update_command_status(command_id, {
                        'status': 'aborted',
                        'end_time': end_time,
                        'exit_code': -1,
                    })

def log_info(fromip, user, message):
    app.logger.info(f"{user} {fromip}: {message}")

def log_error(fromip, user, message):
    app.logger.error(f"{user} {fromip}: {message}")

def log_request(message):
    log_info(request.remote_addr, session.get('username', '-'), message)


args = parseargs()
if args.cert:
    app.config['SESSION_COOKIE_SECURE'] = True
app.config['TITLE'] = f"{args.title} API"



def get_executable(cmd):
    if os.path.isfile(cmd) and os.access(cmd, os.X_OK):
        help_file = f"{cmd}.help"
        help_text = ""
        if os.path.exists(help_file) and os.path.isfile(help_file):
            with open(help_file, 'r') as hf:
                help_text = hf.read()
        schema_file = f"{cmd}.schema.yaml"
        schema = {}
        if os.path.exists(schema_file):
            with open(schema_file, 'r') as sf:
                schema = yaml.safe_load(sf)
        return {"command": cmd, "help": help_text, "schema": schema}
    return None

def get_executables():
    executables_list = []
    for f in os.listdir('.'):
        exe = get_executable(f)
        if exe:
            executables_list.append(exe)
    return sorted(executables_list, key=lambda x: x["command"])


@app.route('/commands/<command_id>/stop', methods=['PATCH'])
def stop_command(command_id):
    log_request(f"stop_command {command_id}")
    status = read_command_status(command_id)
    if not status or 'pid' not in status:
        return jsonify({'error': 'Invalid command_id or command not running'}), 400

    pid = status['pid']
    end_time = datetime.now(timezone.utc).isoformat()
    try:
        os.killpg(os.getpgid(pid), 15)  # Send SIGTERM to the process group
        return jsonify({'message': 'Command aborted'})
    except Exception as e:
        update_command_status(command_id, {
            'status': 'aborted',
            'end_time': end_time,
            'exit_code': -15,
        })
        return jsonify({'error': 'Failed to terminate command'}), 500


@app.before_request
def check_authentication():
    token = app.config.get('TOKEN_URL')
    if token and request.endpoint not in ['login', 'static']:
        if request.args.get('token') == token or session.get('token') == token:
            session['token'] = token
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
    group_filter = ""
    if app.config["LDAP_GROUPS"]:
        group_filter = "".join(f"(memberOf={group})" for group in app.config['LDAP_GROUPS'].split(" "))
        group_filter = f"(|{group_filter})"
    ldap_filter = f"(&(objectClass=person){user_filter}{group_filter})"
    try:
        # Bind with the bind DN and password
        conn = Connection(server, user=app.config['LDAP_BIND_DN'], password=app.config['LDAP_BIND_PASSWORD'], authentication=SIMPLE, auto_bind=True, read_only=True)
        try:
            conn.search(search_base=app.config['LDAP_BASE_DN'], search_filter=ldap_filter, search_scope=SUBTREE)
            if len(conn.entries) == 0:
                print(f"User {username} not found in LDAP in allowed groups.")
                return False
            user_dn = conn.entries[0].entry_dn
        finally:
            conn.unbind()

        # Bind with the user DN and password to verify credentials
        conn = Connection(server, user=user_dn, password=password, authentication=SIMPLE, auto_bind=True, read_only=True)
        try:
            if conn.result["result"] == 0:
                return True
            print(f"{username}: Password mismatch")
            return False
        finally:
            conn.unbind()
    except Exception as e:
        print(f"LDAP authentication failed: {e}")
        return False

@app.route('/commands', methods=['POST'])
def run_command_endpoint():
    data = request.json
    command = data.get('command')
    params = data.get('params', [])
    rows = data.get('rows', tty_rows)
    cols = data.get('cols', tty_cols)

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
        'user': user,
        'from': request.remote_addr,
    })

    Path(get_output_file_path(command_id)).touch()
    # Run the command in a separate thread
    thread = threading.Thread(target=run_command, args=(request.remote_addr, user, command_path, params, command_id, rows, cols))
    thread.start()

    return jsonify({'message': 'Command is running', 'command_id': command_id})

@app.route('/commands/exposed', methods=['GET'])
def list_executables():
    executables_list = get_executables()
    return jsonify({"commands": executables_list})


    
@app.route('/commands/<cmd>', methods=['POST'])
def run_dynamic_command(cmd):
    # Validate that 'cmd' is an executable in the current directory

    def parse_params(cmd, data_params):
        if not data_params:
            return []
        # Convert received parameters to exec args.
        # If schema defined for each para, value in data:
        # - if value is True → --<key>
        # - if value is a string → --<param> value
        # - if value is an array → --<param> value1 value2 ...
        # - if value is False → "" (omit)
        # schema_options:
        #   separator: " " (default) or "=" is the separator between --param and value
        #   noprefix_params: ["param1", "param2"] or ["*"] to omit --param prefix
        #   convert_params: {"param1": "param2"} to convert param1 to param2
        exe = get_executable(cmd)
        separator_params = exe.get("schema", {}).get("schema_options", {}).get("separator_params", {})
        noprefix = exe.get("schema", {}).get("schema_options", {}).get("noprefix_params", {})
        convert_params = exe.get("schema", {}).get("schema_options", {}).get("convert_params", {})
        convert_values = exe.get("schema", {}).get("schema_options", {}).get("convert_values", {})
        schema_params = exe.get("schema", {}).get("properties", {})
        batch_param = exe.get("schema", {}).get("schema_options", {}).get("batch_param", None)
        batch_values = []
        if isinstance(data_params, dict) and not schema_params:
            return None
        if isinstance(data_params, dict):
            params = ""
            for param in schema_params.keys():
                if not param in data_params:
                    continue
                value = data_params[param]
                if value is None:
                    continue
                prefix = ""
                separator = " "
                if '*' in separator_params:
                    separator = separator_params['*']
                if param in separator_params:
                    separator = separator_params[param]
                if param in convert_params:
                    param = convert_params[param]
                    prefix = param
                    if param in ['--', '', None]:
                        separator = ' '
                elif "*" in noprefix or param in noprefix:
                    separator = ""
                else:
                    prefix = f"--{param}"
                if isinstance(value, bool) and convert_params.get(param, None) is None:
                    if value:
                        params += f"{prefix} "
                    continue
                if isinstance(value, dict) or convert_values.get(param, None) == "json":
                    value = shlex.quote(json.dumps(value, indent=2, sort_keys=False))
                elif convert_values.get(param, None) == "quote":
                    value = shlex.quote(str(value))
                else:
                    values = shlex.split(value) if isinstance(value, str) else value
                params += f"{prefix}{separator}"
                if param == batch_param and len(values)>1:
                    batch_values = values
                    value="@1"
                if isinstance(value, list):
                    params += " ".join(value)
                else:
                    params += str(value)
                params += " "
        else:
            params = data_params
        if isinstance(params, str):
            params = [params]
        try:
            params = shlex.split(' '.join(params)) if isinstance(params, list) else []
        except Exception as e:
            return None
        return params, batch_values

    cmd_path = os.path.join(".", os.path.basename(cmd))
    if not os.path.isfile(cmd_path) or not os.access(cmd_path, os.X_OK):
        return jsonify({'error': 'Command not found or not executable'}), 400
    try:
        data = request.json
    except Exception as e:
        data = {}
    params, batch_values = parse_params(cmd, data.get('params'))
    if params is None:
        return jsonify({'error': 'Invalid parameters'}), 400
    rows = data.get('rows', tty_rows) or tty_rows
    cols = data.get('cols', tty_cols) or tty_cols
    parallel = data.get('parallel', 1)
    delay = data.get('delay', 0)
    user = session.get('username', '-')
    command_id = str(uuid.uuid4())
    update_command_status(command_id, {
        'status': 'running',
        'command': cmd,
        'params': params,
        'user': user,
        'from': request.remote_addr,
    })
    Path(get_output_file_path(command_id)).touch()
    if batch_values:
        params = ["-n", "-p", str(parallel), "-D", str(delay), "-P", *batch_values, '--', 
                  sys.argv[0], "-d", ".", "-u", user, "-C", str(cols), "-R", str(rows), "--", "run", cmd_path, *params]
        cmd_path = shutil.which("run-para")
    thread = threading.Thread(target=run_command, args=(request.remote_addr, user, cmd_path, params, command_id, rows, cols))
    thread.start()
    return jsonify({'message': 'Command is running', 'command_id': command_id})

@app.route('/commands/<command_id>', methods=['GET'])
def get_command_status(command_id):
    status = read_command_status(command_id)
    if not status:
        return jsonify({'error': 'Invalid command_id'}), 404
    return jsonify(status)

@app.route('/')
def index():
    return render_template('index.html', title=args.title)

@app.route('/v0/documentation/')
def swagger_ui():
    return render_template('swagger_ui.html', title=app.config.get('TITLE', 'PyWebExec API'))

@app.route('/commands', methods=['GET'])
def list_commands():
    commands = read_commands()
    commands.sort(key=lambda x: x['start_time'], reverse=True)
    return jsonify({"commands": commands})

@app.route('/commands/<command_id>/output', methods=['GET'])
def get_command_output(command_id):
    offset = int(request.args.get('offset', 0))
    maxsize = int(request.args.get('maxsize', 10485760))
    maxlines = int(request.args.get('maxlines', 5000))
    output_file_path = get_output_file_path(command_id)
    if os.path.exists(output_file_path):
        size = os.path.getsize(output_file_path)
        if offset >= size:
            output = ''
            new_offset = offset
        else:
            with open(output_file_path, 'rb') as output_file:
                output_file.seek(offset)
                output = output_file.read().decode('utf-8', errors='replace')
                new_offset = output_file.tell()
        status_data = read_command_status(command_id)
        token = app.config.get("TOKEN_URL")
        token_param = f"&token={token}" if token else ""
        response = {
            'output': output[-maxsize:],
            'status': status_data.get("status"),
            'cols': status_data.get("cols"),
            'rows': status_data.get("rows"),
            'links': {
                'next': f'{request.url_root}commands/{command_id}/output?offset={new_offset}&maxsize={maxsize}{token_param}'
            }
        }
        if request.headers.get('Accept') == 'text/plain':
            return f"{get_visible_output(output, status_data.get('cols'), maxlines)}\nstatus: {status_data.get('status')}", 200, {'Content-Type': 'text/plain'}
        return jsonify(response)
    return jsonify({'error': 'Invalid command_id'}), 404

@app.route('/commands/<command_id>/output_raw', methods=['GET'])
def get_command_output_raw(command_id):
    offset = int(request.args.get('offset', 0))
    @stream_with_context
    def generate(offset):
        try:
            output_file_path = get_output_file_path(command_id)
            if os.path.exists(output_file_path):
                with open(output_file_path, 'rb') as output_file:
                    while True:
                        while True:
                            chunk = output_file.read(1024)
                            if not chunk:
                                time.sleep(0.5)
                                break
                            yield chunk
                        status = read_command_status(command_id)
                        if not status or status['status'] != 'running':
                            yield f"\nEnd of command {command_id} {status.get('status', '')} exit: {status.get('exit_code')}\n"
                            break
        except GeneratorExit:
            return
    return Response(generate(offset), content_type='text/plain')


@app.route('/commands/<command_id>/popup')
def popup(command_id):
    return render_template('popup.html', command_id=command_id)

@app.route('/commands/<command_id>/dopopup')
def do_popup(command_id):
    token = request.args.get('token', '')
    token_param = f'?token={token}' if token else ''
    return f"""
    <html>
    <head>
        <script type="text/javascript">
            window.onload = function() {{
                window.open('/commands/{command_id}/popup{token_param}', '_blank', 'width=1000,height=600');
                window.close();
            }};
        </script>
    </head>
    <body>
    </body>
    </html>
    """

@app.route('/swagger.yaml')
def swagger_yaml():
    swagger_path = os.path.join(os.path.dirname(__file__), 'swagger.yaml')
    try:
        with open(swagger_path, 'r') as f:
            swagger_spec_str = f.read()
        swagger_spec = yaml.safe_load(swagger_spec_str)
        # Update existing POST /commands enum if present
        executables = get_executables()
        post_cmd = swagger_spec.get('paths', {}).get('/commands', {}).get('post')
        if post_cmd:
            params_list = post_cmd.get('parameters', [])
            for param in params_list:
                if param.get('in') == 'body' and 'schema' in param:
                    props = param['schema'].get('properties', {})
                    if 'command' in props:
                        props['command']['enum'] = [e['command'] for e in executables]
        # Add dynamic paths for each 
        # Add dynamic paths for each executable:
        for exe in executables:
            dynamic_path = "/commands/" + exe["command"]
            cmd_schema = {
                "type": "object",
                "properties": {
                    "params": {"type": "array", "items": {"type": "string"}, "default": []},
                    "rows": {"type": "integer", "description": "tty nb rows", "default": tty_rows},
                    "cols": {"type": "integer", "description": "tty nb columns", "default": tty_cols},
                }
            }
            if exe["schema"]:
                cmd_schema["properties"]["params"] = exe["schema"]
                if exe["schema"].get("schema_options", {}).get("batch_param"):
                  cmd_schema["properties"].update({
                    "parallel": {"type": "integer", "description": 'nb parallel jobs', "default": 1, "required": True, "minimum": 1, "maximum": 100},
                    "delay": {"type": "number", "description": "initial delay in s between jobs", "default": 10, "required": True, "minimum": 0, "maximum": 600},
                  })
            swagger_spec.setdefault("paths", {})[dynamic_path] = {
                "post": {
                    "summary": f"Run command {exe['command']}",
                    "tags": ["run_commands"],
                    "description": f"{exe['help']}",
                    "consumes": ["application/json"],
                    "produces": ["application/json"],
                    "parameters": [
                        {
                            "in": "body",
                            "name": "requestBody",
                            "schema": cmd_schema
                        }
                    ],
                    "responses": {
                        "200": {
                            "description": "Command started",
                            "schema": {
                                "type": "object",
                                "properties": {
                                    "message": {"type": "string"},
                                    "command_id": {"type": "string"}
                                }
                            }
                        }
                    }
                }
            }
        swagger_spec['info']['title'] = app.config.get('TITLE', 'PyWebExec API')
        swagger_spec_str = yaml.dump(swagger_spec, sort_keys=False)
        return Response(swagger_spec_str, mimetype='application/yaml')
    except Exception as e:
        return Response(f"Error reading swagger spec: {e}", status=500)

@app.route('/commands/<command_id>/run', methods=['POST'])
def relaunch_command(command_id):
    log_request(f"relaunch_command {command_id}")
    status = read_command_status(command_id)
    if not status:
        return jsonify({'error': 'Invalid command_id'}), 404

    data = request.json or {}
    command = status['command']
    params = status['params']
    rows = data.get('rows', tty_rows)
    cols = data.get('cols', tty_cols)

    command_path = command
    if not os.path.isfile(command_path) or not os.access(command_path, os.X_OK):
        return jsonify({'error': 'Command not found or not executable'}), 400

    # Get the user from the session
    user = session.get('username', '-')
    new_command_id = str(uuid.uuid4())
    update_command_status(new_command_id, {
        'status': 'running',
        'command': command,
        'params': params,
        'user': user,
        'from': request.remote_addr,
    })

    Path(get_output_file_path(new_command_id)).touch()
    thread = threading.Thread(target=run_command, args=(request.remote_addr, user, command_path, params, new_command_id, rows, cols))
    thread.start()

    return jsonify({'message': 'Command is running', 'command_id': new_command_id})

def main():
    global COMMAND_STATUS_DIR
    basef = f"{CONFDIR}/pywebexec_{args.listen}:{args.port}"
    if args.action == "restart":
        daemon_d('stop', pidfilepath=basef)
        args.action = "start"
    port_used = is_port_in_use(args.listen, args.port)
    if args.action != "stop":
        print("Starting server:", flush=True)
        print_urls()
    if args.action != "stop" and port_used:
        print(f"Error: port {args.port} already in use", file=sys.stderr)
        return 1
    if args.action == "shareterm":
        COMMAND_STATUS_DIR = f"{os.getcwd()}/{COMMAND_STATUS_DIR}"
        check_processes()
        sys.argv.remove("shareterm")
        with open(basef + ".log", "a") as log:
            pywebexec = subprocess.Popen(sys.argv, stdout=log, stderr=log, bufsize=1)
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
