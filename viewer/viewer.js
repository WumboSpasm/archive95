/*-------------------+
 | Helpful functions |
 +-------------------*/

// Correctly compare URLs
function compareURLs(...urls) {
    if (urls.length > 2)
        urls = urls.slice(0, 2);
    
    urls = urls.map(url => {
        try { return decodeURIComponent(url); } catch { }
    }).map(url => url.toLowerCase().replace(/^http:\/\/(www\.|)/i, '').replace(/\/$/, ''));
    
    return urls[0] == urls[1];
}

// Prevent image from loading, add alt text if necessary
function sanitizeImage(pageImage, useFilename = true) {
    if (!pageImage.hasAttribute('alt')) {
        if (useFilename && pageImage.hasAttribute('src') && pageImage.src.length > 1)
            pageImage.alt = pageImage.src.substring(pageImage.src.lastIndexOf('/') + 1, pageImage.src.lastIndexOf('.'));
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

// Replace page content with error message
function displayError(message) {
    document.querySelectorAll('#page, #footer').forEach(elem => elem.remove());
    let error = document.querySelector('#error');
    error.hidden = false;
    error.querySelector('#message').innerText = message;
}

// Handle everything
fetch('../data.json').then(r => r.json()).then(json => {
    /*------------------+
     | Get query string |
     +------------------*/
    let query = new URLSearchParams(location.search);
    
    if (!query.has('url')) {
        displayError('No URL was specified.');
        return;
    }
    
    let sourceIndex = -1,
        entryIndex  = -1;
    
    // If source is specified, expect URL to reside inside it
    if (query.has('source')) {
        let querySource = query.get('source').toLowerCase();
        sourceIndex = json.findIndex(source => querySource == source.id.toLowerCase());
        
        if (sourceIndex != -1)
            entryIndex = json[sourceIndex].entries.findIndex(entry => compareURLs(entry.url, query.get('url')));
        else {
            displayError('The specified source is invalid.');
            return;
        }
    }
    // Otherwise, search the entire database for the URL
    else {
        json.some((source, s) => {
            let foundEntry = source.entries.some((entry, e) => {
                if (compareURLs(entry.url, query.get('url'))) {
                    sourceIndex = s;
                    entryIndex  = e;
                    query.append('source', source.id);
                    return true;
                }
            });
            
            if (foundEntry) return true;
        });
    }
    
    // Redirect to homepage if URL doesn't exist in list
    if (entryIndex == -1) {
        displayError('The specified URL does not exist in the archive.');
        return;
    }
    
    let source = json[sourceIndex],
        entry  = source.entries[entryIndex],
    
        archiveURL = 'https://archive.org/download/1995archive/1995archive.zip/',
        fullURL    = archiveURL + source.id + '/' + entry.path;
    
    /*----------------------------------+
     | Fill in data at bottom of screen |
     +----------------------------------*/
    // URL text
    document.querySelector('#url span').textContent = decodeURIComponent(entry.url);
    // Search domain
    document.querySelector('#links a:nth-of-type(1)').href = '../?query=' + new URL(entry.url).hostname.replace(/^(www\.|)/i, '');
    // View in Wayback Machine
    document.querySelector('#links a:nth-of-type(2)').href = 'https://web.archive.org/web/0/' + entry.url;
    // View original file
    document.querySelector('#links a:nth-of-type(3)').href = fullURL;
    // Source
    document.querySelector('#source a').textContent = source.title;
    document.querySelector('#source a').href = source.url;
    document.querySelector('#source span').textContent = source.date;
    // See earlier/newer version
    for (let i = 0; i < json.length; i++) {
        if (i != sourceIndex) {
            let altEntry = json[i].entries.find(e => compareURLs(e.url, query.get('url')));
            if (altEntry != undefined) {
                let altLink = document.querySelector('#source a:nth-of-type(' + (i < sourceIndex ? 2 : 3) + ')');
                altLink.href = '?source=' + json[i].id + '&url=' + altEntry.url;
                altLink.hidden = false;
            }
        }
    }
    // Screenshot
    if (source.images != '') {
        let imageURL = archiveURL + source.id + '/' + source.images + '/' + entryIndex + '.png';
        document.querySelector('#picture img').src = imageURL;
        document.querySelector('#picture a').href  = imageURL;
        document.querySelector('#picture').hidden  = false;
    }
    
    /*-------------------------------+
     | Load and modify embedded page |
     +-------------------------------*/
    fetch(fullURL).then(r => ['.htm', '.html', '.txt'].some(ext => fullURL.endsWith(ext)) ? r.text() : r.blob()).then(async response => {
        // Apply page title to parent
        document.title = (entry.title != undefined && entry.title != ''
            ? new DOMParser().parseFromString(entry.title, 'text/html').body.textContent
            : decodeURIComponent(entry.url)
        ) + ' | Archive95';
        
        // Handle non-HTML files
        if (!['.htm', '.html'].some(ext => fullURL.endsWith(ext))) {
            if (['.jpg', '.gif', '.xbm'].some(ext => fullURL.endsWith(ext))) {
                let imageEmbed = document.createElement('img');
                
                if (fullURL.endsWith('.xbm'))
                    imageEmbed.src = await parseXBM(fullURL);
                else
                    imageEmbed.src = URL.createObjectURL(response);
                
                document.querySelector('#page > div').append(imageEmbed);
            }
            else if (fullURL.endsWith('.wav')) {
                let audioEmbed = document.createElement('audio');
                audioEmbed.src = URL.createObjectURL(response);
                audioEmbed.controls = true;
                document.querySelector('#page > div').append(audioEmbed);
            }
            else if (fullURL.endsWith('.txt')) {
                document.querySelector('#page > pre').innerHTML = response;
                document.querySelector('#page > pre').hidden = false;
            }
            else {
                let fileLink = document.createElement('a');
                fileLink.href = URL.createObjectURL(response);
                fileLink.download = query.get('url').substring(query.get('url').lastIndexOf('/') + 1);
                fileLink.dispatchEvent(new MouseEvent('click'));
            }
            
            document.querySelector('#url > div').style.display = 'none';
            return;
        }
        
        let pageMarkup = response;
        
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
        
        /*----------------------------------------------------------+
         | Revert markup changes specific to Einblicke ins Internet |
         +----------------------------------------------------------*/
        if (source.id == 'einblicke') {
            pageMarkup = pageMarkup.replace(
                // Remove footer
                /(\r?)(\n?)<hr>(\r?)(\n?)Original: .*? \[\[<a href=".*?">Net<\/a>\]\](\r?)(\n?)$/gi,
                ''
            ).replace(
                // Remove duplicate alt attribute
                /(teufel\.gif|link\.gif)" alt="(\[defekt\]|\[image\])"/gi,
                '$1"'
            ).replace(
                // Remove broken page warning
                /^<html><body>(\r?)(\n?)<img src=".*?noise\.gif">(\r?)(\n?)<strong>Vorsicht: Diese Seite k&ouml;nnte defekt sein!<\/strong>(\r?)(\n?)(\r?)(\n?)<hr>(\r?)(\n?)/gi,
                ''
            ).replace(
                // Replace missing form elements with neater placeholder
                /<p>(\r?)(\n?)<strong>Hier sollte eigentlich ein Dialog stattfinden!<\/strong>(\r?)(\n?)\[\[<a href=".*?">Net<\/a>\]\](\r?)(\n?)<p>(\r?)(\n?)/gi,
                '<p>[[Einblicke ins Internet form placeholder]]</p>'
            )
        }
        
        let pageDocument = new DOMParser().parseFromString(pageMarkup, 'text/html');
        
        if (source.id == 'einblicke') {
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
            
            if (!pageImage.hasAttribute('src')) continue;
            
            let imagePath = '';
            let imageURL = source.id != 'einblicke'
                ? new URL(pageImage.getAttribute('src'), entry.url).href
                : new URL(pageImage.getAttribute('src'), fullURL).href.substring((archiveURL + source.id + '/').length);
            
            if (source.id == 'einblicke' && imageURL.startsWith('icons/'))
                imagePath = source.id + '/' + imageURL;
            else {
                for (let i = 0; i < json.length; i++) {
                    let imageIndex = source.id != 'einblicke'
                        ? json[i].entries.findIndex(img => compareURLs(img.url, imageURL))
                        : json[i].entries.findIndex(img => img.path == imageURL);
                    
                    if (imageIndex != -1) {
                        imagePath = json[i].id + '/' + json[i].entries[imageIndex].path;
                        break;
                    }
                }
            }
            
            if (imagePath != '')
                pageImage.src = !imagePath.endsWith('.xbm')
                    ? archiveURL + imagePath
                    : await parseXBM(archiveURL + imagePath);
            else
                sanitizeImage(pageImage);
        }
        
        // Fix <marquee> instances using a very old and unsupported format
        pageDocument.querySelectorAll('marquee').forEach(oldMarquee => {
            let newMarquee = document.createElement('marquee');
            newMarquee.textContent = oldMarquee.getAttribute('text');
            
            oldMarquee.replaceWith(newMarquee, ...oldMarquee.childNodes);
        });
        
        // Get rid of unneeded HTML tags
        pageDocument.querySelectorAll(':is(base, form, head, header, link, meta, nextid)').forEach(node => node.replaceWith(...node.childNodes));
        pageDocument.querySelectorAll('title').forEach(node => node.remove());
        
        // Apply modified HTML to div
        document.querySelector('#page > div').innerHTML = pageDocument.documentElement.innerHTML;
        
        // Redirect links to archival sites
        for (let pageLink of document.querySelectorAll('#page > div a[href]')) {
            await new Promise(resolve => setTimeout(resolve));
            
            let linkURL;
            
            try {
                linkURL = new URL(pageLink.getAttribute('href'), entry.url).href;
            }
            // Catch invalid links
            catch {
                pageLink.setAttribute('target', '_blank');
                pageLink.href = 'https://web.archive.org/web/0/' + pageLink.href;
                continue;
            }
            
            // Ignore anchors and non-HTTP links
            if (!linkURL.startsWith('http://') || pageLink.getAttribute('href').startsWith('#'))
                continue;
            
            // Update local Einblicke links
            if (source.id == 'einblicke' && pageLink.href.startsWith(location.origin)) {  
                let queryPathFull = new URL(pageLink.getAttribute('href'), fullURL).href,
                    queryPath = queryPathFull.substring((archiveURL + 'einblicke/').length),
                    queryAnchor = '';
                
                if (queryPath.indexOf('#') != -1) {
                    queryAnchor = queryPath.substring(queryPath.indexOf('#'));
                    queryPath = queryPath.split('#')[0];
                }
                
                let actualURL = source.entries.find(entry => entry.path == queryPath).url;
                pageLink.href = './?source=' + source.id + '&url=' + (actualURL + queryAnchor);
                
                continue;
            }
            
            // Look for link in databases and update if found
            for (let i = 0; i < json.length; i++) {
                let pageIndex = json[i].entries.findIndex(entry => compareURLs(entry.url, linkURL));
                
                if (pageIndex != -1)
                    pageLink.href = './?source=' + json[i].id + '&url=' + json[i].entries[pageIndex].url;
                else if (i == json.length - 1) {
                    // Redirect to Wayback Machine if link doesn't exist locally
                    pageLink.setAttribute('target', '_blank');
                    pageLink.href = 'https://web.archive.org/web/0/' + linkURL;
                }
            }
        }
        
        // Hide loading icon now that the page has loaded
        document.querySelector('#url > div').style.display = 'none';
    });
});