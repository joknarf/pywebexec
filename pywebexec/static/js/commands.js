// commands.js
let commandInput = document.getElementById('command');
let paramsInput = document.getElementById('params');
let commandListDiv = document.getElementById('commandList');
let showCommandListButton = document.getElementById('showCommandListButton');
let isHandlingKeydown = false;
let firstVisibleItem = 0;

function unfilterCommands() {
    const items = commandListDiv.children;
    for (let i = 0; i < items.length; i++) {
        items[i].style.display = 'block';
    }
    commandListDiv.style.display = 'block';
}

function filterCommands() {
    const value = commandInput.value.slice(0, commandInput.selectionStart);
    const items = commandListDiv.children;
    let nbVisibleItems = 0;
    firstVisibleItem = -1;
    for (let i = 0; i < items.length; i++) {
        if (items[i].textContent.startsWith(value)) {
            items[i].style.display = 'block';
            nbVisibleItems += 1;
            if (firstVisibleItem === -1) {
                firstVisibleItem = i;
            }
        } else {
            items[i].style.display = 'none';
        }
    }
    if (nbVisibleItems > 1) {
        commandListDiv.style.display = 'block';
    } else {
        commandListDiv.style.display = 'none';
    }
}

function setCommandListPosition() {
    const rect = commandInput.getBoundingClientRect();
    commandListDiv.style.left = `${rect.left}px`;
    commandListDiv.style.top = `${rect.bottom}px`;
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
    const options = commandListDiv.children;
    if (value) {
        const match = Array.from(options).find(option => option.textContent.startsWith(value));
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

commandInput.addEventListener('keydown', (event) => {
    if (event.key === ' ' || event.key === 'ArrowRight' || event.key === 'Tab') {
        event.preventDefault();
        paramsInput.focus();
        paramsInput.setSelectionRange(0, paramsInput.value.length);
        commandListDiv.style.display = 'none'
    } else if (event.key === 'ArrowDown') {
        if (commandListDiv.children.length > 1) {
            commandListDiv.style.display = 'block';
            commandListDiv.children[firstVisibleItem].focus();
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

commandListDiv.addEventListener('keydown', (event) => {
    const items = Array.from(commandListDiv.children);
    const currentIndex = items.indexOf(document.activeElement);

    if (event.key === 'Escape') {
        commandInput.focus();
        commandListDiv.style.display = 'none';
    }else if (event.key === 'ArrowDown') {
        event.preventDefault();
        const nextIndex = (currentIndex + 1) % items.length;
        items[nextIndex].focus();
    } else if (event.key === 'ArrowUp') {
        event.preventDefault();
        if (currentIndex === 0 || items[currentIndex-1].style.display == 'none') {
            commandInput.focus();
            commandListDiv.style.display = 'none';
        } else {
            const prevIndex = (currentIndex - 1 + items.length) % items.length;
            items[prevIndex].focus();
        }
    } else if (event.key === 'Enter' || event.key === 'Tab' || event.key === ' ') {
        event.preventDefault(); // Prevent form submission
        const selectedOption = document.activeElement;
        if (selectedOption.classList.contains('command-item')) {
            commandInput.value = selectedOption.textContent;
            commandListDiv.style.display = 'none';
            adjustInputWidth(commandInput);
            paramsInput.focus();
        }
    }
});

commandListDiv.addEventListener('click', (event) => {
    event.preventDefault(); // Prevent form submission
    const selectedOption = event.target;
    if (selectedOption.classList.contains('command-item')) {
        commandInput.value = selectedOption.textContent;
        commandListDiv.style.display = 'none';
        adjustInputWidth(commandInput);
        paramsInput.focus();
    }
});


commandInput.addEventListener('click', () => {
    setCommandListPosition();
    if (commandListDiv.style.display == 'none')
        commandListDiv.style.display = 'block';
    else
        commandListDiv.style.display = 'none';
    filterCommands();
});

commandInput.addEventListener('blur', (event) => {
    if (event.relatedTarget === showCommandListButton || event.relatedTarget === commandListDiv || event.relatedTarget.classList.includes('command-item')) {
        event.preventDefault();
        return;
    }
    commandListDiv.style.display = 'none';
    adjustInputWidth(commandInput);
});

showCommandListButton.addEventListener('click', (event) => {
    event.preventDefault();
    setCommandListPosition();
    unfilterCommands();
});

window.addEventListener('click', (event) => {
    if (!commandInput.contains(event.target) && !commandListDiv.contains(event.target) && !showCommandListButton.contains(event.target)) {
        commandListDiv.style.display = 'none';
    }
});

window.addEventListener('keydown', (event) => {
    if ([commandInput, paramsInput, commandListDiv].includes(document.activeElement)) return;
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
        commandListDiv.innerHTML = '';
        executables.forEach(executable => {
            const div = document.createElement('div');
            div.className = 'command-item';
            div.textContent = executable;
            div.tabIndex = 0; // Make the div focusable
            commandListDiv.appendChild(div);
        });
    } catch (error) {
        alert("Failed to fetch executables");
    }
    if (commandListDiv.children.length == 1) {
        commandInput.value = commandListDiv.children[0].textContent;
        showCommandListButton.style.display = 'none';
    }
    if (commandListDiv.children.length == 0)
        document.getElementById('launchForm').style.display = 'none';

}
