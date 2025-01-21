// commands.js
let commandInput = document.getElementById('commandName');
let paramsInput = document.getElementById('params');
let commandListSelect = document.getElementById('commandList');
let showCommandListButton = document.getElementById('showCommandListButton');
let isHandlingKeydown = false;

function unfilterCommands() {
    const options = commandListSelect.options;
    for (let i = 0; i < options.length; i++) {
        options[i].style.display = 'block';
    }
    commandListSelect.size = Math.min(20, commandListSelect.options.length);
}

function filterCommands() {
    const value = commandInput.value.slice(0, commandInput.selectionStart);
    const options = commandListSelect.options;
    let nbVisibleItems = 0;
    for (let i = 0; i < options.length; i++) {
        if (options[i].text.startsWith(value)) {
            options[i].style.display = 'block';
            nbVisibleItems += 1;
        } else {
            options[i].style.display = 'none';
        }
    }
    if (nbVisibleItems > 1) {
        commandListSelect.size = Math.min(20, nbVisibleItems);
        commandListSelect.style.display = 'block';
    } else {
        commandListSelect.style.display = 'none';
    }
}

function setCommandListPosition() {
    const rect = commandInput.getBoundingClientRect();
    commandListSelect.style.left = `${rect.left}px`;
    commandListSelect.style.top = `${rect.bottom}px`;
}

function adjustInputWidth(input) {
    input.style.width = 'auto';
    input.style.width = `${input.scrollWidth}px`;
}


paramsInput.addEventListener('input', () => adjustInputWidth(paramsInput));
commandInput.addEventListener('input', () => {
    adjustInputWidth(commandInput);
    filterCommands(); // Filter commands on input
});

paramsInput.addEventListener('mouseover', () => {
    paramsInput.focus();
    paramsInput.setSelectionRange(0, paramsInput.value.length);
});

commandInput.addEventListener('mouseover', () => {
    commandInput.focus();
    commandInput.setSelectionRange(0, commandInput.value.length);
});

commandInput.addEventListener('input', (event) => {
    if (event.inputType === 'deleteContentBackward') {
        const newValue = commandInput.value.slice(0, -1);
        commandInput.value = newValue;
        commandInput.setSelectionRange(newValue.length, newValue.length);
    }
    const value = commandInput.value;
    const options = commandListSelect.options;
    if (value) {
        const match = Array.from(options).find(option => option.text.startsWith(value));
        if (match) {
            commandInput.value = match.text;
            commandInput.setSelectionRange(value.length, match.text.length);
        } else {
            commandInput.value = value.slice(0, -1);
        }
    }
    filterCommands();
    adjustInputWidth(commandInput); // Adjust width on input
});

commandInput.addEventListener('keydown', (event) => {
    if (event.key === ' ' || event.key === 'ArrowRight') {
        event.preventDefault();
        paramsInput.focus();
        paramsInput.setSelectionRange(0, paramsInput.value.length);
    } else if (event.key === 'ArrowDown') {
        /*setCommandListPosition();*/
        unfilterCommands();
        if (commandListSelect.options.length > 1) {
            commandListSelect.style.display = 'block';
            commandListSelect.focus();
            commandListSelect.selectedIndex = 0;
        }
        event.preventDefault();
    }
});

paramsInput.addEventListener('keydown', (event) => {
    if (paramsInput.selectionStart > 0) return;
    if (event.key === 'ArrowLeft') {
        commandInput.focus();
        commandInput.setSelectionRange(0, commandInput.value.length);
        event.preventDefault();
        return;
    }
    if (event.key === 'Backspace') {
        val = paramsInput.value
        paramsInput.value = val.slice(0, paramsInput.selectionStart) + val.slice(paramsInput.selectionEnd)
        commandInput.focus();
        commandInput.setSelectionRange(0, commandInput.value.length);
        event.preventDefault();
    }
});

commandListSelect.addEventListener('keydown', (event) => {
    if (event.key === 'Enter') {
        event.preventDefault(); // Prevent form submission
        const selectedOption = commandListSelect.options[commandListSelect.selectedIndex];
        commandInput.value = selectedOption.text;
        commandListSelect.style.display = 'none';
        adjustInputWidth(commandInput);
        paramsInput.focus();
        return;
    }
    if (event.key === 'ArrowUp' && commandListSelect.selectedIndex == 0) {
        commandInput.focus();
        commandListSelect.style.display = 'none'
    }
});

commandListSelect.addEventListener('click', (event) => {
    event.preventDefault(); // Prevent form submission
    const selectedOption = commandListSelect.options[commandListSelect.selectedIndex];
    commandInput.value = selectedOption.text;
    commandListSelect.style.display = 'none';
    adjustInputWidth(commandInput);
    paramsInput.focus();
});


commandInput.addEventListener('click', () => {
    setCommandListPosition();
    if (commandListSelect.style.display == 'none')
        commandListSelect.style.display = 'block';
    else
        commandListSelect.style.display = 'none';
    filterCommands();
});

commandInput.addEventListener('blur', (event) => {
    if (event.relatedTarget === showCommandListButton || event.relatedTarget === commandListSelect) {
        event.preventDefault();
        return;
    }
    commandListSelect.style.display = 'none';
    adjustInputWidth(commandInput);
});

showCommandListButton.addEventListener('click', (event) => {
    event.preventDefault();
    setCommandListPosition();
    unfilterCommands();
    if (commandListSelect.style.display == 'none')
        commandListSelect.style.display = 'block';
    else
        commandListSelect.style.display = 'none';
});

window.addEventListener('click', (event) => {
    if (!commandInput.contains(event.target) && !commandListSelect.contains(event.target) && !showCommandListButton.contains(event.target)) {
        commandListSelect.style.display = 'none';
    }
});

window.addEventListener('keydown', (event) => {
    if ([commandInput, paramsInput, commandListSelect].includes(document.activeElement)) return;
    if (event.code === `Key${event.key.toUpperCase()}`) {
        commandInput.focus();
        commandInput.dispatchEvent(new KeyboardEvent('keydown', event));
    }
});

window.addEventListener('resize', () => {
    setCommandListPosition();
});

window.addEventListener('load', () => {
    fetchExecutables();
    adjustInputWidth(paramsInput); // Adjust width on load
    adjustInputWidth(commandInput); // Adjust width on load
    setCommandListPosition();
});

async function fetchExecutables() {
    try {
        const response = await fetch(`/executables${urlToken}`);
        if (!response.ok) {
            throw new Error('Failed to fetch command status');
        }
        const executables = await response.json();
        commandListSelect.innerHTML = '';
        executables.forEach(executable => {
            const option = document.createElement('option');
            option.className = 'command-item';
            option.text = executable;
            commandListSelect.appendChild(option);
        });
    } catch (error) {
        alert("Failed to fetch executables");
    }
    commandListSelect.size = Math.min(20, commandListSelect.options.length);
    if (commandListSelect.options.length == 1) {
        commandInput.value = commandListSelect.options[0].text;
        showCommandListButton.style.display = 'none';
    }
    if (commandListSelect.options.length == 0)
        document.getElementById('launchForm').style.display = 'none';

}
