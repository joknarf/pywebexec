let currentCommandId = null;
let outputInterval = null;
let nextOutputLink = null;
let fullOutput = '';


function initTerminal()
{
    return new Terminal({
        cursorBlink: false,
        cursorHidden: true,
        disableStdin: true,
        convertEol: true,
        fontFamily: 'Consolas NF, monospace, courier-new, courier',
        scrollback: 999999,
        theme: {
            background: '#111412',
            black: '#111412',
            green: '#088a5b',
            blue: "#2760aa",
            red: '#ba1611',
            yellow: "#cf8700",
            magenta: "#4c3d80",
            cyan: "#00a7aa",
            brightBlack: "#243C4F",
            brightBlue: "#5584b1",
        },
        rescaleOverlappingGlyphs: true,
    });
}
let terminal = initTerminal()

const fitAddon = new FitAddon.FitAddon();
terminal.loadAddon(fitAddon);
terminal.open(document.getElementById('output'));
fitAddon.fit();

function getTokenParam() {
    const urlParams = new URLSearchParams(window.location.search);
    return urlParams.get('token') ? `?token=${urlParams.get('token')}` : '';
}
const urlToken = getTokenParam();

terminal.onSelectionChange(() => {
    const selectionText = terminal.getSelection();
    if (selectionText) {
        navigator.clipboard.writeText(selectionText).catch(err => {
            console.error('Failed to copy text to clipboard:', err);
        });
    }
});

document.getElementById('launchForm').addEventListener('submit', async (event) => {
    event.preventDefault();
    const commandName = document.getElementById('commandName').value;
    const params = document.getElementById('params').value.split(' ');
    try {
        const response = await fetch(`/run_command${urlToken}`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ command: commandName, params: params })
        });
        if (!response.ok) {
            throw new Error('Failed to launch command');
        }
        const data = await response.json();
        await new Promise(r => setTimeout(r, 300));
        fetchCommands();
        viewOutput(data.command_id);
        commandInput.focus()
        commandInput.setSelectionRange(0, commandInput.value.length)
    } catch (error) {
        console.log('Error running command:', error);
    }
});

async function fetchCommands() {
    try {
        const response = await fetch(`/commands${urlToken}`);
        if (!response.ok) {
            document.getElementById('dimmer').style.display = 'block';
            return;
        }
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
                    ${navigator.clipboard == undefined ? `${command.command_id.slice(0, 8)}` : `<span class="copy_clip" onclick="copyToClipboard('${command.command_id}', this, event)">${command.command_id.slice(0, 8)}</span>`}
                </td>
                <td>${formatTime(command.start_time)}</td>
                <td>${command.status === 'running' ? formatDuration(command.start_time, new Date().toISOString()) : formatDuration(command.start_time, command.end_time)}</td>
                <td>${command.command.replace(/^\.\//, '')}</td>
                <td><span class="status-icon status-${command.status}"></span>${command.status}${command.status === 'failed' ? ` (${command.exit_code})` : ''}</td>
                <td>
                    ${command.command.startsWith('term') ? '' : command.status === 'running' ? `<button onclick="stopCommand('${command.command_id}', event)">Stop</button>` : `<button onclick="relaunchCommand('${command.command_id}', event)">Run</button>`}
                </td>
                <td class="monospace outcol">${command.last_output_line || ''}</td>
            `;
            commandsTbody.appendChild(commandRow);
        });
        document.getElementById('dimmer').style.display = 'none';
    } catch (error) {
        console.log('Error fetching commands:', error);
        document.getElementById('dimmer').style.display = 'block';
    }
}

async function fetchOutput(url) {
    try {
        const response = await fetch(url);
        if (!response.ok) {
            return;
        }
        const data = await response.json();
        if (data.error) {
            terminal.write(data.error);
            clearInterval(outputInterval);
        } else {
            slider = document.getElementById('outputSlider')
            percentage = slider.value;
            if (percentage == 100)
                terminal.write(data.output);
            else {
                length = Math.floor((fullOutput.length * percentage) / 100);
                newlength = fullOutput.length + data.output.length;
                percentage = Math.floor(length/newlength * 100);
                slider.value = percentage;
                document.getElementById('outputPercentage').innerText = `${percentage}%`;
            }
            fullOutput += data.output;
            nextOutputLink = data.links.next;
            if (data.status != 'running') {
                clearInterval(outputInterval);
            }
        }
    } catch (error) {
        console.log('Error fetching output:', error);
    }
}

async function viewOutput(command_id) {
    document.getElementById('outputSlider').value = 100;
    adjustOutputHeight();
    currentCommandId = command_id;
    nextOutputLink = `/command_output/${command_id}${urlToken}`;
    clearInterval(outputInterval);
    terminal.clear();
    terminal.reset();
    fullOutput = '';
    try {
        const response = await fetch(`/command_status/${command_id}${urlToken}`);
        if (!response.ok) {
            return;
        }
        const data = await response.json();
        if (data.status === 'running') {
            fetchOutput(nextOutputLink);
            outputInterval = setInterval(() => fetchOutput(nextOutputLink), 1000);
        } else {
            fetchOutput(nextOutputLink);
        }
        fetchCommands(); // Refresh the command list to highlight the current command
    } catch (error) {
        console.log('Error viewing output:', error);
    }
}

async function relaunchCommand(command_id, event) {
    event.stopPropagation();
    event.stopImmediatePropagation();
    try {
        const response = await fetch(`/command_status/${command_id}${urlToken}`);
        if (!response.ok) {
            throw new Error('Failed to fetch command status');
        }
        const data = await response.json();
        if (data.error) {
            alert(data.error);
            return;
        }
        const relaunchResponse = await fetch(`/run_command${urlToken}`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                command: data.command,
                params: data.params
            })
        });
        if (!relaunchResponse.ok) {
            throw new Error('Failed to relaunch command');
        }
        const relaunchData = await relaunchResponse.json();
        fetchCommands();
        viewOutput(relaunchData.command_id);
    } catch (error) {
        console.log('Error relaunching command:', error);
        alert('Failed to relaunch command. Please try again.');
    }
}

async function stopCommand(command_id, event) {
    event.stopPropagation();
    event.stopImmediatePropagation();
    try {
        const response = await fetch(`/stop_command/${command_id}${urlToken}`, {
            method: 'POST'
        });
        if (!response.ok) {
            throw new Error('Failed to stop command');
        }
        const data = await response.json();
        if (data.error) {
            alert(data.error);
        } else {
            fetchCommands();
        }
    } catch (error) {
        console.log('Error stopping command:', error);
        alert('Failed to stop command. Please try again.');
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

function copyToClipboard(text, element, event) {
    event.stopPropagation();
    event.stopImmediatePropagation();
    navigator.clipboard.writeText(text).then(() => {
        element.classList.add('copy_clip_ok');
        setTimeout(() => {
            element.classList.remove('copy_clip_ok');
        }, 1000);
    });
}

function adjustOutputHeight() {
    const outputDiv = document.getElementById('output');
    const windowHeight = window.innerHeight;
    const outputTop = outputDiv.getBoundingClientRect().top;
    const maxHeight = windowHeight - outputTop - 60; // Adjusted for slider height
    outputDiv.style.height = `${maxHeight}px`;
    fitAddon.fit();
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

function sliderUpdateOutput()
{
    const slider = document.getElementById('outputSlider');
    const percentage = slider.value;
    const outputLength = Math.floor((fullOutput.length * percentage) / 100);
    const limitedOutput = fullOutput.slice(0, outputLength);
    terminal.clear();
    terminal.reset();
    terminal.write(limitedOutput);
    document.getElementById('outputPercentage').innerText = `${percentage}%`;
}

document.getElementById('outputSlider').addEventListener('input', sliderUpdateOutput);

window.addEventListener('resize', adjustOutputHeight);
window.addEventListener('load', initResizer);

fetchCommands();
setInterval(fetchCommands, 5000);