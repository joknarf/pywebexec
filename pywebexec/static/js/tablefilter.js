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
                rowCount.title = 'Export to Excel';
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

function processHtmlContent(element) {
    function processLi(li, level = 0) {
        const indent = '    '.repeat(level);
        const items = [];
        
        // Extraire le texte direct (avant sous-liste)
        const textContent = Array.from(li.childNodes)
            .filter(node => node.nodeType === Node.TEXT_NODE)
            .map(node => node.textContent.trim())
            .join(' ')
            .replace(/\s+/g, ' ')
            .trim();
            
        if (textContent) {
            items.push(indent + '• ' + textContent);
        }
        
        // Traiter récursivement les sous-listes
        const subLists = li.querySelectorAll(':scope > ul > li');
        if (subLists.length) {
            for (const subLi of subLists) {
                items.push(...processLi(subLi, level + 1));
            }
        }
        
        return items;
    }

    const list = element.querySelector('ul');
    if (list) {
        const items = Array.from(list.children)
            .filter(el => el.tagName === 'LI')
            .map(li => processLi(li))
            .flat();
        return items.join('\n');
    }
    const text = element.textContent.replace(/\s+/g, ' ').trim();
    // Return object with type info if it's a number
    if (/^\d+$/.test(text)) {
        return { value: parseInt(text, 10), type: 'integer' };
    }
    return text;
}

function exportToExcel(table) {
    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet('Sheet1', {
        views: [{ state: 'frozen', xSplit: 0, ySplit: 1 }]
    });

    // Get headers and data
    const headers = Array.from(table.querySelectorAll('thead th'))
        .filter((_, i) => i !== 4 || table !== commandsTable)
        .map(th => th.querySelector('.th-content')?.textContent.replace(/[].*/, '').replace(/[^\w\s]/g, '').trim() || '');

    // Get data rows with type information
    const rows = Array.from(table.querySelectorAll('tbody tr'))
        .filter(row => row.style.display !== 'none')
        .map(row => 
            Array.from(row.cells)
                .filter((_, i) => i !== 4 || table !== commandsTable)
                .map(cell => {
                    const content = processHtmlContent(cell);
                    if (content && typeof content === 'object' && content.type === 'integer') {
                        return content.value; // Numbers will be handled as numbers by ExcelJS
                    }
                    return (typeof content === 'string' ? content : content.toString())
                })
        );

    // Calculate optimal column widths based on content
    const columnWidths = headers.map((header, colIndex) => {
        // Start with header width
        let maxWidth = header.length;

        // Check width needed for each row's cell in this column
        rows.forEach(row => {
            const cellContent = row[colIndex];
            if (cellContent === null || cellContent === undefined) return;

            // Convert numbers to string for width calculation
            const contentStr = cellContent.toString();
            // Get the longest line in multiline content
            const lines = contentStr.split('\n');
            const longestLine = Math.max(...lines.map(line => line.length));
            maxWidth = Math.max(maxWidth, longestLine);
        });

        // Add some padding and ensure minimum/maximum widths
        return { width: Math.min(Math.max(maxWidth + 2, 10), 100) };
    });

    // Define columns with calculated widths
    worksheet.columns = headers.map((header, index) => ({
        header: header,
        key: header,
        width: columnWidths[index].width
    }));

    // Add data rows
    rows.forEach(rowData => {
        const row = worksheet.addRow(rowData);
        row.alignment = { vertical: 'top', wrapText: true };
        
        // Set row height based on content, handling both strings and numbers
        // const maxLines = Math.max(...rowData.map(cell => {
        //     if (cell === null || cell === undefined) return 1;
        //     const str = cell.toString();
        //     return (str.match(/\n/g) || []).length + 1;
        // }));
        // row.height = Math.max(20, maxLines * 15);
    });

    // Style header row
    const headerRow = worksheet.getRow(1);
    headerRow.font = { bold: true };
    headerRow.alignment = { vertical: 'middle', horizontal: 'left' };
    // headerRow.height = 20;

    // Add table after all rows are defined
    worksheet.addTable({
        name: 'DataTable',
        ref: 'A1',
        headerRow: true,
        totalsRow: false,
        style: {
            theme: 'TableStyleMedium2',
            showRowStripes: true,
        },
        columns: headers.map(h => ({
            name: h,
            filterButton: true
        })),
        rows: rows
    });

    // Save file
    workbook.xlsx.writeBuffer().then(buffer => {
        const blob = new Blob([buffer], { 
            type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' 
        });
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = 'export_' + new Date().toISOString().slice(0,10) + '.xlsx';
        a.click();
        window.URL.revokeObjectURL(url);
    });
}

let commandsTable = document.querySelector('#commandsTable');
document.addEventListener('DOMContentLoaded', () => {
    if (commandsTable) initTableFilters(commandsTable);
});
