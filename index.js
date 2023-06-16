// Important data required to perform searches
let data = {
    query: new URLSearchParams(location.search).get('query'),
    filter: new URLSearchParams(location.search).get('filter')
};

// Configuration for infinite scroll
let chunk = {
    initial: 500,
    add: 100,
    current: 0,
    busy: false
};

// Array to contain search results
let results = [];

// Encode problematic characters
let encodeString = string => string
    .replace(/\#/g, '%23')
    .replace(/\?/g, '%3F')
    .replace(/\&/g, '%26')
    .replace(/\+/g, '%2B');

// Search the databases and display results in a table
async function performSearch() {
    // Load the JSON
    let json = await fetch('data.json').then(r => r.json());
    
    json.forEach(source => source.entries.forEach(entry => {
        if ((data.filter == 'html'  && !entry.path.endsWith('.htm'))
         || (data.filter == 'media' &&  entry.path.endsWith('.htm')))
            return;
        
        let parsedTitle = (['/', '&'].some(c => entry.title.includes(c)) ? new DOMParser().parseFromString(entry.title, 'text/html').body.textContent : entry.title).toLowerCase(),
            parsedURL = (entry.url.includes('%') ? decodeURIComponent(entry.url) : entry.url).toLowerCase(),
            parsedQuery = data.query.toLowerCase();
        
        if (parsedTitle.includes(parsedQuery) || parsedURL.includes(parsedQuery)) {
            entry.key = parsedURL.replace(/^http:\/\/(www\.|)/i, '').replace(/\/$/, '');
            results.push(entry);
        }
    }));
    
    // If no URLs are found, abort with message
    if (results.length == 0) {
        document.querySelector('#results span').textContent = 'No results :(';
        return;
    }
    
    // Combine, then prepare results to remove duplicates
    results.sort((a, b) => a.key >= b.key ? 1 : -1);
    
    // Remove duplicate results
    for (let i = 0; i < results.length - 1; i++)
        if (results[i].key == results[i + 1].key)
            results.splice(i + 1, 1);
    
    // Properly sort results now that duplicates are gone
    results.sort((a, b) => {
        if (a.title.length == 0 && b.title.length == 0)
            return a.key >= b.key ? 1 : -1;
        else
            return a.title.toLowerCase() >= b.title.toLowerCase() ? 1 : -1;
    });
    
    // Initialize results table with certain number of entries
    await addChunk(chunk.initial);
    
    // Initialize infinite scroll functionality
    document.addEventListener('scroll', async () => {
        if (!chunk.busy && document.documentElement.scrollHeight - document.documentElement.clientHeight - window.scrollY < 500)
            await addChunk(chunk.add);
    });
    
    // Display table
    document.querySelector('#results table').hidden = false;
    
    // Display search result information
    document.querySelector('#results span').textContent = results.length + ' results for: ';
    
    if (data.query) {
        document.querySelector('#results b').textContent = data.query;
    }
    else {
        document.querySelector('#results b').textContent = '';
    }
}

// Add entries to results table by chunk to increase performance
function addChunk(size) {
    if (chunk.busy) return;
    
    chunk.busy = true;
    
    for (let i = chunk.current; i < Math.min(chunk.current + size, results.length); i++) {
        let link = document.createElement('a');
        link.href = 'viewer/?url=' + encodeString(results[i].url);
        link.textContent = 'View';
        
        let row = document.createElement('tr');
        
        [results[i].title, results[i].url, link].forEach(str => {
            let col = document.createElement('td');
            col.append(str);
            row.append(col);
        });
        
        document.querySelector('#results table').append(row);
    }
    
    chunk.current += size;
    if (chunk.current < results.length) chunk.busy = false;
}

// Update query string in order to prepare the search
function updateURL() {
    let newURL = './?query=' + encodeString(document.querySelector('#search input').value);
    
    if (document.querySelector('#search-html').checked)
        newURL += '&filter=html';
    else if (document.querySelector('#search-media').checked)
        newURL += '&filter=media';
    
    location.href = newURL;
}

// Prepare search when prompted
document.querySelector('#search input').addEventListener('keydown', key => { if (key.code == 'Enter') updateURL() });
document.querySelector('#search button').addEventListener('click', updateURL);

// Prepare search automatically if URL already contains a query string
if (data.query || data.query == '') {
    // Fill input box
    document.querySelector('#search input').value = data.query;
    
    // Select appropriate filter option
    switch (data.filter) {
        case 'html':
            document.querySelector('#search-html').checked = true;
            break;
        case 'media':
            document.querySelector('#search-media').checked = true;
            break;
        default:
            document.querySelector('#search-everything').checked = true;
    }
    
    performSearch();
}