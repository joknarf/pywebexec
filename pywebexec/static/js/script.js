let currentCommandId = null;
let outputInterval = null;
let nextOutputLink = null;
let slider = document.getElementById('outputSlider');
let outputPercentage = document.getElementById('outputPercentage');
let fullOutput = '';
let outputLength = 0;
const maxScrollback = 99999;
const maxSize = 10485760; // 10MB
let fontSize = +localStorage.getItem('fontSize') || 14;
let isPaused = false;
let showRunningOnly = false;
let hiddenCommandIds = [];
let fitWindow = localStorage.getItem('fitWindow') === 'false' ? false : true;
let cols = 0;
let rows = 0;

function initTerminal()
{
    return new Terminal({
        cursorBlink: false,
        cursorInactiveStyle: 'none',
        disableStdin: true,
        //convertEol: true,
        scrollback: maxScrollback,
        fontFamily: '"CommitMono Nerd Font Mono", "Fira Code", monospace, "Powerline Extra Symbols", courier-new, courier',
        fontSize: fontSize,
        letterSpacing: 0,
        lineHeight: 1.1,
        fontWeightBold: 500,
        //fontWeight: 400,
        screenReaderMode: true,
        theme: {
            background: '#111412',
            foreground: '#d7d7d7',
            white: '#d7d7d7',
            black: '#111412',
            green: '#0d8657',
            blue: "#2760aa",
            red: '#aa1e0f',
            yellow: "#cf8700",
            magenta: "#4c3d80",
            cyan: "#3b8ea7",
            brightWhite: '#efefef',
            brightBlack: "#243C4F",
            brightBlue: "#5584b1",
            brightGreen: "#18Ed93",
            brightRed: "#e53a40",
            brightYellow: "#dedc12",
            brightMagenta: "#9b7baf",
            brightCyan: "#6da9bc",
        },
        customGlyphs: true,
        rescaleOverlappingGlyphs: true,
        allowProposedApi: true,
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

UnicodeGraphemesAddon = new UnicodeGraphemesAddon.UnicodeGraphemesAddon();
terminal.loadAddon(UnicodeGraphemesAddon);

const fitAddon = new FitAddon.FitAddon();
terminal.loadAddon(fitAddon);
terminal.open(document.getElementById('output'));
fitAddon.fit();

terminal.onTitleChange((title) => {
    document.getElementById('commandInfo').innerText = title;
})

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


document.getElementById('launchForm').addEventListener('submit', async (event) => {
    event.preventDefault();
    const commandName = commandInput.value;
    const params = paramsInput.value.split(' ');
    fitAddon.fit();
    terminal.clear();
    try {
        const response = await fetch(`/commands`, {
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
        const response = await fetch(`/commands`);
        if (!response.ok) {
            document.getElementById('dimmer').style.display = 'block';
            return;
        }
        // Adapt to the new result structure:
        const data = await response.json();
        const commands = data.commands;
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
            if (command.status === 'running') runningCommands.push(command.command.replace(/^\.[\\/]/, ''));
            commandRow.innerHTML = `
                <td class="monospace">
                    ${navigator.clipboard == undefined ? `${command.command_id.slice(0, 8)}` : `<span class="copy_clip" onclick="copyToClipboard('${command.command_id}', this, event)">${command.command_id.slice(0, 8)}</span>`}
                </td>
                <td>${formatTime(command.start_time)}</td>
                <td>${command.status === 'running' ? formatDuration(command.start_time, new Date().toISOString()) : formatDuration(command.start_time, command.end_time)}</td>
                <td><span class="status-icon status-${command.status}"></span>${command.status}${command.status === 'failed' ? ` (${command.exit_code})` : ''}</td>
                <td align="center">
                    ${command.command.startsWith('term') ? '' : command.status === 'running' ? `<button class="stop" onclick="stopCommand('${command.command_id}', event)">Stop</button>` : `<button class="run" onclick="relaunchCommand('${command.command_id}', event)">Run</button>`}
                </td>
                <td title="${command.user == '-' ? '' : command.user}"><span class="command-line">${command.command.replace(/^\.[\\/]/, '')}</span></td>
                <td class="monospace outcol">
                    <button class="popup-button" onclick="openPopup('${command.command_id}', event)"></button>
                    ${command.last_output_line || ''}
                </td>
            `;
            commandsTbody.appendChild(commandRow);
            const commandsTable = document.getElementById('commandsTable');
        });
        if (runningCommands.length) {
            const thStatus = document.getElementById('statusRunning');
            thStatus.innerHTML = `Running  <span class="status-icon status-running"></span><span class="system-font nbrunning">${runningCommands.length}</span>`;
            thStatus.setAttribute('title', runningCommands.join("\n"));
        } else {
            const thStatus = document.getElementById('statusRunning');
            thStatus.innerHTML = `Status  <span class="status-icon status-norun"></span>`;
            thStatus.setAttribute('title', "no command running");
        }
        // Apply filters after table update
        applyFilters(document.getElementById('commandsTable'));
        document.getElementById('dimmer').style.display = 'none';
    } catch (error) {
        console.log('Error fetching commands:', error);
        document.getElementById('dimmer').style.display = 'block';
    }
}

function extractHtml(text) {
    const match = text.match(/<html[\s\S]*?<\/html>/);
    return match ? match[0] : null;
}

async function fetchOutput(url) {
    if (isPaused) return;
    try {
        document.getElementById('output').classList.remove('outputhtml');
        const response = await fetch(url);
        if (!response.ok) return;
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

            if (data.status != 'running') {
                if (data.status === 'success') {
                    const htmlContent = extractHtml(fullOutput);
                    if (htmlContent) {
                        document.getElementById('output').innerHTML = htmlContent;
                        document.getElementById('output').classList.add('outputhtml');
                        const table = document.getElementById('output').querySelector('table');
                        if (table != undefined && table != null) {
                            initTableFilters(table);
                        }
                    } else {
                        if (slider.value == 1000)
                            terminal.write(data.output);
                        else {
                            percentage = Math.round((outputLength * 1000)/fullOutput.length);
                            slider.value = percentage;
                            outputPercentage.innerText = `${Math.floor(percentage/10)}%`;
                        }
                    }
                } else {
                    if (slider.value == 1000)
                        terminal.write(data.output);
                    else {
                        percentage = Math.round((outputLength * 1000)/fullOutput.length);
                        slider.value = percentage;
                        outputPercentage.innerText = `${Math.floor(percentage/10)}%`;
                    }
                }
            } else {
                if (slider.value == 1000)
                    terminal.write(data.output);
                else {
                    percentage = Math.round((outputLength * 1000)/fullOutput.length);
                    slider.value = percentage;
                    outputPercentage.innerText = `${Math.floor(percentage/10)}%`;
                }
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
    nextOutputLink = `/commands/${command_id}/output`;
    clearInterval(outputInterval);
    terminal.clear();
    terminal.reset();
    fullOutput = '';
    try {
        const response = await fetch(`/commands/${command_id}`);
        if (!response.ok) {
            outputInterval = setInterval(() => fetchOutput(nextOutputLink), 500);
        }
        const data = await response.json();
        const commandInfo = document.getElementById('commandInfo');
        if (data.command.endsWith('/run-para')) {
            command = `${data.params.join(' ').replace(/^.* -- run .\//, 'batch ')}`;
        } else {
            command = `${data.command.replace(/^\.[\\/]/, '')} ${data.params.join(' ')}`;
        }
        setCommandStatus(data.status)
        commandInfo.innerHTML = command;
        commandInfo.setAttribute('title', command);
        if (data.command == 'term')
            terminal.options.cursorInactiveStyle = 'outline';
        else
            terminal.options.cursorInactiveStyle = 'none';
        if (data.status === 'running') {
            fetchOutput(nextOutputLink);
            outputInterval = setInterval(() => fetchOutput(nextOutputLink), 500);
            toggleButton.style.display = 'block';
            document.getElementById('output').innerHTML = '';
            document.getElementById('output').appendChild(terminal.element);
        } else {
            const outputResponse = await fetch(nextOutputLink);
            const outputData = await outputResponse.json();
            const output = outputData.output;
            document.getElementById('output').classList.remove('outputhtml');
            document.getElementById('output').innerHTML = '';
            document.getElementById('output').appendChild(terminal.element);
            if (data.status === 'success') {
                const htmlContent = extractHtml(output);
                if (htmlContent) {
                    document.getElementById('output').innerHTML = htmlContent;
                    document.getElementById('output').classList.add('outputhtml');
                    const table = document.getElementById('output').querySelector('table');
                    console.log(table);
                    if (table != undefined && table != null) {
                        initTableFilters(table);
                    }
                } else {
                    terminal.write(output);
                }
            } else {
                terminal.write(output);
            }
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
    const popupUrl = `/commands/${command_id}/popup`;
    window.open(popupUrl, '_blank', 'width=1000,height=600');
}

async function relaunchCommand(command_id, event) {
    event.stopPropagation();
    event.stopImmediatePropagation();
    try {
        fitAddon.fit();
        terminal.clear();
        const relaunchResponse = await fetch(`/commands/${command_id}/run`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                rows: terminal.rows,
                cols: terminal.cols
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
        const response = await fetch(`/commands/${command_id}/stop`, {
            method: 'PATCH'
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
    tableContainer.style.height = localStorage.getItem('tableHeight');
    adjustOutputHeight();
    
    resizer.addEventListener('mousedown', (e) => {
        startY = e.clientY;
        startHeight = parseInt(document.defaultView.getComputedStyle(tableContainer).height, 10);
        document.documentElement.addEventListener('mousemove', doDrag, false);
        document.documentElement.addEventListener('mouseup', stopDrag, false);
    });

    function doDrag(e) {
        tableContainer.style.height = `${startHeight + e.clientY - startY}px`;
        localStorage.setItem('tableHeight', tableContainer.style.height);
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
    localStorage.setItem('fontSize', fontSize);
    autoFit();
});

document.getElementById('increaseFontSize').addEventListener('click', () => {
    fontSize = Math.min(32, fontSize + 1);
    terminal.options.fontSize = fontSize;
    localStorage.setItem('fontSize', fontSize);
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

function setFitIcon()
{
    if (fitWindow) {
        toggleFitButton.classList.remove('fit-window');
        toggleFitButton.classList.add('fit-tty');
        toggleFitButton.setAttribute('title', 'terminal fit tty');
    } else {
        toggleFitButton.classList.remove('fit-tty');
        toggleFitButton.classList.add('fit-window');
        toggleFitButton.setAttribute('title', 'terminal fit window');
    }     
}

function toggleFit() {
    fitWindow = ! fitWindow;
    setFitIcon();
    localStorage.setItem('fitWindow', fitWindow);
    autoFit();
    viewOutput(currentCommandId);
}

toggleButton.addEventListener('click', toggleFetchOutput);
toggleFitButton.addEventListener('click', toggleFit);
setFitIcon();

document.getElementById('statusRunning').addEventListener('click', () => {
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

