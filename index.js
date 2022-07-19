// Important data required to perform searches
let data = {
    get query() { return new URLSearchParams(location.search).get('query') },
    jamsa: [],
    einblicke: [],
    ready: false
}

// Retrieve JSON data
function loadJSON(url) {
    return new Promise((resolve, reject) => {
        let request = new XMLHttpRequest();
        request.open('GET', url);
        request.responseType = 'json';
        request.send();
        request.onload = function() { resolve(this.response) };
    });
}

// Search the databases and display results in a table
async function performSearch() {
    // Fill input box
    document.querySelector('#search input').value = data.query;
    
    // Reset everything
    document.querySelector('#results table').hidden = true;
    document.querySelector('#results span').textContent = '';
    document.querySelector('#results b').textContent = '';
    document.querySelectorAll('#results table tr:not(:first-child)').forEach(tr => { tr.remove() });
    
    // Perform query and store found URLs into arrays
    let resultsUnsorted = {
        jamsa: [],
        einblicke: []
    };
    
    // Both databases are searched in the same form loop to improve performance
    for (let i = 0; i < data.einblicke.length; i++) {
        // This prevents the loop from freezing the page
        if (i % 100 == 0)
            await new Promise(resolve => setTimeout(resolve));
        
        if (i && i < data.jamsa.length) {
            let parsedTitle = new DOMParser().parseFromString(data.jamsa[i].title, 'text/html').body.textContent;
        
            if (parsedTitle.toLowerCase().includes(data.query.toLowerCase()) || data.jamsa[i].url.toLowerCase().includes(data.query.toLowerCase()))
                // 'availability' property: 1 = Jamsa, 2 = Both, 3 = Einblicke
                resultsUnsorted.jamsa.push( { title: parsedTitle, url: data.jamsa[i].url, availability: 1 } );
        }
        
        if (!data.einblicke[i].path.endsWith('.htm'))
            continue;
        
        let parsedTitle = new DOMParser().parseFromString(data.einblicke[i].title, 'text/html').body.textContent,
            parsedURL   = decodeURIComponent(data.einblicke[i].url);
        
        if (parsedTitle.toLowerCase().includes(data.query.toLowerCase())
         || parsedURL.toLowerCase().includes(data.query.toLowerCase()))
            resultsUnsorted.jamsa.push( { title: parsedTitle, url: parsedURL, availability: 3 } );
        
        document.querySelector('#results span').textContent = 'Searching databases... ' + Math.ceil(((i + 1) / data.einblicke.length) * 100) + '%';
    }
    
    // If no URLs are found, abort with message
    if (resultsUnsorted.jamsa.length == 0 && resultsUnsorted.einblicke.length == 0) {
        document.querySelector('#results span').textContent = 'No results :(';
        return;
    }
    
    // Combine, then sort results
    let results = resultsUnsorted.jamsa.concat(resultsUnsorted.einblicke);
    results.sort((a, b) => {
        let c = a.title.localeCompare(b.title);
        return c == 0 ? a.url.localeCompare(b.url) : c;
    });
    
    // Remove duplicate results
    for (let i = 0; i < results.length - 1; i++) {
        if (results[i].url.toLowerCase() == results[i + 1].url.toLowerCase()) {
            results[i].availability = 2;
            results.splice(i + 1, 1);
        }
    }
    
    // Populate table with search results
    for (let i = 0; i < results.length; i++) {
        let linkLeft  = '',
            linkRight = '';
        
        if (results[i].availability <= 2) {
            linkLeft = document.createElement('a');
            linkLeft.href = 'viewer.html?source=jamsa&url=' + results[i].url.replaceAll('#', '%23').replaceAll('&', '%26');
            linkLeft.textContent = 'Jamsa';
        }
        if (results[i].availability >= 2) {
            linkRight = document.createElement('a');
            linkRight.href = 'viewer.html?source=einblicke&url=' + results[i].url.replaceAll('#', '%23').replaceAll('?', '%3F').replaceAll('&', '%26');
            linkRight.textContent = 'Einblicke';
        }
        
        addTableRow(document.querySelector('#results table'), results[i].title, results[i].url, linkLeft, linkRight);
    }
    
    // Display table
    document.querySelector('#results table').hidden = false;
    
    // Display search result information
    if (data.query) {
        document.querySelector('#results span').textContent = results.length + ' results for: ';
        document.querySelector('#results b').textContent = data.query;
    }
    else {
        document.querySelector('#results span').textContent = results.length + ' total pages in the archive';
        document.querySelector('#results b').textContent = '';
    }
};

// Update query string in order to prepare the search
function updateURL() { location.replace('./?query=' + document.querySelector('#search input').value.replaceAll('#', '%23').replaceAll('&', '%26')) }

// Load JSON data if it hasn't been already, then initiate the search
async function prepareSearch() {
    if (!data.ready) {
        dataArray = await Promise.all([loadJSON('data/jamsa.json'), loadJSON('data/einblicke.json')]);
        
        data.jamsa     = dataArray[0];
        data.einblicke = dataArray[1];
        data.ready     = true;
    }
    
    performSearch();
}

// Prepare search when prompted
document.querySelector('#search input').addEventListener('keydown', key => { if (key.code == 'Enter') updateURL() });
document.querySelector('#search button').addEventListener('click', updateURL);

// Prepare search automatically if URL already contains a query string
if (data.query || data.query == '')
    prepareSearch();

// Helpful function that automatically adds rows to the desired table
function addTableRow(table, ...args) {
    let row = document.createElement('tr');
    
    for (let i = 0; i < args.length; i++) {
        let item = document.createElement('td');
        item.append(args[i]);
        row.append(item);
    }
    
    table.append(row);
}