// Important data required to perform searches
let data = {
    query: new URLSearchParams(location.search).get('query'),
    filter: new URLSearchParams(location.search).get('filter'),
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

// Correctly compare URLs
let homogenizeURL = url => {
    url = decodeURIComponent(url);
    url = url.toLowerCase();
    url = url.startsWith('http://www.') ? 'http://' + url.substring('http://www.'.length) : url;
    url = url.endsWith('/') ? url.substring(0, url.length - 1) : url;
    
    return url;
}

// Encode problematic characters
let encodeString = string => string
    .replaceAll('#', '%23')
    .replaceAll('?', '%3F')
    .replaceAll('&', '%26')
    .replaceAll('+', '%2B');

// Search the databases and display results in a table
async function performSearch() {
    // Fill input box
    document.querySelector('#search input').value = data.query.toLowerCase();
    
    // Reset everything
    document.querySelector('#results table').hidden = true;
    document.querySelector('#results span').textContent = '';
    document.querySelector('#results b').textContent = '';
    document.querySelectorAll('#results table tr:not(:first-child)').forEach(tr => { tr.remove() });
    
    // Perform query and store found URLs into arrays
    let resultsUnsorted = [];
    
    // Both databases are searched in the same form loop to improve performance
    for (let i = 0; i < data.einblicke.length; i++) {
        // This prevents the loop from freezing the page
        if (i % 500 == 0)
            await new Promise(resolve => setTimeout(resolve));
        
        if (i < data.jamsa.length && data.filter != 'media') {
            let parsedTitle = new DOMParser().parseFromString(data.jamsa[i].title, 'text/html').body.textContent;
        
            if (parsedTitle.toLowerCase().includes(data.query.toLowerCase())
             || data.jamsa[i].url.toLowerCase().includes(data.query.toLowerCase()))
                // 'availability' property: 1 = Jamsa, 2 = Both, 3 = Einblicke
                resultsUnsorted.push( { title: parsedTitle, url: data.jamsa[i].url, source: 'jamsa', availability: 1 } );
        }
        
        if ((data.filter == 'html'  && !data.einblicke[i].path.endsWith('.htm'))
         || (data.filter == 'media' &&  data.einblicke[i].path.endsWith('.htm')))
            continue;
        
        let parsedTitle = new DOMParser().parseFromString(data.einblicke[i].title, 'text/html').body.textContent,
            parsedURL   = decodeURIComponent(data.einblicke[i].url);
        
        if (parsedTitle.toLowerCase().includes(data.query.toLowerCase())
         || parsedURL.toLowerCase().includes(data.query.toLowerCase()))
            resultsUnsorted.push( { title: parsedTitle, url: parsedURL, source: 'einblicke', availability: 3 } );
        
        document.querySelector('#results span').textContent = 'Searching databases... ' + Math.ceil(((i + 1) / data.einblicke.length) * 100) + '%';
    }
    
    // If no URLs are found, abort with message
    if (resultsUnsorted.length == 0) {
        document.querySelector('#results span').textContent = 'No results :(';
        return;
    }
    
    // Combine, then prepare results to remove duplicates
    let results = [...resultsUnsorted].sort((a, b) => homogenizeURL(a.url) > homogenizeURL(b.url));
    
    // Remove duplicate results
    for (let i = 0; i < results.length - 1; i++) {
        if (homogenizeURL(results[i].url) == homogenizeURL(results[i + 1].url)) {
            if (results[i].source != results[i + 1].source)
                results[i].availability = 2;
            
            results.splice(i + 1, 1);
        }
    }
    
    // Properly sort results now that duplicates are gone
    results.sort((a, b) => {
        if (a.title.length == 0 && b.title.length == 0)
            return homogenizeURL(a.url) > homogenizeURL(b.url);
        else
            return a.title.toLowerCase() > b.title.toLowerCase();
    });
    
    // Populate table with search results
    for (let i = 0; i < results.length; i++) {
        let linkLeft  = '',
            linkRight = '';
        
        if (results[i].availability <= 2) {
            linkLeft = document.createElement('a');
            linkLeft.href = 'viewer/?source=jamsa&url=' + encodeString(results[i].url);
            linkLeft.textContent = 'Jamsa';
        }
        if (results[i].availability >= 2) {
            linkRight = document.createElement('a');
            linkRight.href = 'viewer/?source=einblicke&url=' + encodeString(results[i].url);
            linkRight.textContent = 'Einblicke';
        }
        
        // Automatically add rows to the desired table
        let row = document.createElement('tr');
        
        [results[i].title, results[i].url, linkLeft, linkRight].forEach(str => {
            let col = document.createElement('td');
            col.append(str);
            row.append(col);
        });
        
        document.querySelector('#results table').append(row);
    }
    
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
};

// Update query string in order to prepare the search
function updateURL() {
    let newURL = './?query=' + encodeString(document.querySelector('#search input').value);
    
    if (document.querySelector('#search-html').checked)
        newURL += '&filter=html';
    else if (document.querySelector('#search-media').checked)
        newURL += '&filter=media';
    
    location.replace(newURL);
}

// Prepare search when prompted
document.querySelector('#search input').addEventListener('keydown', key => { if (key.code == 'Enter') updateURL() });
document.querySelector('#search button').addEventListener('click', updateURL);

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

// Prepare search automatically if URL already contains a query string
if (data.query || data.query == '') {
    (async () => {
        // Load JSON data if it hasn't been already
        if (!data.ready) {
            dataArray = await Promise.all([loadJSON('data/jamsa.json'), loadJSON('data/einblicke.json')]);
            
            data.jamsa     = dataArray[0];
            data.einblicke = dataArray[1];
            data.ready     = true;
        }
        
        performSearch();
    })();
}