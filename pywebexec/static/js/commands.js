// commands.js
let commandInput = document.getElementById('commandName');
let paramsInput = document.getElementById('params');
let commandListDiv = document.getElementById('commandList');
let showCommandListButton = document.getElementById('showCommandListButton');

function filterCommands() {
    const value = commandInput.value;
    const items = commandListDiv.getElementsByClassName('command-item');
    let hasVisibleItems = false;
    Array.from(items).forEach(item => {
        if (item.textContent.startsWith(value)) {
            item.style.display = 'block';
            hasVisibleItems = true;
        } else {
            item.style.display = 'none';
        }
    });
    commandListDiv.style.display = hasVisibleItems ? 'block' : 'none';
    if (hasVisibleItems) {
        commandListDiv.classList.add('show');
    } else {
        commandListDiv.classList.remove('show');
    }
    adjustCommandListWidth(); // Adjust width after filtering commands
}

function setCommandListPosition() {
    const rect = commandInput.getBoundingClientRect();
    commandListDiv.style.left = `${rect.left}px`;
    commandListDiv.style.top = `${rect.bottom}px`;
    commandListDiv.style.minWidth = `${rect.width}px`;
}

function adjustInputWidth(input) {
    input.style.width = 'auto';
    input.style.width = `${input.scrollWidth}px`;
}

function adjustCommandListWidth() {
    commandListDiv.style.width = 'auto'; // Reset width before recalculating
    const items = Array.from(commandListDiv.getElementsByClassName('command-item'));
    let maxWidth = 0;
    items.forEach(item => {
        if (item.style.display !== 'none') {
            const itemWidth = item.scrollWidth;
            if (itemWidth > maxWidth) {
                maxWidth = itemWidth;
            }
        }
    });
    commandListDiv.style.width = `${maxWidth}px`;
}

paramsInput.addEventListener('input', () => adjustInputWidth(paramsInput));
commandInput.addEventListener('input', () => {
    adjustInputWidth(commandInput);
    filterCommands(); // Filter commands on input
});

paramsInput.addEventListener('mouseover', () => {
    console.log('Mouse over params');
    paramsInput.focus();
    paramsInput.setSelectionRange(0, paramsInput.value.length);
});

commandInput.addEventListener('mouseover', () => {
    console.log('Mouse over input');
    commandInput.focus();
    commandInput.setSelectionRange(0, commandInput.value.length);
});

commandInput.addEventListener('input', (event) => {
    console.log('Input event:', event);
    if (event.inputType === 'deleteContentBackward') {
        const newValue = commandInput.value.slice(0, -1);
        commandInput.value = newValue;
        commandInput.setSelectionRange(newValue.length, newValue.length);
    }
    const value = commandInput.value;
    const items = Array.from(commandListDiv.getElementsByClassName('command-item'));
    if (value) {
        const match = items.find(item => item.textContent.startsWith(value));
        if (match) {
            commandInput.value = match.textContent;
            commandInput.setSelectionRange(value.length, match.textContent.length);
        } else {
            commandInput.value = value.slice(0, -1);
        }
    }
    filterCommands();
    adjustInputWidth(commandInput); // Adjust width on input
});

commandInput.addEventListener('click', () => {
    console.log('Input clicked');
    setCommandListPosition();
    commandListDiv.style.display = 'block';
    filterCommands();
});

commandInput.addEventListener('keydown', (event) => {
    if (event.key === 'ArrowDown') {
        console.log('Arrow down pressed');
        setCommandListPosition();
        commandListDiv.style.display = 'block';
        filterCommands();
    }
});

commandInput.addEventListener('blur', (event) => {
    if (event.relatedTarget === showCommandListButton) {
        event.preventDefault();
        return;
    }
    console.log('Input lost focus');
    commandListDiv.style.display = 'none';
    commandListDiv.classList.remove('show');
    adjustInputWidth(commandInput);
});

showCommandListButton.addEventListener('mousedown', (event) => {
    event.preventDefault();
    console.log('Show command list button clicked');
    setCommandListPosition();
    commandListDiv.style.display = 'block';
    filterCommands();
});

window.addEventListener('click', (event) => {
    if (!commandInput.contains(event.target) && !commandListDiv.contains(event.target) && !showCommandListButton.contains(event.target)) {
        console.log('Window clicked outside input and list');
        commandListDiv.style.display = 'none';
        commandListDiv.classList.remove('show');
        adjustInputWidth(commandInput);
    }
});

window.addEventListener('resize', () => {
    console.log('Window resized');
    setCommandListPosition();
});

window.addEventListener('load', () => {
    console.log('Window loaded');
    fetchExecutables();
    adjustInputWidth(paramsInput); // Adjust width on load
    adjustInputWidth(commandInput); // Adjust width on load
    setCommandListPosition();
});

async function fetchExecutables() {
    try {
        const response = await fetch('/executables');
        if (!response.ok) {
            throw new Error('Failed to fetch command status');
        }
        const executables = await response.json();
        commandListDiv.innerHTML = '';
        executables.forEach(executable => {
            const div = document.createElement('div');
            div.className = 'command-item';
            div.textContent = executable;
            div.addEventListener('mousedown', () => {
                console.log(`Clicked on: ${executable}`);
                commandInput.value = executable;
                commandListDiv.style.display = 'none';
                commandListDiv.classList.remove('show');
                adjustInputWidth(commandInput);
                paramsInput.focus();
            });
            commandListDiv.appendChild(div);
        });
        // Ensure the elements are rendered before measuring their widths
        requestAnimationFrame(adjustCommandListWidth);
    } catch (error) {
        console.log('Error fetching executables:', error);
        alert("Failed to fetch executables");
    }
}