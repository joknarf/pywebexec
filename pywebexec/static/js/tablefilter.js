function initTableFilters(table) {
    const headers = table.querySelectorAll('thead th');
    headers.forEach((header, index) => {
        if (index !== 4 || table!==commandsTable) { // Skip Action column
            const contentSpan = document.createElement('span');
            contentSpan.className = 'th-content';
            
            // Add sort button first
            const sortBtn = document.createElement('span');
            sortBtn.className = 'sort-btn glyph-font';
            sortBtn.innerHTML = '';
            sortBtn.style.cursor = 'pointer';
            sortBtn.setAttribute('data-sort-order', '');
            sortBtn.onclick = () => toggleSort(table, index, sortBtn);
            
            // Move existing elements into the content span
            while (header.firstChild) {
                contentSpan.appendChild(header.firstChild);
            }
            
            // Add sort button at the beginning
            contentSpan.insertBefore(sortBtn, contentSpan.firstChild);
            
            // Add export button and row counter for last column
            if (index === headers.length - 1) {
                // Add row counter
                const rowCount = document.createElement('span');
                rowCount.className = 'row-count system-font';
                rowCount.onclick = () => exportToExcel(table);
                contentSpan.appendChild(rowCount);
            }
            
            header.appendChild(contentSpan);
            
            // Add filter input
            const input = document.createElement('input');
            input.type = 'search';
            input.className = 'column-filter';
            input.placeholder = ''; // Unicode for magnifying glass
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
        rowCount.innerHTML = `<span class="glyph-font"></span> ${count}`;
    }
}

function toggleSort(table, colIndex, sortBtn) {
    // Reset other sort buttons
    table.querySelectorAll('.sort-btn').forEach(btn => {
        if (btn !== sortBtn) {
            btn.setAttribute('data-sort-order', '');
            btn.innerHTML = '';
        }
    });

    // Toggle sort order
    const currentOrder = sortBtn.getAttribute('data-sort-order');
    let newOrder = 'asc';
    if (currentOrder === 'asc') {
        newOrder = 'desc';
        sortBtn.innerHTML = '';
    } else if (currentOrder === 'desc') {
        newOrder = '';
        sortBtn.innerHTML = '';
    } else {
        sortBtn.innerHTML = '';
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
            const aVal = a.cells[colIndex]?.innerText.trim() || '';
            const bVal = b.cells[colIndex]?.innerText.trim() || '';
            
            // Check if both values are numeric
            const aNum = !isNaN(aVal) && !isNaN(parseFloat(aVal));
            const bNum = !isNaN(bVal) && !isNaN(parseFloat(bVal));
            
            if (aNum && bNum) {
                // Numeric comparison
                return sortOrder === 'asc' 
                    ? parseFloat(aVal) - parseFloat(bVal)
                    : parseFloat(bVal) - parseFloat(aVal);
            }
            
            // Fallback to string comparison
            if (aVal < bVal) return sortOrder === 'asc' ? -1 : 1;
            if (aVal > bVal) return sortOrder === 'asc' ? 1 : -1;
            return 0;
        });

        // Reorder visible rows
        const tbody = table.querySelector('tbody');
        filteredRows.forEach(row => tbody.appendChild(row));
    }
}

function exportToExcel(table) {
    // Create HTML content
    const html = `
        <html>
            <head>
                <meta charset="UTF-8">
            </head>
            <body>
                <table border="1" bgcolor="#f0f0f0" bordercolor="#ffffff">
                    <thead>
                        <tr>${
                            Array.from(table.querySelectorAll('thead th'))
                                .filter((_, i) => i !== 4 || table !== commandsTable)
                                .map(th => `<th bgcolor="#b0c7ff">${th.querySelector('.th-content')?.textContent.replace(/[]/, '').replace(/.*/, '').trim() || ''}</th>`)
                                .join('')
                        }</tr>
                    </thead>
                    <tbody>${
                        Array.from(table.querySelectorAll('tbody tr'))
                            .filter(row => row.style.display !== 'none')
                            .map(row => 
                                `<tr>${
                                    Array.from(row.cells)
                                        .filter((_, i) => i !== 4 || table !== commandsTable)
                                        .map(cell => `<td valign="top">${cell.innerHTML}</td>`)
                                        .join('')
                                }</tr>`
                            ).join('')
                    }</tbody>
                </table>
            </body>
        </html>`;

    // Create and trigger download
    const blob = new Blob([html], { type: 'application/vnd.ms-excel' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'export_' + new Date().toISOString().slice(0,10) + '.xls';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    window.URL.revokeObjectURL(url);
}

let commandsTable = document.querySelector('#commandsTable');
document.addEventListener('DOMContentLoaded', () => {
    if (commandsTable) initTableFilters(commandsTable);
});
