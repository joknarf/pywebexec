let currentCommandId = null;
let outputInterval = null;

document.getElementById('launchForm').addEventListener('submit', async (event) => {
    event.preventDefault();
    const commandName = document.getElementById('commandName').value;
    const params = document.getElementById('params').value.split(' ');
    const response = await fetch('/run_command', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json'
        },
        body: JSON.stringify({ command: commandName, params: params })
    });
    const data = await response.json();
    fetchCommands();
    viewOutput(data.command_id);
});

async function fetchCommands() {
    const response = await fetch('/commands');
    const commands = await response.json();
    commands.sort((a, b) => new Date(b.start_time) - new Date(a.start_time));
    const commandsTbody = document.getElementById('commands');
    commandsTbody.innerHTML = '';
    if (!currentCommandId && commands.length) {
        currentCommandId = commands[0].command_id;
        viewOutput(currentCommandId);
    }
    commands.forEach(command => {
        const commandRow = document.createElement('tr');
        commandRow.className = `clickable-row ${command.command_id === currentCommandId ? 'currentcommand' : ''}`;
        commandRow.onclick = () => viewOutput(command.command_id);
        commandRow.innerHTML = `
            <td class="monospace">
                <span class="copy_clip" onclick="copyToClipboard('${command.command_id}', this)">${command.command_id.slice(0, 8)}</span>
            </td>
            <td><span class="status-icon status-${command.status}"></span>${command.status}</td>
            <td>${formatTime(command.start_time)}</td>
            <td>${command.status === 'running' ? formatDuration(command.start_time, new Date().toISOString()) : formatDuration(command.start_time, command.end_time)}</td>
            <td>${command.exit_code}</td>
            <td>${command.command.replace(/^\.\//, '')}</td>
            <td>
                ${command.status === 'running' ? `<button onclick="stopCommand('${command.command_id}')">Stop</button>` : `                <button onclick="relaunchCommand('${command.command_id}')">Run</button>
`}
            </td>
            <td class="monospace outcol">${command.last_output_line || ''}</td>
        `;
        commandsTbody.appendChild(commandRow);
    });
}

async function fetchExecutables() {
    const response = await fetch('/executables');
    const executables = await response.json();
    const commandNameSelect = document.getElementById('commandName');
    commandNameSelect.innerHTML = '';
    executables.forEach(executable => {
        const option = document.createElement('option');
        option.value = executable;
        option.textContent = executable;
        commandNameSelect.appendChild(option);
    });
}

async function fetchOutput(command_id) {
    const outputDiv = document.getElementById('output');
    const response = await fetch(`/command_output/${command_id}`);
    const data = await response.json();
    if (data.error) {
        outputDiv.innerHTML = data.error;
        clearInterval(outputInterval);
    } else {
        outputDiv.innerHTML = data.output;
        outputDiv.scrollTop = outputDiv.scrollHeight;
        if (data.status != 'running') {
            clearInterval(outputInterval);
        }
    }
}

async function viewOutput(command_id) {
    adjustOutputHeight();
    currentCommandId = command_id;
    clearInterval(outputInterval);
    const response = await fetch(`/command_status/${command_id}`);
    const data = await response.json();
    if (data.status === 'running') {
        fetchOutput(command_id);
        outputInterval = setInterval(() => fetchOutput(command_id), 1000);
    } else {
        fetchOutput(command_id);
    }
    fetchCommands(); // Refresh the command list to highlight the current command
}

async function relaunchCommand(command_id) {
    const response = await fetch(`/command_status/${command_id}`);
    const data = await response.json();
    if (data.error) {
        alert(data.error);
        return;
    }
    const relaunchResponse = await fetch('/run_command', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json'
        },
        body: JSON.stringify({
            command: data.command,
            params: data.params
        })
    });
    const relaunchData = await relaunchResponse.json();
    fetchCommands();
    viewOutput(relaunchData.command_id);
}

async function stopCommand(command_id) {
    const response = await fetch(`/stop_command/${command_id}`, {
        method: 'POST'
    });
    const data = await response.json();
    if (data.error) {
        alert(data.error);
    } else {
        alert(data.message);
        fetchCommands();
    }
}

function formatTime(time) {
    if (!time || time === 'N/A') return 'N/A';
    const date = new Date(time);
    return date.toISOString().slice(0, 16).replace('T', ' ');
}

function formatDuration(startTime, endTime) {
    if (!startTime || !endTime) return 'N/A';
    const start = new Date(startTime);
    const end = new Date(endTime);
    const duration = (end - start) / 1000;
    const hours = Math.floor(duration / 3600);
    const minutes = Math.floor((duration % 3600) / 60);
    const seconds = Math.floor(duration % 60);
    return `${hours}h ${minutes}m ${seconds}s`;
}

function copyToClipboard(text, element) {
    navigator.clipboard.writeText(text).then(() => {
        element.classList.add('copy_clip_ok');
        setTimeout(() => {
            element.classList.remove('copy_clip_ok');
        }, 2000);
    });
}

function adjustOutputHeight() {
    const outputDiv = document.getElementById('output');
    const windowHeight = window.innerHeight;
    const outputTop = outputDiv.getBoundingClientRect().top;
    const maxHeight = windowHeight - outputTop - 30; // 20px for padding/margin
    outputDiv.style.maxHeight = `${maxHeight}px`;
}

function initResizer() {
    const resizer = document.getElementById('resizer');
    const tableContainer = document.getElementById('tableContainer');
    let startY, startHeight;

    resizer.addEventListener('mousedown', (e) => {
        startY = e.clientY;
        startHeight = parseInt(document.defaultView.getComputedStyle(tableContainer).height, 10);
        document.documentElement.addEventListener('mousemove', doDrag, false);
        document.documentElement.addEventListener('mouseup', stopDrag, false);
    });

    function doDrag(e) {
        tableContainer.style.height = `${startHeight + e.clientY - startY}px`;
        adjustOutputHeight();
    }

    function stopDrag() {
        document.documentElement.removeEventListener('mousemove', doDrag, false);
        document.documentElement.removeEventListener('mouseup', stopDrag, false);
    }
}

window.addEventListener('resize', adjustOutputHeight);
window.addEventListener('load', () => {
    adjustOutputHeight();
    initResizer();
});

fetchExecutables();
fetchCommands();
setInterval(fetchCommands, 5000);
