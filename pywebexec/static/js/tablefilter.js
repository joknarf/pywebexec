function initTableFilters(table) {
    const headers = table.querySelectorAll('thead th');
    headers.forEach((header, index) => {
        if (index !== 4 || table!==commandsTable) { // Skip Action column
            const contentSpan = document.createElement('span');
            contentSpan.className = 'th-content';
            
            // Add sort button first
            const sortBtn = document.createElement('span');
            sortBtn.className = 'sort-btn';
            sortBtn.innerHTML = '⇕';
            sortBtn.style.cursor = 'pointer';
            sortBtn.setAttribute('data-sort-order', '');
            sortBtn.onclick = () => toggleSort(table, index, sortBtn);
            
            // Move existing elements into the content span
            while (header.firstChild) {
                contentSpan.appendChild(header.firstChild);
            }
            
            // Add sort button at the beginning
            contentSpan.insertBefore(sortBtn, contentSpan.firstChild);
            
            // Add row counter for last column
            if (index === headers.length - 1) {
                const rowCount = document.createElement('span');
                rowCount.className = 'row-count';
                rowCount.style.marginLeft = 'auto';
                rowCount.style.fontSize = '11px';
                rowCount.style.color = '#aaa';
                rowCount.classList.add('system-font');
                contentSpan.appendChild(rowCount);
            }
            
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
    // Initialize row count
    updateRowCount(table, table.querySelectorAll('tbody tr').length);
}

function updateRowCount(table, count) {
    const rowCount = table.querySelector('.row-count');
    if (rowCount) {
        rowCount.textContent = `${count}`;
    }
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
        .map(filter => ({
            value: filter.value.toLowerCase(),
            index: filter.parentElement.cellIndex,
            regexp: filter.value ? (() => {
                try { return new RegExp(filter.value, 'i'); } 
                catch(e) { return null; }
            })() : null
        }));

    // First apply filters
    const filteredRows = rows.filter(row => {
        // If no filters are active, show all rows
        if (filters.every(f => !f.value)) {
            row.style.display = '';
            return true;
        }
        const cells = row.cells;
        const shouldShow = !filters.some(filter => {
            if (!filter.value) return false;
            const cellText = cells[filter.index]?.innerText || '';
            if (filter.regexp) return !filter.regexp.test(cellText);
            return !cellText.toLowerCase().includes(filter.value);
        });
        row.style.display = shouldShow ? '' : 'none';
        return shouldShow;
    });

    // Update row count
    updateRowCount(table, filteredRows.length);

    // Then apply sorting if active
    const sortBtn = table.querySelector('.sort-btn[data-sort-order]:not([data-sort-order=""])');
    if (sortBtn) {
        const colIndex = parseInt(sortBtn.getAttribute('data-col-index'));
        const sortOrder = sortBtn.getAttribute('data-sort-order');
        
        filteredRows.sort((a, b) => {
            const aVal = a.cells[colIndex]?.innerText || '';
            const bVal = b.cells[colIndex]?.innerText || '';
            
            // Simple text comparison
            if (aVal < bVal) return sortOrder === 'asc' ? -1 : 1;
            if (aVal > bVal) return sortOrder === 'asc' ? 1 : -1;
            return 0;
        });

        // Reorder visible rows
        const tbody = table.querySelector('tbody');
        filteredRows.forEach(row => tbody.appendChild(row));
    }
}

let commandsTable = document.querySelector('#commandsTable');
document.addEventListener('DOMContentLoaded', () => {
    if (commandsTable) initTableFilters(commandsTable);
});
