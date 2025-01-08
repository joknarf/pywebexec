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
from gunicorn.app.base import BaseApplication

app = Flask(__name__)
auth = HTTPBasicAuth()

# Directory to store the script status and output
SCRIPT_STATUS_DIR = 'script_status'

if not os.path.exists(SCRIPT_STATUS_DIR):
    os.makedirs(SCRIPT_STATUS_DIR)

def generate_random_password(length=12):
    characters = string.ascii_letters + string.digits + string.punctuation
    return ''.join(random.choice(characters) for i in range(length))

class StandaloneApplication(BaseApplication):

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


def start_gunicorn():
    options = {
        'bind': '%s:%s' % (args.listen, args.port),
        'workers': 4,
        'certfile': args.cert,
        'keyfile': args.key,
    }
    StandaloneApplication(app, options=options).run()

def parseargs():
    global app, args
    parser = argparse.ArgumentParser(description='Run the script execution server.')
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
        default="FileBrowser",
        help="Web html title",
    )
    parser.add_argument("-c", "--cert", type=str, help="Path to https certificate")
    parser.add_argument("-k", "--key", type=str, help="Path to https certificate key")

    args = parser.parse_args()

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

def get_status_file_path(script_id):
    return os.path.join(SCRIPT_STATUS_DIR, f'{script_id}.json')

def get_output_file_path(script_id):
    return os.path.join(SCRIPT_STATUS_DIR, f'{script_id}_output.txt')

def update_script_status(script_id, status, script_name=None, params=None, start_time=None, end_time=None, exit_code=None, pid=None):
    status_file_path = get_status_file_path(script_id)
    status_data = read_script_status(script_id) or {}
    status_data['status'] = status
    if script_name is not None:
        status_data['script_name'] = script_name
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

def read_script_status(script_id):
    status_file_path = get_status_file_path(script_id)
    if not os.path.exists(status_file_path):
        return None
    with open(status_file_path, 'r') as f:
        return json.load(f)

# Dictionary to store the process objects
processes = {}

def run_script(script_name, params, script_id):
    start_time = datetime.now().isoformat()
    update_script_status(script_id, 'running', script_name=script_name, params=params, start_time=start_time)
    try:
        output_file_path = get_output_file_path(script_id)
        with open(output_file_path, 'w') as output_file:
            # Run the script with parameters and redirect stdout and stderr to the file
            process = subprocess.Popen([script_name] + params, stdout=output_file, stderr=output_file, text=True)
            update_script_status(script_id, 'running', pid=process.pid)
            processes[script_id] = process
            process.wait()
            processes.pop(script_id, None)

        end_time = datetime.now().isoformat()
        # Update the status based on the result
        if process.returncode == 0:
            update_script_status(script_id, 'success', end_time=end_time, exit_code=process.returncode)
        elif process.returncode == -15:
            update_script_status(script_id, 'aborted', end_time=end_time, exit_code=process.returncode)
        else:
            update_script_status(script_id, 'failed', end_time=end_time, exit_code=process.returncode)
    except Exception as e:
        end_time = datetime.now().isoformat()
        update_script_status(script_id, 'failed', end_time=end_time, exit_code=1)
        with open(get_output_file_path(script_id), 'a') as output_file:
            output_file.write(str(e))

def auth_required(f):
    if app.config.get('USER'):
        return auth.login_required(f)
    return f

@app.route('/run_script', methods=['POST'])
@auth_required
def run_script_endpoint():
    data = request.json
    script_name = data.get('script_name')
    params = data.get('params', [])

    if not script_name:
        return jsonify({'error': 'script_name is required'}), 400

    # Ensure the script is an executable in the current directory
    script_path = os.path.join(".", os.path.basename(script_name))
    if not os.path.isfile(script_path) or not os.access(script_path, os.X_OK):
        return jsonify({'error': 'script_name must be an executable in the current directory'}), 400

    # Split params using shell-like syntax
    try:
        params = shlex.split(' '.join(params))
    except ValueError as e:
        return jsonify({'error': str(e)}), 400

    # Generate a unique script_id
    script_id = str(uuid.uuid4())

    # Set the initial status to running and save script details
    update_script_status(script_id, 'running', script_name, params)

    # Run the script in a separate thread
    thread = threading.Thread(target=run_script, args=(script_path, params, script_id))
    thread.start()

    return jsonify({'message': 'Script is running', 'script_id': script_id})

@app.route('/stop_script/<script_id>', methods=['POST'])
@auth_required
def stop_script(script_id):
    status = read_script_status(script_id)
    if not status or 'pid' not in status:
        return jsonify({'error': 'Invalid script_id or script not running'}), 400

    pid = status['pid']
    end_time = datetime.now().isoformat()
    try:
        os.kill(pid, 15)  # Send SIGTERM
        update_script_status(script_id, 'aborted', end_time=end_time, exit_code=-15)
        return jsonify({'message': 'Script aborted'})
    except Exception as e:
        status_data = read_script_status(script_id) or {}
        status_data['status'] = 'failed'
        status_data['end_time'] = end_time
        status_data['exit_code'] = 1
        with open(get_status_file_path(script_id), 'w') as f:
            json.dump(status_data, f)
        with open(get_output_file_path(script_id), 'a') as output_file:
            output_file.write(str(e))
        return jsonify({'error': 'Failed to terminate script'}), 500

@app.route('/script_status/<script_id>', methods=['GET'])
@auth_required
def get_script_status(script_id):
    status = read_script_status(script_id)
    if not status:
        return jsonify({'error': 'Invalid script_id'}), 404

    output_file_path = get_output_file_path(script_id)
    if os.path.exists(output_file_path):
        with open(output_file_path, 'r') as output_file:
            output = output_file.read()
        status['output'] = output

    return jsonify(status)

@app.route('/')
@auth_required
def index():
    return render_template('index.html')

@app.route('/scripts', methods=['GET'])
@auth_required
def list_scripts():
    scripts = []
    for filename in os.listdir(SCRIPT_STATUS_DIR):
        if filename.endswith('.json'):
            script_id = filename[:-5]
            status = read_script_status(script_id)
            if status:
                command = status['script_name'] + ' ' + shlex.join(status['params'])
                scripts.append({
                    'script_id': script_id,
                    'status': status['status'],
                    'start_time': status.get('start_time', 'N/A'),
                    'end_time': status.get('end_time', 'N/A'),
                    'command': command,
                    'exit_code': status.get('exit_code', 'N/A')
                })
    # Sort scripts by start_time in descending order
    scripts.sort(key=lambda x: x['start_time'], reverse=True)
    return jsonify(scripts)

@app.route('/script_output/<script_id>', methods=['GET'])
@auth_required
def get_script_output(script_id):
    output_file_path = get_output_file_path(script_id)
    if os.path.exists(output_file_path):
        with open(output_file_path, 'r') as output_file:
            output = output_file.read()
        status_data = read_script_status(script_id) or {}
        return jsonify({'output': output, 'status': status_data.get("status")})
    return jsonify({'error': 'Invalid script_id'}), 404

@app.route('/executables', methods=['GET'])
@auth_required
def list_executables():
    executables = [f for f in os.listdir('.') if os.path.isfile(f) and os.access(f, os.X_OK)]
    return jsonify(executables)

@auth.verify_password
def verify_password(username, password):
    return username == app.config['USER'] and password == app.config['PASSWORD']

if __name__ == '__main__':
    start_gunicorn()
    #app.run(host='0.0.0.0', port=5000)