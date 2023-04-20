/*-------------------+
 | Helpful functions |
 +-------------------*/
// Retrieve JSON data
let loadJSON = url => fetch(url).then(r => r.json());

// Correctly compare URLs
function compareURLs(...urls) {
    if (urls.length > 2)
        urls = urls.slice(0, 2);
    
    try { urls = urls.map(url => decodeURIComponent(url)) } catch { }
    
    urls = urls
        .map(url => url.toLowerCase())
        .map(url => url.startsWith('http://') ? url.substring('http://'.length) : url)
        .map(url => url.startsWith('www.') ? url.substring('www.'.length) : url)
        .map(url => url.endsWith('/') ? url.substring(0, url.length - 1) : url);
    
    return urls[0] == urls[1];
}

// Prevent image from loading, add alt text if necessary
function sanitizeImage(pageImage, useFilename = true) {
    if (!pageImage.hasAttribute('alt')) {
        if (useFilename && pageImage.hasAttribute('src') && pageImage.src.length > 1)
            pageImage.alt = pageImage.src.substring(pageImage.src.lastIndexOf("/") + 1, pageImage.src.lastIndexOf('.'));
        else
            pageImage.alt = '[image]'
    }
    
    pageImage.removeAttribute('src');
}

// Parse XBM files
async function parseXBM(url) {
    let data = await fetch(url).then(r => r.text()),
        width = parseInt(data.replace(/.*_width ([0-9]*)/is, '$1')),
        height = parseInt(data.replace(/.*_height ([0-9]*)/is, '$1')),
        canvas = document.createElement('canvas'),
        ctx = canvas.getContext('2d'),
        drawing = ctx.createImageData(width, height),
        bytes = new Function(`return [${data.replace(/.*\{(.*?)\}.*/is, '$1')}]`)().slice(0, width * height),
        offset = 0;
    
    for (let byte of bytes) {
        let bits = (0xFF - byte).toString(2).padStart(8, '0');
        
        for (let b = 7; b >= 0; b--) {
            if ((offset / 4) % width == 0 && 7 - b == width % 8) break;

            for (let c = 0; c < 3; c++)
                drawing.data[offset + c] = parseInt(bits[b]) * 255;
            
            drawing.data[offset + 3] = 255;

            offset += 4;
        }
    }
    
    canvas.width  = width;
    canvas.height = height;
    
    ctx.putImageData(drawing, 0, 0);
    
    return canvas.toDataURL();
}

// Handle everything
(async () => {
    let list = await Promise.all([loadJSON('../data/jamsa.json'), loadJSON('../data/einblicke.json')]);
    
    /*------------------+
     | Get query string |
     +------------------*/
    let query = new URLSearchParams(location.search);
    
    if (!query.has('url')) {
        alert('No URL was specified!');
        window.location.replace('../');
        return;
    }
    
    let sourceID, targetID;
    
    // If source is specified, expect URL to reside inside it
    if (query.has('source')) {
        sourceID = query.get('source') == 'jamsa' ? 0 : 1;
        targetID = targetID = list[sourceID].findIndex(file => compareURLs(file.url, query.get('url')));
    }
    // Otherwise, search the entire database for the URL
    else {
        let urlExists = list.some((source, id) => {
            let fileIndex = source.findIndex(file => compareURLs(file.url, query.get('url')));
            
            if (fileIndex != -1) {
                sourceID = id;
                targetID = fileIndex;
                query.append('source', id == 0 ? 'jamsa' : 'einblicke');
                
                return true;
            }
        });
        
        if (!urlExists)
            targetID = -1;
    }
    
    // Redirect to homepage if URL doesn't exist in list
    if (targetID == -1) {
        alert('The URL ' + query.get('url') + ' does not exist in the archive!');
        window.location.replace('../');
        return;
    }
    
    let rootPath    = 'https://archive.org/download/1995archive/1995archive.zip/',
        sourcePath  = query.get('source') == 'jamsa'
                    ? (rootPath + 'jamsa/' + targetID + '.htm')
                    : (rootPath + 'einblicke/' + list[sourceID][targetID].path);
    
    /*----------------------------------+
     | Fill in data at bottom of screen |
     +----------------------------------*/
    // URL text
    document.querySelector('#url span').textContent = decodeURIComponent(list[sourceID][targetID].url);
    // Search domain
    {
        let host = new URL(list[sourceID][targetID].url).hostname;
        document.querySelector('#links a:nth-of-type(1)').href = '../?query=' + (host.startsWith('www.') ? host.substring('www.'.length) : host);
    }
    // View in Wayback Machine
    document.querySelector('#links a:nth-of-type(2)').href = 'https://web.archive.org/web/0/' + list[sourceID][targetID].url;
    // View original file
    document.querySelector('#links a:nth-of-type(3)').href = sourcePath;
    // Source
    if (query.get('source') == 'jamsa') {
        document.querySelector('#source a').textContent = 'World Wide Web Directory';
        document.querySelector('#source a').href = 'https://archive.org/details/www-dir-cd';
        document.querySelector('#source span').textContent = 'June 1995';
    }
    else {
        document.querySelector('#source a').textContent = 'Einblicke ins Internet';
        document.querySelector('#source a').href = 'https://cs.rit.edu/~ats/books/cd';
        document.querySelector('#source span').textContent = 'October 1995';
    }
    // See earlier/newer version
    if (list[(sourceID + 1) % 2].findIndex(file => compareURLs(file.url, query.get('url'))) != -1) {
        let altSource = query.get('source') == 'jamsa' ? 'einblicke' : 'jamsa';
        document.querySelector('#switch a').textContent = 'See ' + (query.get('source') == 'jamsa' ? 'newer' : 'older') + ' version';
        document.querySelector('#switch a').href = './?source=' + altSource + '&url=' + query.get('url');
        document.querySelector('#switch').style.display = 'initial';
    }
    // Jamsa screenshot
    if (query.get('source') == 'jamsa') {
        let imageURL = rootPath + 'jamsa/images/' + targetID + '.png';
        document.querySelector('#picture img').src = imageURL;
        document.querySelector('#picture a').href  = imageURL;
        document.querySelector('#picture').hidden  = false;
    }
    
    /*-------------------------------+
     | Load and modify embedded page |
     +-------------------------------*/
    fetch(sourcePath).then(r => sourcePath.endsWith('.htm') ? r.text() : r.blob()).then(async response => {
        // Apply page title to parent
        if (list[sourceID][targetID].title != undefined && list[sourceID][targetID].title != '') {
            let parsedTitle = new DOMParser().parseFromString(list[sourceID][targetID].title, 'text/html').body.textContent;
            document.title = parsedTitle + ' | Archive95';
        }
        else
            document.title = decodeURIComponent(list[sourceID][targetID].url) + ' | Archive95';
        
        // Handle non-HTML files
        if (sourcePath.endsWith('.jpg') || sourcePath.endsWith('.gif') || sourcePath.endsWith('.xbm')) {
            let imageEmbed = document.createElement('img');
            
            if (sourcePath.endsWith('.xbm'))
                imageEmbed.src = await parseXBM(sourcePath);
            else
                imageEmbed.src = window.URL.createObjectURL(response);
            
            document.querySelector('#page > div').append(imageEmbed);
            return;
        }
        else if (sourcePath.endsWith('.wav')) {
            let audioEmbed = document.createElement('audio');
            audioEmbed.src = window.URL.createObjectURL(response);
            audioEmbed.controls = true;
            document.querySelector('#page > div').append(audioEmbed);
            return;
        }
        else if (!sourcePath.endsWith('.htm')) {
            let fileLink = document.createElement('a');
            fileLink.href = window.URL.createObjectURL(response);
            fileLink.download = query.get('url').substring(query.get('url').lastIndexOf('/') + 1);
            fileLink.dispatchEvent(new MouseEvent('click'));
            return;
        }
        
        let pageMarkup = response;
        
        // Handle plaintext pages
        if (list[sourceID][targetID].plaintext) {
            document.querySelector('#page > pre').innerHTML = pageMarkup;
            document.querySelector('#page > div').hidden = true;
            document.querySelector('#page > pre').hidden = false;
            return;
        }
        
        // Display loading icon
        document.querySelector('#url > div').style.display = 'inline-block';
        
        // Fix bad markup that can hide large portions of a page in modern browsers
        {
            let lessThan = pageMarkup.indexOf('<');
            
            while (lessThan != -1) {
                let greaterThan = pageMarkup.indexOf('>', lessThan),
                    innerElement = pageMarkup.substring(lessThan + 1, greaterThan);
                
                // Check for and fix comments without ending double hyphen
                if (innerElement.startsWith('!--') && !innerElement.endsWith('--') && !innerElement.includes('<'))
                    pageMarkup = pageMarkup.substring(0, greaterThan) + '--' + pageMarkup.substring(greaterThan, pageMarkup.length);
                // Check for and fix HTML attributes without ending quotation mark
                else {
                    let attributeStart = innerElement.lastIndexOf('="');
                    
                    if (attributeStart != -1 && innerElement.indexOf('"', attributeStart + 2) == -1)
                        pageMarkup = pageMarkup.substring(0, greaterThan) + '"' + pageMarkup.substring(greaterThan, pageMarkup.length);
                }
                
                lessThan = pageMarkup.indexOf('<', lessThan + 1);
            }
        }
        
        // Add missing closing tags to list elements
        {
            let listElement = 0;
                listOffset  = 0;
            
            while (listElement != -1) {
                listElement = pageMarkup.substring(listOffset).search(/(<dt.*?>|<dd.*?>)/is);
                listOffset += listElement + 1;
                
                let closingPoint = pageMarkup.substring(listOffset).search(/(<dl.*?>|<dt.*?>|<dd.*?>|<\/dl>)/is),
                    closingTag   = pageMarkup.substring(listOffset).search(/(<\/dt>|<\/dd>)/is);
                
                if (listElement != -1 && closingPoint != -1 && (closingTag == -1 || closingTag > closingPoint)) {
                    let closingIndex  = listOffset + closingPoint;
                    
                    pageMarkup = pageMarkup.substring(0, closingIndex)
                               + '</' + pageMarkup.substring(listOffset - 1).match(/<.*?>/is)[0].substring(1, 3) + '>'
                               + pageMarkup.substring(closingIndex, pageMarkup.length);
                    
                    listElement += '</dd>'.length - 1;
                }
            }
        }
        
        /*----------------------------------------------+
         | Revert markup changes if source is Einblicke |
         +----------------------------------------------*/
        if (query.get('source') == 'einblicke') {
            pageMarkup = pageMarkup.replaceAll(
                // Remove footer
                /(\r?)(\n?)<hr>(\r?)(\n?)Original: .*? \[\[<a href=".*?">Net<\/a>\]\](\r?)(\n?)$/gi,
                ''
            ).replaceAll(
                // Remove duplicate alt attribute
                /(teufel\.gif|link\.gif)" alt="(\[defekt\]|\[image\])"/gi,
                '$1"'
            ).replaceAll(
                // Remove broken page warning
                /^<html><body>(\r?)(\n?)<img src=".*?noise\.gif">(\r?)(\n?)<strong>Vorsicht: Diese Seite k&ouml;nnte defekt sein!<\/strong>(\r?)(\n?)(\r?)(\n?)<hr>(\r?)(\n?)/gi,
                ''
            ).replaceAll(
                // Replace missing form elements with neater placeholder
                /<p>(\r?)(\n?)<strong>Hier sollte eigentlich ein Dialog stattfinden!<\/strong>(\r?)(\n?)\[\[<a href=".*?">Net<\/a>\]\](\r?)(\n?)<p>(\r?)(\n?)/gi,
                '<p>[[Einblicke ins Internet form placeholder]]</p>'
            )
        }
        
        let pageDocument = new DOMParser().parseFromString(pageMarkup, 'text/html');
        
        if (query.get('source') == 'einblicke') {
            // Remove placeholder images
            pageDocument.querySelectorAll('img:is([src$="teufel.gif"], [src$="link.gif"], [src$="grey.gif"])').forEach(pageImage => {
                if (pageImage.src.endsWith('link.gif') && pageImage.parentNode.nodeName == 'A')
                    pageImage.parentNode.replaceWith(...pageImage.parentNode.childNodes);
                
                sanitizeImage(pageImage, false);
            });
            
            // Revert changes to links
            pageDocument.querySelectorAll('a[href$="fehler.htm"]:not([href^="http://"])').forEach(pageLink => {
                let nextNode = pageLink.nextSibling;
                
                if (nextNode === null)
                    nextNode = pageLink.parentNode.nextSibling;
                if (nextNode == undefined) {
                    pageLink.href = '#';
                    return;
                }
                if (nextNode.nodeName != '#text' && nextNode.childNodes.length > 0)
                    nextNode = nextNode.childNodes[0];
                
                let nextElement = nextNode.nextSibling;
                
                if (nextNode !== null && nextNode.textContent.endsWith('[[')
                 && nextElement && nextElement.nodeName == 'A' && nextElement.textContent == 'Net'
                 && nextElement.nextSibling && nextElement.nextSibling.textContent.startsWith(']]')) {
                    pageLink.href = nextElement.href;
                    
                    nextNode.remove();
                    nextElement.nextSibling.textContent = nextElement.nextSibling.textContent.substring(2);
                    nextElement.remove();
                    
                    return;
                }
                
                pageLink.replaceWith(...pageLink.childNodes);
            });
        }
        
        /*-----------------------+
         | Fix and update markup |
         +-----------------------*/
        // Copy important attributes from body to root
        {
            let backgroundMap = ['bgcolor', 'rgb'],
                textMap = [
                ['text',  '*'],
                ['link',  'a:link, a:link *'],
                ['alink', 'a:active, a:active *'],
                ['vlink', 'a:visited, a:visited *']
            ];
            backgroundMap.forEach(attribute => {
                if (pageDocument.body.hasAttribute(attribute))
                    document.querySelector('#page').style.backgroundColor = 
                        pageDocument.body.getAttribute(attribute)[0] != '#'
                        ? '#' + pageDocument.body.getAttribute(attribute)
                        : pageDocument.body.getAttribute(attribute);
            });
            textMap.forEach(array => {
                if (pageDocument.body.hasAttribute(array[0]))
                    pageDocument.querySelectorAll(array[1]).forEach(elem => {
                        elem.style.color = 
                            pageDocument.body.getAttribute(array[0])[0] != '#'
                            ? '#' + pageDocument.body.getAttribute(array[0])
                            : pageDocument.body.getAttribute(array[0]);
                    });
            });
        }
        
        // Insert placeholder for <isindex>
        if (pageDocument.querySelector('isindex')) {
            let index = document.createElement('form'),
                topDivider = document.createElement('hr');
            
            index.setAttribute('onsubmit', 'return false');
            index.append(topDivider);
            
            if (pageDocument.querySelector('isindex').hasAttribute('prompt'))
                index.insertAdjacentText('beforeend', pageDocument.querySelector('isindex').getAttribute('prompt'));
            else
                index.insertAdjacentText('beforeend', 'This is a searchable index. Enter search keywords: ');
            
            index.append(document.createElement('input'), document.createElement('hr'));
            
            pageDocument.querySelector('isindex').insertAdjacentElement('afterbegin', index);
        }
        
        // Update image locations, or replace with placeholder if they don't exist in the archive
        for (let pageImage of pageDocument.querySelectorAll('img')) {
            if (pageImage.hasAttribute('ismap'))
                pageImage.removeAttribute('ismap');
            
            if (!pageImage.hasAttribute('src'))
                continue;
            
            let imageIndex;
            
            if (query.get('source') == 'jamsa') {
                let queryURL = new URL(pageImage.getAttribute('src'), list[sourceID][targetID].url).href;
                imageIndex = list[1].findIndex(img => compareURLs(img.url, queryURL));
            }
            else if (!pageImage.getAttribute('src').endsWith('.xbm')) {
                let queryPathFull = new URL(pageImage.getAttribute('src'), sourcePath).href,
                    queryPath = queryPathFull.substring((rootPath + 'einblicke/').length);
                
                imageIndex = list[1].findIndex(img => img.path == queryPath);
            }
            else {
                pageImage.src = await parseXBM(new URL(pageImage.getAttribute('src'), sourcePath).href);
                continue;
            }
            
            if (imageIndex != -1) {
                pageImage.src = rootPath + 'einblicke/' + list[1][imageIndex].path;
            }
            else
                sanitizeImage(pageImage);
        }
        
        // Fix <marquee> instances using a very old and unsupported format
        pageDocument.querySelectorAll('marquee').forEach(oldMarquee => {
            let newMarquee = document.createElement('marquee');
            newMarquee.textContent = oldMarquee.getAttribute('text');
            
            oldMarquee.replaceWith(newMarquee, ...oldMarquee.childNodes);
        });
        
        // Remove unneeded HTML tags/elements
        {
            let unneededElements = [ 'head', 'header', 'link', 'meta', 'form' ],
                unneededTags = [ 'title', 'base', 'nextid' ];
            
            pageDocument.querySelectorAll('*').forEach(node => {
                if (unneededElements.includes(node.nodeName.toLowerCase()))
                    node.replaceWith(...node.childNodes);
                else if (unneededTags.includes(node.nodeName.toLowerCase()))
                    node.remove();
            });
        }
        
        // Apply modified HTML to div
        document.querySelector('#page > div').innerHTML = pageDocument.documentElement.innerHTML;
        
        // Redirect links to archival sites
        for (let pageLink of document.querySelectorAll('#page > div a[href]')) {
            await new Promise(resolve => setTimeout(resolve));
            
            let fullURL;
            
            try {
                fullURL = new URL(pageLink.getAttribute('href'), list[sourceID][targetID].url).href;
            }
            // Catch invalid links
            catch {
                pageLink.setAttribute('target', '_blank');
                pageLink.href = 'https://web.archive.org/web/0/' + pageLink.href;
                continue;
            }
            
            // Ignore anchors and non-HTTP links
            if (!fullURL.startsWith('http://') || pageLink.getAttribute('href').startsWith('#'))
                continue;
            
            // Update local Einblicke links
            if (query.get('source') == 'einblicke' && pageLink.href.startsWith(window.location.origin)) {  
                let queryPathFull = new URL(pageLink.getAttribute('href'), sourcePath).href,
                    queryPath = queryPathFull.substring((rootPath + 'einblicke/').length),
                    queryAnchor = '';
                
                if (queryPath.indexOf('#') != -1) {
                    queryAnchor = queryPath.substring(queryPath.indexOf('#'));
                    queryPath = queryPath.split('#')[0];
                }
                
                let actualURL = list[1].find(file => file.path == queryPath).url;
                pageLink.href = './?source=einblicke&url=' + (actualURL + queryAnchor);
                
                continue;
            }
            
            // Look for link in databases and update if found
            for (let i = 0; i < list.length; i++) {
                let j = (i + sourceID) % 2,
                    pageIndex = list[j].findIndex(file => compareURLs(file.url, fullURL));
                
                if (pageIndex != -1)
                    pageLink.href = './?source=' + (j == 0 ? 'jamsa' : 'einblicke') + '&url=' + list[j][pageIndex].url;
                else if (i == list.length - 1) {
                    // Redirect to Wayback Machine if link doesn't exist locally
                    pageLink.setAttribute('target', '_blank');
                    pageLink.href = 'https://web.archive.org/web/0/' + fullURL;
                }
            }
        }
        
        // Hide loading icon now that the page has loaded
        document.querySelector('#url > div').style.display = 'none';
    });
})();