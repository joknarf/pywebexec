function initTableFilters() {
    const headers = document.querySelectorAll('#commandsTable thead th');
    headers.forEach((header, index) => {
        if (index !== 4) { // Skip Action column
            const input = document.createElement('input');
            input.type = 'search';
            input.className = 'column-filter';
            input.placeholder = '\u2315';
            // input.placeholder = ' ';
            input.addEventListener('input', applyFilters);
            header.appendChild(input);
        }
    });
}

function applyFilters() {
    const rows = document.querySelectorAll('#commands tr');
    const filters = Array.from(document.querySelectorAll('.column-filter'))
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

document.addEventListener('DOMContentLoaded', initTableFilters);
