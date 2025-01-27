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
    customGlyphs: false,
    rescaleOverlappingGlyphs: true,
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
let title = null;
let slider = null;

function getTokenParam() {
    const urlParams = new URLSearchParams(window.location.search);
    return urlParams.get('token') ? `?token=${urlParams.get('token')}` : '';
}
const urlToken = getTokenParam();

async function fetchOutput(url) {
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
                title.innerText = `${data.status} ${title.innerText.split(' ').slice(1).join(' ')}`;
                clearInterval(outputInterval);
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
        title.innerText = `${data.status} ${data.command} ${data.params.join(' ')}`;
        if (data.command == 'term')
            terminal.options.cursorInactiveStyle = 'outline';
        else
            terminal.options.cursorInactiveStyle = 'none';
        if (data.status === 'running') {
            fetchOutput(nextOutputLink);
            outputInterval = setInterval(() => fetchOutput(nextOutputLink), 1000);
        } else {
            fetchOutput(nextOutputLink);
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


window.addEventListener('resize', adjustOutputHeight);
window.addEventListener('load', () => {
    title = document.getElementById('outputTitle');
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
