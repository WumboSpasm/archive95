/*--------------------+
 | Retrieve JSON data |
 +--------------------*/
function loadJSON(url) {
    return new Promise((resolve, reject) => {
        let request = new XMLHttpRequest();
        request.open('GET', url);
        request.responseType = 'json';
        request.send();
        request.onload = function() { resolve(this.response) };
    });
}

/*------------------------+
 | Correctly compare URLs |
 +------------------------*/
function compareURLs(...urls) {
    if (urls.length > 2)
        urls = urls.slice(0, 2);
    
    urls = urls
        .map(url => decodeURIComponent(url))
        .map(url => url.toLowerCase())
        .map(url => url.includes('index.htm') ? url.substring(0, url.indexOf('index.htm')) : url)
        .map(url => url.startsWith('http://www.') ? 'http://' + url.substring('http://www.'.length) : url)
        .map(url => url.endsWith('/') ? url.substring(0, url.length - 1) : url);
    
    return urls[0] == urls[1];
}


(async function updatePage() {
    let list = await Promise.all([loadJSON('../data/jamsa.json'), loadJSON('../data/einblicke.json')]);
    
    /*------------------+
     | Get query string |
     +------------------*/
    let query = new URLSearchParams(location.search);
    
    if (!query.has('url')) {
        alert('No URL was specified!');
        return;
    }
    
    let sourceID, targetID;
    
    if (query.has('source')) {
        sourceID = query.get('source') == 'jamsa' ? 0 : 1;
        targetID = targetID = list[sourceID].findIndex(file => compareURLs(file.url, query.get('url')));
    }
    else {
        list.some((source, id) => {
            let fileIndex = source.findIndex(file => compareURLs(file.url, query.get('url')));
            
            if (fileIndex != -1) {
                sourceID = id;
                targetID = fileIndex;
                query.append('source', id == 0 ? 'jamsa' : 'einblicke');
                
                return true;
            }
        });
    }
    
    // Redirect to homepage if URL doesn't exist in list
    if (targetID == -1) {
        alert('The URL ' + query.get('url') + ' does not exist in the archive!');
        window.location.replace('../');
        return;
    }
    
    let rootPath    = 'https://archive.org/download/1995archive/1995archive.zip/';
        sourcePath  = query.get('source') == 'jamsa'
                    ? (rootPath + 'jamsa/' + targetID + '.htm')
                    : (rootPath + 'einblicke/' + list[sourceID][targetID].path);
    
    /*----------------------------------+
     | Fill in data at bottom of screen |
     +----------------------------------*/
    // URL text
    document.querySelector('#url').textContent = decodeURIComponent(list[sourceID][targetID].url);
    // Search domain
    document.querySelector('#links a:nth-of-type(1)').href = '../?query=' + new URL(list[sourceID][targetID].url).hostname;
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
        document.querySelector('#switch').hidden = false;
    }
    
    /*-------------------------------+
     | Load and modify embedded page |
     +-------------------------------*/
    let pageRequest = new XMLHttpRequest();
    pageRequest.open('GET', sourcePath);
    
    if (!sourcePath.endsWith('.htm'))
        pageRequest.responseType = 'blob';
    
    pageRequest.send();
    pageRequest.onload = async function() {
        // Apply page title to parent
        if (list[sourceID][targetID].title != undefined && list[sourceID][targetID].title != '') {
            let parsedTitle = new DOMParser().parseFromString(list[sourceID][targetID].title, 'text/html').body.textContent;
            document.title = parsedTitle + ' | Archive95';
        }
        else
            document.title = decodeURIComponent(list[sourceID][targetID].url) + ' | Archive95';
        
        // Handle non-HTML files
        if (sourcePath.endsWith('.jpg') || sourcePath.endsWith('.gif')) {
            let imageEmbed = document.createElement('img');
            imageEmbed.src = window.URL.createObjectURL(this.response);
            document.querySelector('#page > div').append(imageEmbed);
            return;
        }
        else if (!sourcePath.endsWith('.htm')) {
            let fileLink = document.createElement('a');
            fileLink.href = window.URL.createObjectURL(this.response);
            fileLink.download = query.get('url').substring(query.get('url').lastIndexOf('/') + 1);
            fileLink.dispatchEvent(new MouseEvent('click'));
            return;
        }
        
        let pageMarkup = this.response;
        
        // Handle plaintext pages
        if (list[sourceID][targetID].plaintext) {
            document.querySelector('#page > pre').innerHTML = pageMarkup;
            document.querySelector('#page > div').hidden = true;
            document.querySelector('#page > pre').hidden = false;
            return;
        }
        
        // Fix bad markup that can hide large portions of a page in modern browsers
        let lessThan = pageMarkup.indexOf('<');
        
        while (lessThan != -1) {
            let commentStart = pageMarkup.indexOf('<!--', lessThan),
                commentEnd = pageMarkup.indexOf('-->', commentStart),
                greaterThan = pageMarkup.indexOf('>', lessThan);
            
            // Check for and fix comments without ending double hyphen
            if (lessThan == commentStart && commentStart != -1 && pageMarkup.indexOf('<', lessThan + 1) != lessThan + 4 && commentEnd != greaterThan - 2)
                pageMarkup = pageMarkup.substring(0, greaterThan) + '--' + pageMarkup.substring(greaterThan, pageMarkup.length);
            // Check for and fix HTML attributes without ending quotation mark
            else {
                let innerElement = pageMarkup.substring(lessThan + 1, greaterThan),
                    attributeStart = innerElement.lastIndexOf('="');
                
                if (attributeStart != -1 && innerElement.indexOf('"', attributeStart + 2) == -1)
                    pageMarkup = pageMarkup.substring(0, greaterThan) + '"' + pageMarkup.substring(greaterThan, pageMarkup.length);
            }
            
            lessThan = pageMarkup.indexOf('<', lessThan + 1);
        }
        
        /*
        // Add missing closing tags to list elements
        // To-do: Make this not screw up multi-line titles/descriptions
        // (see: http://www.apple.com/ and http://atlasinfo.cern.ch/Atlas/ORGANISATION/general.html)
        pageMarkup = pageMarkup.replaceAll(
            /<dt>(?!.*<\/dt>)(.*$)\n/gim,
            '<dt>$1</dt>'
        ).replaceAll(
            /<dd>(?!.*<\/dd>)(.*$)\n/gim,
            '<dd>$1</dd>'
        );
        */
        
        /*----------------------------------------------+
         | Revert markup changes if source is Einblicke |
         +----------------------------------------------*/
        
        if (query.get('source') == 'einblicke') {
            pageMarkup = pageMarkup.replaceAll(
                // Remove footer
                /\n<hr>\nOriginal: .*? \[\[<a href=".*?">Net<\/a>\]\]\n$/gi,
                ''
            ).replaceAll(
                // Remove duplicate alt attribute
                /(teufel\.gif|link\.gif)" alt="(\[defekt\]|\[image\])"/gi,
                '$1"'
            ).replaceAll(
                // Remove broken page warning
                /^<html><body>\n<img src=".*?noise\.gif">\n<strong>Vorsicht: Diese Seite k&ouml;nnte defekt sein!<\/strong>\n\n<hr>\n/gi,
                ''
            ).replaceAll(
                // Replace missing form elements with neater placeholder
                /<p>\n<strong>Hier sollte eigentlich ein Dialog stattfinden!<\/strong>\n\[\[<a href=".*?">Net<\/a>\]\]\n<p>\n/gi,
                '<p>[[Einblicke ins Internet form placeholder]]</p>'
            )
        }
        
        let pageDocument = new DOMParser().parseFromString(pageMarkup, 'text/html');
        
        if (query.get('source') == 'einblicke') {
            // Remove placeholder images
            pageDocument.querySelectorAll('img:is([src$="teufel.gif"], [src$="link.gif"], [src$="grey.gif"])').forEach(pageImage => {
                if (pageImage.src.endsWith('link.gif') && pageImage.parentNode.nodeName == 'A')
                    pageImage.parentNode.replaceWith(pageImage.hasAttribute('alt') ? pageImage.alt : '[image]');
                else
                    pageImage.replaceWith(pageImage.hasAttribute('alt') ? pageImage.alt : '[image]');
            });
            
            // Revert changes to links
            pageDocument.querySelectorAll('a[href$="fehler.htm"]:not([href^="http://"])').forEach(pageLink => {
                let nextNode = pageLink.nextSibling;
                
                if (nextNode) {
                    if (nextNode.nodeName != '#text' && nextNode.childNodes.length > 0)
                        nextNode = nextNode.childNodes[0];
                        
                    let nextElement = nextNode.nextSibling;
                    
                    if (nextNode.textContent.endsWith('[[')
                     && nextElement && nextElement.nodeName == 'A' && nextElement.textContent == 'Net'
                     && nextElement.nextSibling && nextElement.nextSibling.textContent.startsWith(']]')) {
                        pageLink.href = nextElement.href;
                        
                        pageLink.nextSibling.remove();
                        nextElement.nextSibling.textContent = nextElement.nextSibling.textContent.substring(2);
                        nextElement.remove();
                        
                        return;
                    }
                }
                
                pageLink.replaceWith(...pageLink.childNodes);
            });
        }
        
        /*-----------------------+
         | Fix and update markup |
         +-----------------------*/
        // Copy important attributes from body to root
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
        pageDocument.querySelectorAll('img').forEach(pageImage => {
            let imageIndex;
            
            if (query.get('source') == 'jamsa') {
                let queryURL = new URL(pageImage.getAttribute('src'), list[sourceID][targetID].url).href;
                imageIndex = list[1].findIndex(img => compareURLs(img.url, queryURL));
            }
            else {
                let queryPathFull = new URL(pageImage.getAttribute('src'), sourcePath).href,
                    queryPath = queryPathFull.substring((rootPath + 'einblicke/').length);
                
                imageIndex = list[1].findIndex(img => img.path == queryPath);
            }
            
            if (imageIndex != -1) {
                pageImage.src = rootPath + 'einblicke/' + list[1][imageIndex].path;
            }
            else {
                if (pageImage.hasAttribute('alt'))
                    pageImage.insertAdjacentText('afterend', pageImage.alt);
                else if (pageImage.src && pageImage.src.length > 1)
                    pageImage.insertAdjacentText('afterend', ' ' + pageImage.src.substring(pageImage.src.lastIndexOf("/") + 1) + ' ');
                
                pageImage.remove();
            }
        });
        
        // Fix <marquee> instances using a very old and unsupported format
        pageDocument.querySelectorAll('marquee').forEach(oldMarquee => {
            let newMarquee = document.createElement('marquee');
            newMarquee.textContent = oldMarquee.getAttribute('text');
            
            oldMarquee.replaceWith(newMarquee, ...oldMarquee.childNodes);
        });
        
        // Remove unneeded HTML tags/elements
        let unneededElements = [ 'head', 'header', 'link', 'meta', 'form' ],
            unneededTags = [ 'title', 'base', 'nextid' ];
        
        pageDocument.querySelectorAll('*').forEach(node => {
            if (unneededElements.includes(node.nodeName.toLowerCase()))
                node.replaceWith(...node.childNodes);
            else if (unneededTags.includes(node.nodeName.toLowerCase()))
                node.remove();
        });
        
        // Apply modified HTML to div
        document.querySelector('#page > div').innerHTML = pageDocument.documentElement.innerHTML;
        
        // Redirect links to archival sites
        for (let l = 0; l < document.querySelectorAll('#page > div a[href]').length; l++) {
            await new Promise(resolve => setTimeout(resolve));
            
            let pageLink = document.querySelectorAll('#page > div a[href]')[l],
                fullURL;
            
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
        };
    };
})()