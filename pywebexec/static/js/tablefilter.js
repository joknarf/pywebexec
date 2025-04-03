function initTableFilters(table) {
    const headers = table.querySelectorAll('thead th');
    headers.forEach((header, index) => {
        if (index !== 4 || table!==commandsTable) { // Skip Action column
            const headerContent = header.innerHTML;
            const contentSpan = document.createElement('span');
            contentSpan.className = 'th-content';
            
            // Add sort button first
            const sortBtn = document.createElement('span');
            sortBtn.className = 'sort-btn';
            sortBtn.innerHTML = '⇕';
            sortBtn.style.cursor = 'pointer';
            sortBtn.setAttribute('data-sort-order', '');
            sortBtn.onclick = () => toggleSort(table, index, sortBtn);
            contentSpan.appendChild(sortBtn);
            
            // Add header content after sort button
            const textSpan = document.createElement('span');
            textSpan.innerHTML = headerContent;
            contentSpan.appendChild(textSpan);
            
            header.innerHTML = '';
            header.appendChild(contentSpan);
            
            // Add filter input
            const input = document.createElement('input');
            input.type = 'search';
            input.className = 'column-filter';
            input.placeholder = '\u2315';
            input.addEventListener('input', () => applyFilters(table));
            header.appendChild(input);
        }
    });
}

function toggleSort(table, colIndex, sortBtn) {
    // Reset other sort buttons
    table.querySelectorAll('.sort-btn').forEach(btn => {
        if (btn !== sortBtn) {
            btn.setAttribute('data-sort-order', '');
            btn.innerHTML = '⇕';
        }
    });

    // Toggle sort order
    const currentOrder = sortBtn.getAttribute('data-sort-order');
    let newOrder = 'asc';
    if (currentOrder === 'asc') {
        newOrder = 'desc';
        sortBtn.innerHTML = '⇓';
    } else if (currentOrder === 'desc') {
        newOrder = '';
        sortBtn.innerHTML = '⇕';
    } else {
        sortBtn.innerHTML = '⇑';
    }
    sortBtn.setAttribute('data-sort-order', newOrder);
    sortBtn.setAttribute('data-col-index', colIndex); // Store column index on the button
    applyFilters(table);
}

function applyFilters(table) {
    const rows = Array.from(table.querySelectorAll('tbody tr'));
    const filters = Array.from(table.querySelectorAll('.column-filter'))
        .map(filter => {
            let regexp = null;
            if (filter.value) {
                try {
                    new RegExp(filter.value);
                    regexp = filter.value;
                } catch(e) {
                    regexp = null;
                }
            }
            return {
                value: filter.value,
                index: filter.parentElement.cellIndex,
                regexp: regexp
            };
        });

    // First apply filters
    const filteredRows = rows.filter(row => {
        const cells = row.cells;
        return !filters.some(filter => {
            if (!filter.value) return false;
            const cellText = cells[filter.index]?.innerText || '';
            if (filter.regexp) {
                return !new RegExp(filter.regexp, 'i').test(cellText);
            }
            return !cellText.toLowerCase().includes(filter.value.toLowerCase());
        });
    });

    // Then apply sorting
    const sortBtn = table.querySelector('.sort-btn[data-sort-order]:not([data-sort-order=""])');
    if (sortBtn) {
        const colIndex = parseInt(sortBtn.getAttribute('data-col-index')); // Get stored column index
        const sortOrder = sortBtn.getAttribute('data-sort-order');
        
        filteredRows.sort((a, b) => {
            if (!a.cells[colIndex] || !b.cells[colIndex]) return 0;
            let aVal = a.cells[colIndex].innerText;
            let bVal = b.cells[colIndex].innerText;
            
            // Try to convert to numbers if possible
            const aNum = parseFloat(aVal);
            const bNum = parseFloat(bVal);
            if (!isNaN(aNum) && !isNaN(bNum)) {
                aVal = aNum;
                bVal = bNum;
            }
            
            if (aVal < bVal) return sortOrder === 'asc' ? -1 : 1;
            if (aVal > bVal) return sortOrder === 'asc' ? 1 : -1;
            return 0;
        });
    }

    // Update table body
    const tbody = table.querySelector('tbody');
    tbody.innerHTML = '';
    filteredRows.forEach(row => tbody.appendChild(row));
}

let commandsTable = document.querySelector('#commandsTable');
document.addEventListener('DOMContentLoaded', () => {
    if (commandsTable) initTableFilters(commandsTable);
});
