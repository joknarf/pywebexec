let currentCommandId = null;
let outputInterval = null;
let nextOutputLink = null;
let slider = document.getElementById('outputSlider');
let outputPercentage = document.getElementById('outputPercentage');
let fullOutput = '';
let outputLength = 0;
const maxScrollback = 99999;
const maxSize = 10485760; // 10MB
let fontSize = 14;
let isPaused = false;
let showRunningOnly = false;
let hiddenCommandIds = [];
let fitWindow = false;
let cols = 0;
let rows = 0;

function initTerminal()
{
    return new Terminal({
        cursorBlink: false,
        cursorInactiveStyle: 'none',
        disableStdin: true,
        //convertEol: true,
        fontFamily: '"Consolas NF", "Fira Code", monospace, "Powerline Extra Symbols", courier-new, courier',
        fontSize: fontSize,
        scrollback: maxScrollback,
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
            brightGreen: "#18Ed93",
        },
        customGlyphs: true,
        rescaleOverlappingGlyphs: true,
        allowProposedApi: true,
        letterSpacing: 0,
        screenReaderMode: true,
        //overviewRulerWidth: 30,
        // windowsPty: {
        //     backend: 'conpty',
        //     buildnumber: 21376,
        // }
    });
}
let terminal = initTerminal()

// Canvas
terminal.loadAddon(new CanvasAddon.CanvasAddon());

// fix width for wide characters
unicode11Addon = new Unicode11Addon.Unicode11Addon();
terminal.loadAddon(unicode11Addon);
terminal.unicode.activeVersion = '11';
terminal.register({
    wcwidth: (character) => {
        const code = character.charCodeAt(0);
        if (code == 0x1F525) return 2;  // Fire emoji
        // Handle powerline symbols (usually should be width 1)
        if (code >= 0xE0A0 && code <= 0xE0D4) return 1;
        // Handle other specific unicode ranges
        if (code >= 0x1100 && code <= 0x11FF) return 2;  // Hangul Jamo
        if (code >= 0x3000 && code <= 0x30FF) return 2;  // CJK Symbols and Japanese
        if (code >= 0x4E00 && code <= 0x9FFF) return 2;  // CJK Unified Ideographs
        // Default to system wcwidth
        return null;
    }
});

const fitAddon = new FitAddon.FitAddon();
terminal.loadAddon(fitAddon);
terminal.open(document.getElementById('output'));
fitAddon.fit();

terminal.onTitleChange((title) => {
    document.getElementById('commandInfo').innerText = title;
})

/*terminal.onResize((evt) => {
    const terminal_size = {
        Width: evt.cols,
        Height: evt.rows,
    };
    console.log(terminal_size);
})*/

terminal.onSelectionChange(() => {
    const selectionText = terminal.getSelection();
    if (selectionText) {
        navigator.clipboard.writeText(selectionText).catch(err => {
            console.error('Failed to copy text to clipboard:', err);
        });
    }
});

function autoFit(scroll=true) {
    // Scroll output div to bottom
    const outputDiv = document.getElementById('output');
    outputDiv.scrollTop = terminal.element.clientHeight - outputDiv.clientHeight + 20;
    if (cols && !fitWindow) {
        let fit = fitAddon.proposeDimensions();
        if (fit.rows < rows) {
            terminal.resize(cols, rows);
        } else {
            terminal.resize(cols, fit.rows);
        }
    } else {
        fitAddon.fit();
    }
    if (scroll) terminal.scrollToBottom();
}

function getTokenParam() {
    const urlParams = new URLSearchParams(window.location.search);
    return urlParams.get('token') ? `?token=${urlParams.get('token')}` : '';
}
const urlToken = getTokenParam();


document.getElementById('launchForm').addEventListener('submit', async (event) => {
    event.preventDefault();
    const commandName = commandInput.value;
    const params = paramsInput.value.split(' ');
    fitAddon.fit();
    terminal.clear();
    try {
        const response = await fetch(`/run_command${urlToken}`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ command: commandName, params: params, rows: terminal.rows, cols: terminal.cols })
        });
        if (!response.ok) {
            throw new Error('Failed to launch command');
        }
        const data = await response.json();
        //await new Promise(r => setTimeout(r, 300));// not ok
        viewOutput(data.command_id);
        fetchCommands();
        commandInput.focus()
        commandInput.setSelectionRange(0, commandInput.value.length)
    } catch (error) {
        console.log('Error running command:', error);
    }
});

async function fetchCommands(hide=false) {
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
        runningCommands = [];
        commands.forEach(command => {
            if (hide && showRunningOnly && command.status !== 'running') {
                hiddenCommandIds.push(command.command_id);
                return;
            }
            if (hiddenCommandIds.includes(command.command_id)) return;
            const commandRow = document.createElement('tr');
            commandRow.className = `clickable-row ${command.command_id === currentCommandId ? 'currentcommand' : ''}`;
            commandRow.onclick = () => viewOutput(command.command_id);
            if (command.status === 'running') runningCommands.push(command.command.replace(/^\.\//, ''));
            commandRow.innerHTML = `
                <td class="monospace">
                    ${navigator.clipboard == undefined ? `${command.command_id.slice(0, 8)}` : `<span class="copy_clip" onclick="copyToClipboard('${command.command_id}', this, event)">${command.command_id.slice(0, 8)}</span>`}
                </td>
                <td>${formatTime(command.start_time)}</td>
                <td>${command.status === 'running' ? formatDuration(command.start_time, new Date().toISOString()) : formatDuration(command.start_time, command.end_time)}</td>
                <td><span class="status-icon status-${command.status}"></span>${command.status}${command.status === 'failed' ? ` (${command.exit_code})` : ''}</td>
                <td>
                    ${command.command.startsWith('term') ? '' : command.status === 'running' ? `<button onclick="stopCommand('${command.command_id}', event)">Stop</button>` : `<button onclick="relaunchCommand('${command.command_id}', event)">Run</button>`}
                </td>
                <td class="system-font" title="${command.user == '-' ? '' : command.user}">${command.command.replace(/^\.\//, '')}</td>
                <td class="monospace outcol">
                    <button class="popup-button" onclick="openPopup('${command.command_id}', event)"></button>
                    ${command.last_output_line || ''}
                </td>
            `;
            commandsTbody.appendChild(commandRow);
        });
        if (runningCommands.length) {
            document.getElementById('thStatus').innerHTML=`<span class="status-icon status-running"></span>Running <span class="system-font nbrunning">${runningCommands.length}</span>`;
            document.getElementById('thStatus').setAttribute('title', runningCommands.join("\n"));
        } else {
            document.getElementById('thStatus').innerHTML=`<span class="status-icon status-norun"></span>Status`;
            document.getElementById('thStatus').setAttribute('title', "no command running");
        }
        document.getElementById('dimmer').style.display = 'none';
    } catch (error) {
        console.log('Error fetching commands:', error);
        document.getElementById('dimmer').style.display = 'block';
    }
}

async function fetchOutput(url) {
    if (isPaused) return;
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
            if (data.cols) {
                cols = data.cols;
                rows = data.rows;
                autoFit(scroll=false);
            }
            fullOutput += data.output;
            if (fullOutput.length > maxSize)
                fullOutput = fullOutput.slice(-maxSize);
            if (slider.value == 1000)
                terminal.write(data.output);
            else {
                percentage = Math.round((outputLength * 1000)/fullOutput.length);
                slider.value = percentage;
                outputPercentage.innerText = `${Math.floor(percentage/10)}%`;
            }
            nextOutputLink = data.links.next;
            if (data.status != 'running') {
                clearInterval(outputInterval);
                toggleButton.style.display = 'none';
                setCommandStatus(data.status);
                fetchCommands();
            } else {
                toggleButton.style.display = 'block';
                setCommandStatus(data.status);
            }
        }
    } catch (error) {
        console.log('Error fetching output:', error);
    }
}

function setCommandStatus(status) {
    document.getElementById("commandStatus").className = `status-icon status-${status}`;
}

async function viewOutput(command_id) {
    slider.value = 1000;
    outputPercentage.innerText = '100%';
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
            outputInterval = setInterval(() => fetchOutput(nextOutputLink), 500);
        }
        const data = await response.json();
        const commandInfo = document.getElementById('commandInfo');
        const command = `${data.command.replace(/^\.\//, '')} ${data.params.join(' ')}`;
        setCommandStatus(data.status)
        commandInfo.innerText = command;
        commandInfo.setAttribute('title', command);
        if (data.command == 'term')
            terminal.options.cursorInactiveStyle = 'outline';
        else
            terminal.options.cursorInactiveStyle = 'none';
        if (data.status === 'running') {
            fetchOutput(nextOutputLink);
            outputInterval = setInterval(() => fetchOutput(nextOutputLink), 500);
            toggleButton.style.display = 'block';
        } else {
            fetchOutput(nextOutputLink);
            toggleButton.style.display = 'none';
        }
        fetchCommands(); // Refresh the command list to highlight the current command
    } catch (error) {
        console.log('Error viewing output:', error);
    }
}

async function openPopup(command_id, event) {
    event.stopPropagation();
    event.stopImmediatePropagation();
    const popupUrl = `/popup/${command_id}${urlToken}`;
    window.open(popupUrl, '_blank', 'width=1000,height=600');
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
        fitAddon.fit();
        terminal.clear();
        const relaunchResponse = await fetch(`/run_command${urlToken}`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                command: data.command,
                params: data.params,
                rows: terminal.rows,
                cols: terminal.cols,
            })
        });
        if (!relaunchResponse.ok) {
            throw new Error('Failed to relaunch command');
        }
        const relaunchData = await relaunchResponse.json();
        viewOutput(relaunchData.command_id);
        fetchCommands();
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
        alert('Failed to stop command. Process not found.');
    }
}

function formatTime(time) {
    if (!time || time === 'N/A') return 'N/A';
    const date = new Date(time);
    return date.toLocaleString("sv-SE", { hour12: false, timeStyle: 'short', dateStyle: 'short' }).slice(5);
}

function formatDuration(startTime, endTime) {
    if (!startTime || !endTime) return 'N/A';
    const start = new Date(startTime);
    const end = new Date(endTime);
    const duration = (end - start) / 1000;
    const hours = Math.floor(duration / 3600);
    const minutes = Math.floor((duration % 3600) / 60).toString().padStart(2, '0');
    const seconds = Math.floor(duration % 60).toString().padStart(2, '0');
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
    autoFit();
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
    const percentage = slider.value/10;
    outputLength = Math.floor((fullOutput.length * percentage) / 100);
    limitedOutput = fullOutput.slice(0, outputLength);
    terminal.clear();
    terminal.reset();
    terminal.write(limitedOutput);
    outputPercentage.innerText = `${Math.floor(percentage)}%`;
}

slider.addEventListener('input', sliderUpdateOutput);

document.getElementById('decreaseFontSize').addEventListener('click', () => {
    fontSize = Math.max(8, fontSize - 1);
    terminal.options.fontSize = fontSize;
    autoFit();
});

document.getElementById('increaseFontSize').addEventListener('click', () => {
    fontSize = Math.min(32, fontSize + 1);
    terminal.options.fontSize = fontSize;
    autoFit();
});

const toggleButton = document.getElementById('toggleFetch');
const pausedMessage = document.getElementById('pausedMessage');
const toggleFitButton = document.getElementById('toggleFit');


function toggleFetchOutput() {
    if (isPaused) {
        slider.value = 100;
        outputPercentage.innerText = '100%';
        terminal.clear();
        terminal.reset();
        terminal.write(fullOutput);
        fetchOutput(nextOutputLink);
        outputInterval = setInterval(() => fetchOutput(nextOutputLink), 500);
        toggleButton.classList.remove("resume");
        pausedMessage.style.display = 'none';
    } else {
        clearInterval(outputInterval);
        toggleButton.classList.add("resume");
        pausedMessage.style.display = 'block';
        const outputDiv = document.getElementById('output');
        const rect = outputDiv.getBoundingClientRect();
        pausedMessage.style.top = `${rect.top + 10}px`;
        pausedMessage.style.right = `${window.innerWidth - rect.right + 10}px`;
    }
    isPaused = !isPaused;
}
function toggleFit() {
    fitWindow = ! fitWindow;
    if (fitWindow) {
        toggleFitButton.classList.add('fit-tty');
        toggleFitButton.setAttribute('title', 'terminal fit tty');
    } else {
        toggleFitButton.classList.remove('fit-tty');
        toggleFitButton.setAttribute('title', 'terminal fit window');
    }
    autoFit();
    viewOutput(currentCommandId);
}

toggleButton.addEventListener('click', toggleFetchOutput);
toggleFitButton.addEventListener('click', toggleFit);

document.getElementById('thStatus').addEventListener('click', () => {
    showRunningOnly = !showRunningOnly;
    hiddenCommandIds = [];
    fetchCommands(showRunningOnly);
});

window.addEventListener('resize', adjustOutputHeight);
window.addEventListener('load', () => {
    initResizer();
    fetchCommands();
    adjustOutputHeight();
    setInterval(fetchCommands, 5000);
});

