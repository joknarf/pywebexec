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

let currentCommandId = null;
let outputInterval = null;
let nextOutputLink = null;
let fullOutput = '';
let outputLength = 0;
let slider = null;
let isPaused = false;
const toggleButton = document.getElementById('toggleFetch');
const pausedMessage = document.getElementById('pausedMessage');

function getTokenParam() {
    const urlParams = new URLSearchParams(window.location.search);
    return urlParams.get('token') ? `?token=${urlParams.get('token')}` : '';
}
const urlToken = getTokenParam();

function extractTitle(output) {
    const titleindex = output.lastIndexOf('\x1b]0;');
    if (titleindex < 0) return null;
    const endindex = output.slice(titleindex+4).indexOf('\x07');
    if (endindex < 0) return null;
    return output.slice(titleindex+4, titleindex+4+endindex);
}

async function fetchOutput(url) {
    if (isPaused) return;
    try {
        const response = await fetch(url);
        if (!response.ok) {
            document.getElementById('dimmer').style.display = 'none';
            return;
        }
        const data = await response.json();
        if (data.error) {
            terminal.write(data.error);
            clearInterval(outputInterval);
        } else {
            if (data.cols) {
                terminal.resize(data.cols, terminal.rows);
            } else fitAddon.fit();
            percentage = slider.value;
            fullOutput += data.output;
            if (fullOutput.length > maxSize)
                fullOutput = fullOutput.slice(-maxSize);
            if (percentage == 100)
                terminal.write(data.output);
            else {
                percentage = Math.round((outputLength * 100)/fullOutput.length);
                slider.value = percentage;
                document.getElementById('outputPercentage').innerText = `${percentage}%`;
            }
            nextOutputLink = data.links.next;
            if (data.status != 'running') {
                document.title = document.title.replace('[running]',`[${data.status}]`);
                clearInterval(outputInterval);
                toggleButton.style.display = 'none';
            } else {
                toggleButton.style.display = 'block';
                const title = extractTitle(data.output);
                if (title) {
                    document.title = `${title} - [running]`;
                }
            }
        }
    } catch (error) {
        document.getElementById('dimmer').style.display = 'block';
        console.log('Error fetching output:', error);
    }
}

async function viewOutput(command_id) {
    slider.value = 100;
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
    fitAddon.fit();
    sliderUpdateOutput();
}

function sliderUpdateOutput() {
    const percentage = slider.value;
    outputLength = Math.floor((fullOutput.length * percentage) / 100);
    const limitedOutput = fullOutput.slice(0, outputLength);
    terminal.clear();
    terminal.reset();
    terminal.write(limitedOutput);
    document.getElementById('outputPercentage').innerText = `${percentage}%`;
}

function toggleFetchOutput() {
    if (isPaused) {
        slider.value = 100;
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

toggleButton.addEventListener('click', toggleFetchOutput);

window.addEventListener('resize', adjustOutputHeight);
window.addEventListener('load', () => {
    slider = document.getElementById('outputSlider');
    slider.addEventListener('input', sliderUpdateOutput);
    const commandId = window.location.pathname.split('/').slice(-1)[0];
    viewOutput(commandId);
});

document.getElementById('decreaseFontSize').addEventListener('click', () => {
    fontSize = Math.max(8, fontSize - 1);
    terminal.options.fontSize = fontSize;
    fitAddon.fit();
});

document.getElementById('increaseFontSize').addEventListener('click', () => {
    fontSize = Math.min(32, fontSize + 1);
    terminal.options.fontSize = fontSize;
    fitAddon.fit();
});
