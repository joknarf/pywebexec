// commands.js
let commandInput = document.getElementById('command');
let paramsInput = document.getElementById('params');
let commandListDiv = document.getElementById('commandList');
let showCommandListButton = document.getElementById('showCommandListButton');
let isHandlingKeydown = false;
let firstVisibleItem = 0;
let gExecutables = {};
let helpDiv = document.getElementById('paramsHelp');
let paramsContainer = document.getElementById('paramsContainer');
let schemaFormPW = document.getElementById('schemaForm');

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
    if (nbVisibleItems > 1 || commandInput.value.length == 0) {
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

// Update helpDiv position relative to paramsInput
function setHelpDivPosition() {
    const rect = commandInput.getBoundingClientRect();
    paramsContainer.style.left = `${rect.left}px`;
    paramsContainer.style.top = `${rect.bottom + 2}px`;
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
        paramsContainer.style.display = 'none';
        paramsInput.focus();
        paramsInput.setSelectionRange(0, paramsInput.value.length);
        commandListDiv.style.display = 'none'
    } else if (event.key === 'ArrowDown') {
        if (commandListDiv.children.length > 1) {
            paramsContainer.style.display = 'none';
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
    if (
        event.relatedTarget === showCommandListButton ||
        event.relatedTarget === commandListDiv ||
        (event.relatedTarget && event.relatedTarget.classList && event.relatedTarget.classList.contains('command-item'))
    ) {
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
    if (!paramsContainer.contains(event.target) && !commandListDiv.contains(event.target) && !paramsInput.contains(event.target)) {
        paramsContainer.style.display = 'none';
    }

});

// window.addEventListener('keydown', (event) => {
//     if ([commandInput, paramsInput, commandListDiv].includes(document.activeElement)) return;
//     if (event.code === `Key${event.key.toUpperCase()}`) {
//         commandInput.focus();
//         commandInput.dispatchEvent(new KeyboardEvent('keydown', event));
//     }
// });

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
        const response = await fetch(`/commands/exposed`);
        if (!response.ok) {
            throw new Error('Failed to fetch executables');
        }
        const data = await response.json();
        // Build mapping from executable name to its object
        gExecutables = {};
        commandListDiv.innerHTML = '';
        data.commands.forEach(exeObj => {
            gExecutables[exeObj.command] = exeObj;
            const div = document.createElement('div');
            div.className = 'command-item';
            div.textContent = exeObj.command;
            div.tabIndex = 0;
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


paramsInput.addEventListener('focus', () => {
    const currentCmd = commandInput.value;
    paramsInput.name = currentCmd;
    if (paramsContainer.style.display == 'none') {
        $('#schemaForm').html('');
    }
    if (gExecutables[currentCmd] && gExecutables[currentCmd].schema && gExecutables[currentCmd].schema.properties && paramsContainer.style.display == 'none') {
        createSchemaForm($('#schemaForm'), gExecutables[currentCmd].schema, async function (errors, values) {
            if (errors) {
                console.log(errors);
                alert(errors[0].message);
                return false;
            } else {
                const commandName = commandInput.value;
                fitAddon.fit();
                terminal.clear();
                payload = { params: values, rows: terminal.rows, cols: terminal.cols }
                if ('parallel' in values) {
                    payload['parallel'] = values['parallel'];
                    payload['delay'] = values['delay'];
                    delete payload['params']['parallel'];
                    delete payload['params']['delay'];
                }
                try {
                    const response = await fetch(`/commands/${commandName}`, {
                        method: 'POST',
                        headers: {
                            'Content-Type': 'application/json'
                        },
                        body: JSON.stringify(payload)
                    });
        
                    if (!response.ok) {
                        throw new Error('Failed to launch command');
                    }
        
                    const data = await response.json();
                    viewOutput(data.command_id);
                    fetchCommands();
                    commandInput.focus();
                    commandInput.setSelectionRange(0, commandInput.value.length);
                } catch (error) {
                    console.log('Error running command:', error);
                }
            }
        });
        setHelpDivPosition();
        paramsContainer.style.display = 'block';
        const input1 = schemaFormPW.querySelector('input, select, textarea');
        if (input1) {
            input1.focus();
        }
    } else {
        paramsContainer.style.display = 'none';
    }
    if (gExecutables[currentCmd] && gExecutables[currentCmd].help) {
        helpDiv.innerHTML = marked.parse(gExecutables[currentCmd].help);
        setHelpDivPosition();
        paramsContainer.style.display = 'block';
    } else {
        paramsContainer.style.display = 'none';
    }
});

paramsInput.addEventListener('blur', () => {
    //paramsContainer.style.display = 'none';
});

window.addEventListener('resize', setHelpDivPosition);
window.addEventListener('scroll', setHelpDivPosition);

schemaFormPW.addEventListener('submit', (event) => {
    paramsContainer.style.display = 'none';
    event.preventDefault();
});