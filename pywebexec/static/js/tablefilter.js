function initTableFilters(table) {
    const headers = table.querySelectorAll('thead th');
    headers.forEach((header, index) => {
        if (index !== 4) { // Skip Action column
            const input = document.createElement('input');
            input.type = 'search';
            input.className = 'column-filter';
            input.placeholder = '\u2315';
            input.addEventListener('input', () => applyFilters(table));
            header.appendChild(input);
        }
    });
}

function applyFilters(table) {
    const rows = table.querySelectorAll('tbody tr');
    const filters = Array.from(table.querySelectorAll('.column-filter'))
        .map(filter => {
            let regexp = null;
            if (filter.value) {
                try {
                    // Test if regexp is valid
                    new RegExp(filter.value);
                    regexp = filter.value;
                } catch(e) {
                    // Invalid regexp - will use as plain text
                    regexp = null;
                }
            }
            return {
                value: filter.value,
                index: filter.parentElement.cellIndex,
                regexp: regexp
            };
        });
    
    rows.forEach(row => {
        const cells = row.cells;
        const hide = filters.some(filter => {
            if (!filter.value) return false;
            const cellText = cells[filter.index]?.innerText || '';
            if (filter.regexp) {
                // Use regexp
                return !new RegExp(filter.regexp, 'i').test(cellText);
            }
            // Fallback to plain text includes
            return !cellText.toLowerCase().includes(filter.value.toLowerCase());
        });
        row.style.display = hide ? 'none' : '';
    });
}

let commandsTable = document.querySelector('#commandsTable');
document.addEventListener('DOMContentLoaded', initTableFilters(commandsTable));
