const maxScrollback = 99999;
const maxSize = 10485760; // 10MB
let fontSize = 14;
let terminal = new Terminal({
    cursorBlink: false,
    cursorInactiveStyle: 'none',
    disableStdin: true,
    //convertEol: true,
    scrollback: maxScrollback,
    fontFamily: '"CommitMono Nerd Font Mono", monospace, courier-new, courier',
    fontSize: fontSize,
    lineHeight: 1.1,
    fontWeightBold: 500,
    letterSpacing: 0,
    customGlyphs: true,
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
    rescaleOverlappingGlyphs: true,
    allowProposedApi: true,
    screenReaderMode: true,
});

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
    nextOutputLink = `/commands/${command_id}/output`;
    clearInterval(outputInterval);
    terminal.clear();
    terminal.reset();
    fullOutput = '';
    try {
        // Updated endpoint below:
        const response = await fetch(`/commands/${command_id}`);
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
    const commandId = window.location.pathname.split('/').slice(-2)[0];
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
