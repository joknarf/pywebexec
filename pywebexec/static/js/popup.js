const maxScrollback = 99999;
const maxSize = 10485760; // 10MB
let fontSize = 14;
let terminal = new Terminal({
    cursorBlink: false,
    cursorInactiveStyle: 'none',
    disableStdin: true,
    convertEol: true,
    fontFamily: 'Consolas NF, monospace, courier-new, courier',
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
});

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
terminal.onSelectionChange(() => {
    const selectionText = terminal.getSelection();
    if (selectionText) {
        navigator.clipboard.writeText(selectionText).catch(err => {
            console.error('Failed to copy text to clipboard:', err);
        });
    }
});


let currentCommandId = null;
let outputInterval = null;
let nextOutputLink = null;
let fullOutput = '';
let outputLength = 0;
let slider = null;
let isPaused = false;
let cols = 0;
let rows = 0;
let fitWindow = false;

const toggleButton = document.getElementById('toggleFetch');
const pausedMessage = document.getElementById('pausedMessage');
const toggleFitButton = document.getElementById('toggleFit');

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


function setCommandStatus(status) {
    document.getElementById("commandStatus").className = `status-icon status-${status}`;
}


async function fetchOutput(url) {
    if (isPaused) return;
    try {
        const response = await fetch(url);
        if (!response.ok) {
            document.getElementById('dimmer').style.display = 'block';
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
                autoFit(false);
            }
            percentage = slider.value;
            fullOutput += data.output;
            if (fullOutput.length > maxSize)
                fullOutput = fullOutput.slice(-maxSize);
            if (percentage == 1000)
                terminal.write(data.output);
            else {
                percentage = Math.round((outputLength * 1000)/fullOutput.length);
                slider.value = percentage;
                document.getElementById('outputPercentage').innerText = `${Math.floor(percentage/10)}%`;
            }
            nextOutputLink = data.links.next;
            if (data.status != 'running') {
                clearInterval(outputInterval);
                document.title = document.title.replace('[running]',`[${data.status}]`);
                toggleButton.style.display = 'none';
                setCommandStatus(data.status)
            } else {
                toggleButton.style.display = 'block';
                setCommandStatus(data.status)
            }
            document.getElementById('dimmer').style.display = 'none';
        }
    } catch (error) {
        document.getElementById('dimmer').style.display = 'block';
        console.log('Error fetching output:', error);
    }
}

async function viewOutput(command_id) {
    slider.value = 1000;
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
        const commandInfo = document.getElementById('commandInfo');
        const command = `${data.command.replace(/^\.\//, '')} ${data.params.join(' ')}`;
        setCommandStatus(data.status);
        commandInfo.innerText = command;
        commandInfo.setAttribute('title', command);
        document.title = `${data.command} ${data.params.join(' ')} - [${data.status}]`;
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
    } catch (error) {
        console.log('Error viewing output:', error);
    }
}

function adjustOutputHeight() {
    const outputDiv = document.getElementById('output');
    const windowHeight = window.innerHeight;
    const outputTop = outputDiv.getBoundingClientRect().top;
    const maxHeight = windowHeight - outputTop - 60; // Adjusted for slider height
    outputDiv.style.height = `${maxHeight}px`;
    autoFit();
}

function sliderUpdateOutput() {
    const percentage = slider.value / 10;
    outputLength = Math.floor((fullOutput.length * percentage) / 100);
    const limitedOutput = fullOutput.slice(0, outputLength);
    terminal.clear();
    terminal.reset();
    terminal.write(limitedOutput);
    document.getElementById('outputPercentage').innerText = `${Math.floor(percentage)}%`;
}

function toggleFetchOutput() {
    if (isPaused) {
        slider.value = 1000;
        document.getElementById('outputPercentage').innerText = '100%';
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
window.addEventListener('resize', adjustOutputHeight);
window.addEventListener('load', () => {
    slider = document.getElementById('outputSlider');
    slider.addEventListener('input', sliderUpdateOutput);
    adjustOutputHeight();
    const commandId = window.location.pathname.split('/').slice(-1)[0];
    viewOutput(commandId);
});

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
