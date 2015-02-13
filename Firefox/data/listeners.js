/*******************************************************************************
 * Copyright (c) 2015 Ivo van Kamp
 *
 * This file is part of Axon.
 *
 * Axon is free software: you can redistribute it and/or modify
 * it under the terms of the GNU General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 *
 * Axon is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
 * GNU General Public License for more details.
 *
 * You should have received a copy of the GNU General Public License
 * along with this program.  If not, see <http://www.gnu.org/licenses/>.
 *******************************************************************************/

"use strict";

(function() {
 
    var global                           = {};    // used by DOM and Worker listeners
    global.dictionaryData                = {};    // dictionaryData variables are initialized in domListeners.js templateListener
    global.config                        = {};    // container for add-on configuration parameters
    global.config.runtime                = {};    // runtime configuration parameters
    global.selectedTextPosition          = null;  // bounding dimensions of selected text
    global.originalSelectedTextString    = "";    // unfiltered selected text
    global.selectedTextString            = "";    // filtered selected text
    global.suggestedTextString           = "";    // Wikipedia suggested correction to selectedTextString
    global.isTextBubbleAboveSelectedText = true;  // whereabouts of definition speech bubble to correctly position example text
    global.isTemplateLoaded              = false; // prevents loading template multiple times
    global.mustCancelOperations          = false; // cancel calls in process after esc, close button, or clicking next to the speech bubbles
    global.modifierKeyPressedString      = "";    // the modifier key held down during double-click

    // Wordnik dictionary titles
    const FULL_TITLE_AHD                 = "The American Heritage Dictionary 4E";
    const FULL_TITLE_WIKTIONARY          = "Wiktionary";
    const FULL_TITLE_GCIDE               = "GNU Collaborative International Dictionary of English";
    const FULL_TITLE_CENTURY             = "The Century Dictionary and Cyclopedia";
    const FULL_TITLE_WORDNET             = "WordNet 3.0 by Princeton University";

    // Wordnik dictionaries online
    const SEARCH_URL_AHD                 = "https://www.ahdictionary.com/word/search.html?q=";
    const SEARCH_URL_WIKTIONARY          = "https://en.wiktionary.org/wiki/";
    const SEARCH_URL_GCIDE               = "http://gcide.gnu.org.ua/?db=gcide&define=1&q=";
    const SEARCH_URL_CENTURY             = "http://www.micmap.org/dicfro/search/century-dictionary/";
    const SEARCH_URL_WORDNET             = "http://wordnetweb.princeton.edu/perl/webwn?s=";

    // Wordnik and Wikipedia URLs
    const SEARCH_URL_WORDNIK             = "https://www.wordnik.com/words/";
    const SEARCH_URL_WIKIPEDIA           = "https://{LANGUAGECODE}.wikipedia.org/wiki/";
    const SEARCH_URL_SPECIAL_WIKIPEDIA   = "https://{LANGUAGECODE}.wikipedia.org/wiki/Special:Search/";
    const GOOGLE_DEFINE_URL              = "https://www.google.com/search?hl=en&q=define+"
    const GOOGLE_NORMAL_URL              = "https://www.google.com/search?q="

    // Miscellaneous
    const START_OF_SEARCH_TEXT           = "Searching...";
    const NO_MATCH_FOUND_TEXT            = "No match found on ";
    const NO_MATCH_FOUND_WIKI_ZONE       = ".wikipedia.org";
    const ENGLISH_LANGUAGE_CODE          = "en";
    const MODIFIER_KEYS                  = {"ctrl": "ctrlKey", "shift": "shiftKey", "alt": "altKey", "cmd": "metaKey"};

    // Function from jQuery JavaScript Library v1.11.2
    function isEmpty( obj ) {
        var name;
        for ( name in obj ) {
            return false;
        }
        return true;
    }

    function emptyElement(element) {
        while ( element.firstChild ) {
            element.removeChild( element.firstChild );
        }
    }

    function setAnnotationBubbleTextAndAudio() {

        document.getElementById('axon-annotation-container').className = ""; // Remove class displayNone
        var annotationMore = document.getElementById('annotation-more');
        var annotationAttribution = document.getElementById('annotation-attribution');

        if (global.dictionaryData.title==="") {
            document.getElementById('annotation-title-row').className = "displayNone";
            annotationMore.className = "displayNone";
            annotationAttribution.className= "displayNone";
        }
        else {

            document.getElementById('annotation-title-row').className = "";
            var annotationTitle = document.getElementById('annotation-title');
            insertTextIntoElement(global.dictionaryData.title, annotationTitle);

            annotationAttribution.className = "";
            annotationAttribution.firstChild.setAttribute('href', global.dictionaryData.attributionURL);
            parseHTMLAndInsertIntoElement(global.dictionaryData.attributionText, annotationAttribution.firstChild, true);

            switch (global.dictionaryData.source) {

                case "wikipedia":
                    annotationMore.className = "";
                    /* Google 'define' keyword only works for English */
                    var googleURL = global.config.runtime.wikipediaLanguageCode === ENGLISH_LANGUAGE_CODE ? GOOGLE_DEFINE_URL : GOOGLE_NORMAL_URL;
                    annotationMore.firstChild.setAttribute('href', googleURL + global.dictionaryData.title);
                    break;

                case "wordnik":
                    annotationMore.className = "";
                    annotationMore.firstChild.setAttribute('href', SEARCH_URL_WORDNIK + global.dictionaryData.title);
                    break;
            }
        }

        var annotationDefinition = document.getElementById('annotation-definition');
        parseHTMLAndInsertIntoElement(global.dictionaryData.definitionText, annotationDefinition, true);

        if (global.dictionaryData.audioFileURL==="") {
            document.getElementById('annotation-audio-icon').className = "displayNone";
        }
        else {
            document.getElementById('annotation-audio-icon').className = "";
            insertTextIntoElement(global.dictionaryData.audioFileURL, document.getElementById('annotation-audio-icon').firstChild);
        }
    }

    function setInnerOuterTailDirection(elementPrefix, from, to) {
        ["inner", "outer"].forEach(function(level) {
            var element = document.getElementById(elementPrefix+"-"+level+"-"+from);
            if (element!==null) {
                // Change classname suffix from 'left' to 'right', 'up' to 'down' or vice versa
                element.id = elementPrefix+"-"+level+"-"+to;
            }
        });
    }

    function setAnnotationBubblePosition(forceDirectionDown) {

        var bubbleHeight = document.getElementById('annotation-main').offsetHeight;

        if (typeof global.selectedTextPosition!=="undefined") {

            document.getElementById('annotation-tail-main').style.left = (global.selectedTextPosition.leftCenter-10)+"px";
            document.getElementById('annotation-main').style.left      = (global.selectedTextPosition.leftCenter-150)+"px";

            if (forceDirectionDown===false || typeof(forceDirectionDown)==='undefined' &&
                    // Check if there is enough room above the selected text for the speech bubble
                    window.scrollY < (global.selectedTextPosition.top - bubbleHeight - 12))
            {
                global.isTextBubbleAboveSelectedText = true;
                setInnerOuterTailDirection("annotation-tail", "up", "down");
                document.getElementById('annotation-tail-main').style.top = (global.selectedTextPosition.top-11)+"px";
                document.getElementById('annotation-main').style.top      = (global.selectedTextPosition.top-bubbleHeight-10)+"px";
            }
            else {
                global.isTextBubbleAboveSelectedText = false;
                setInnerOuterTailDirection("annotation-tail", "down", "up");
                document.getElementById('annotation-tail-main').style.top = (global.selectedTextPosition.bottom+2)+"px";
                document.getElementById('annotation-main').style.top      = (global.selectedTextPosition.bottom+10)+"px";
            }
        }
    }

    function showAnnotationBubble() {
        setAnnotationBubbleTextAndAudio();
        setAnnotationBubblePosition();
    };

    function showExampleBubble(isSecondAttempt) {

        // Display example block and set text in order to calculate height correctly
        document.getElementById('axon-example-container').className = "";
        parseHTMLAndInsertIntoElement(global.dictionaryData.exampleText, document.getElementById('example-text'), true);
        
        var exampleAttribution = document.getElementById('example-attribution');
        exampleAttribution.firstChild.setAttribute('href', global.dictionaryData.exampleURL);
        parseHTMLAndInsertIntoElement(global.dictionaryData.exampleTitle, exampleAttribution.firstChild, true);

        var annotationBubbleHeight = document.getElementById('annotation-main').offsetHeight;
        var exampleBubbleHeight = document.getElementById('example-main').offsetHeight;
        var canExampleFitNextToAnnotation = false;

        if (typeof global.selectedTextPosition!=="undefined") {

            var mainOffset = 0;
            var tailOffset = 0;

            if (global.isTextBubbleAboveSelectedText) {

                mainOffset = -(annotationBubbleHeight/2)-(exampleBubbleHeight/2)-14;
                tailOffset = -annotationBubbleHeight/2-25;

                // If there is no room for the example above the selected text then try
                // to reposition the definition bubble (once).
                if ((typeof(isSecondAttempt)==="undefined" || isSecondAttempt===false) && 
                    window.scrollY > (global.selectedTextPosition.top + mainOffset))
                {
                    setAnnotationBubblePosition(true/*force direction down*/);
                    showExampleBubble(true);
                    return;
                }
            }
            else {
                mainOffset = +(annotationBubbleHeight-exampleBubbleHeight)/2+25;
                tailOffset = +annotationBubbleHeight/2+15;
            }

            document.getElementById('example-tail-main').style.top  = (global.selectedTextPosition.top+tailOffset)+"px";
            document.getElementById('example-main').style.top        = (global.selectedTextPosition.top+mainOffset)+"px";

            // Check if there is room on the right
            if (window.innerWidth > global.selectedTextPosition.leftCenter+475 ) {
                canExampleFitNextToAnnotation = true;
                setInnerOuterTailDirection("example-tail", "right", "left");
                document.getElementById('example-tail-main').style.left = (global.selectedTextPosition.leftCenter+152)+"px";
                document.getElementById('example-main').style.left       = (global.selectedTextPosition.leftCenter+161)+"px";
            }
            else {
                // Check if there is room on the left
                if (global.selectedTextPosition.leftCenter>465 ) {
                    canExampleFitNextToAnnotation = true;
                    setInnerOuterTailDirection("example-tail", "left", "right");
                    document.getElementById('example-tail-main').style.left = (global.selectedTextPosition.leftCenter-150-12)+"px";
                    document.getElementById('example-main').style.left       = (global.selectedTextPosition.leftCenter-461)+"px";
                }
            }
            if (!canExampleFitNextToAnnotation)
                document.getElementById('axon-example-container').className = "displayNone";
        }
    };

    self.port.on("wordnikExamplesListener", function(examplesResponse) {

        if (global.mustCancelOperations === true) return;
        examplesResponse = JSON.parse(examplesResponse);

        if (!isEmpty(examplesResponse)) {

            // Pick a random example
            var randomNumber = Math.floor(Math.random()*(examplesResponse.examples.length-1));
            var randomExample = examplesResponse.examples[randomNumber];

            // Change font weight of all occurrences of searchword to bold in the random example text.
            // The searchword should not be surrounded by letters or numbers (i.e. contained in another word).
            // Example:
            //   global.selectedTextString = 'diagnoses'  -- the selected text
            //   global.dictionaryData.title = 'diagnose' or 'diagnosis' -- can be Wordnik canonical / Wikipedia redirect / Wikipedia suggestion
            var selectedWordRegExp  = new RegExp("(^|[^A-za-z0-9]+)("+global.selectedTextString+")([^A-za-z0-9]+|$)","gi");
            var canonicalWordRegExp = new RegExp("(^|[^A-za-z0-9]+)("+global.dictionaryData.title+")([^A-za-z0-9]+|$)","gi");

            var randomExampleText = randomExample.text;
            randomExampleText = randomExampleText.replace(selectedWordRegExp, "$1<span class='boldItalic'>$2</span>$3");
            randomExampleText = randomExampleText.replace(canonicalWordRegExp, "$1<span class='boldItalic'>$2</span>$3");
            global.dictionaryData.exampleText = randomExampleText;

            global.dictionaryData.exampleTitle = randomExample.title;
            global.dictionaryData.exampleURL = randomExample.url;
            showExampleBubble();
        }

    });

    function getFileExtension(filename) {
        var a = filename.trim().split(".");
        if( a.length === 1 || ( a[0] === "" && a.length === 2 ) ) {
            return "";
        }
        return a.pop().toLowerCase();
    }

    function getLanguageCode() {
        var languageCode = ENGLISH_LANGUAGE_CODE;
        if (global.dictionaryData.source === "wikipedia") {
            languageCode = global.config.runtime.wikipediaLanguageCode;
        }
        return languageCode;
    }
 
    self.port.on("wiktionaryAudioFileURLListener", function(response) {

        if (global.mustCancelOperations === true) return;
        response = JSON.parse(response);

        var pageKey = Object.keys(response.query.pages)[0];

        if (pageKey!=="-1") {
            var page = response.query.pages[pageKey];
            var fileURL = page.imageinfo[0].url;
            global.dictionaryData.audioFileURL = fileURL;
            // Show speaker symbol. Click symbol to play file.
            showAnnotationBubble();
        }
    });

    self.port.on("wiktionaryAudioListener", function(response) {

        if (global.mustCancelOperations === true) return;
        response = JSON.parse(response);

        var pageKey = response!=null && Object.keys(response.query.pages)[0] || -1;

        if (pageKey!=="-1") {

            var page = response.query.pages[pageKey];
            var audioFileFound = false;

            if (typeof page.images !== 'undefined') {
                page.images.forEach(function(image, index, array) {

                    if (audioFileFound) return;

                    // E.g. 'Fichier:' -> 'File:' because commons.wikimedia.org
                    // only speaks English.
                    var fileNameWithPrefix = image.title.replace(/.*:/,"File:");
                    var fileName = image.title.replace(/.*:/,"");

                    // If the found file is in the current language 
                    // then check for audio extensions.
                    if (fileName.toLowerCase().indexOf(getLanguageCode())===0) {
 
                        var extension = getFileExtension(fileName);

                        if (['ogg','flac','wav'].indexOf(extension)!==-1) {

                            audioFileFound = true;

                            self.port.emit("sendGetRequest", {
                                type         : "wiktionaryAudioFileURL",
                                searchString : fileNameWithPrefix,
                                languageCode : getLanguageCode(),
                                onComplete   : "wiktionaryAudioFileURLListener"
                            });

                        }
                    }
                });
            }
        }
    });

    self.port.on("wordnikAudioListener", function(audioResponse) {

        if (global.mustCancelOperations === true) return;
        audioResponse = JSON.parse(audioResponse);
        var macmillan = null;

        if (audioResponse!==null) {

            audioResponse.forEach(function(element, index, array) {

                // Skip AHD (pronunciation unclear)
                if (element.createdBy!=='ahd')
                    global.dictionaryData.audioFileURL = element.fileUrl;

                // Save Macmillan
                if (element.createdBy==='macmillan')
                    macmillan = element.fileUrl;
            });

            // Prefer Macmillan
            if (macmillan!==null)
                global.dictionaryData.audioFileURL = macmillan;
        }

        if (global.dictionaryData.audioFileURL === "") {
            self.port.emit("sendGetRequest", {
                type         : "wiktionaryAudio",
                searchString : global.dictionaryData.title,
                languageCode : getLanguageCode(),
                onComplete   : "wiktionaryAudioListener"
            });
        }
        else {
            showAnnotationBubble();
        }
    });

    // Count characters not part of HTML tags and truncate
    // after maxNrOfCharacters.
    function htmlTruncate(str, maxNrOfCharacters) {
        var inTag = false;
        var isSpace = false;
        var c='', i=0, count=0;

        while (c=str[i++]) {
            if (c==="<") inTag=true;
            if (!inTag) ++count;
            if (c===">") inTag=false;
            isSpace = (c===" ");

            if (count>=maxNrOfCharacters && !inTag && isSpace) {
                // Truncate and add ellipsis
                return str.substring(0, i)+" ...";
            }
        }
        return str.substring(0, i);
    }

    function filterDefinitionText(text) {

        // Truncate text to 300 characters
        text = htmlTruncate(text, 300);

        // Definition not allowed to end in ', especially:'
        text = text.replace(/^(.*),\sespecially:$/g, "$1.");

        // Wikipedia definitions start with bold. Remove bold tags
        // because the title above is already bold.
        text = text.replace(/(<b>)([^]*?)(<\/b>)/gi, "$2");

        return text;
    }

    self.port.on("errorListener", function(response) {
        global.mustCancelOperations = true;
        var errorContainer = JSON.parse(response);
        initializeDictionaryData();
        global.dictionaryData.definitionText = "<b>"+errorContainer.title+"</b><div style='margin:5px 0;'></div>";
        global.dictionaryData.definitionText += errorContainer.error;
        showAnnotationBubble();
    });

    self.port.on("wikipediaSuggestionListener", function(response) {

        if (global.mustCancelOperations === true) return;
        var response = JSON.parse(response);

        if (!isEmpty(response)) {


            var suggestion = response.query.searchinfo.suggestion;

            if (typeof suggestion==='undefined') {
                // If the first found Wikipedia title occurs in selectedTextString
                // (e.g. singular part of plural) then use this title.
                if (response.query.search.length>0 &&
                        global.selectedTextString.toLowerCase().indexOf(response.query.search[0].title.toLowerCase())!==-1) 
                {
                    global.suggestedTextString = response.query.search[0].title;
                }
            }
            else {
                global.suggestedTextString = suggestion;
            }

            if (isEmpty(global.suggestedTextString)) {
                showNoDefinitionFound();
            }
            else {
                getWordnikOrWikipediaEntry();
            }
        }
    });

    function getRandomExampleIfEnabled() {

        if (global.config.isRandomExampleEnabled) {

            self.port.emit("sendGetRequest", {
                type         : "wordnikExamples",
                // Selecting a single ampersand character will be translated to 'Ampersand'
                // by Wikipedia. Prevent the Wordnik API from choking on the single character.
                searchString : doesStringContainAlpha(global.selectedTextString) ? global.selectedTextString : global.dictionaryData.title,
                onComplete   : "wordnikExamplesListener"
            });
        }
    }

    function getPronunciation() {

        if (getLanguageCode() === ENGLISH_LANGUAGE_CODE) {
            self.port.emit("sendGetRequest", {
                type         : "wordnikAudio",
                searchString : global.dictionaryData.title,
                onComplete   : "wordnikAudioListener"
            });
        }
        else { 
            self.port.emit("sendGetRequest", {
                type         : "wiktionaryAudio",
                searchString : global.dictionaryData.title,
                languageCode : global.config.runtime.wikipediaLanguageCode,
                onComplete   : "wiktionaryAudioListener"
            });
        }
    }

    function createAnchorElement(text, URL) {
        // New anchor: <a target="_blank" href="https://en.wikipedia.org/wiki/Special:Search/[SEARCHSTRING]">[LANGCODE].wikipedia.org</a>
        var newAnchorElement = document.createElement('a');
        newAnchorElement.setAttribute('href', URL);
        newAnchorElement.setAttribute('target', '_blank');
        insertTextIntoElement(text, newAnchorElement);

        // Beat mouseup to the chase
        newAnchorElement.addEventListener('mousedown', function(e) {
            if (e.which===1) // left mouse button
                global.mustIgnoreMouseUp = true; // enable links inside speech bubble
        });
        return newAnchorElement;
    }
 
    function showNoDefinitionFound() {
        var wikipediaURL = SEARCH_URL_SPECIAL_WIKIPEDIA.replace(/{LANGUAGECODE}/, global.config.runtime.wikipediaLanguageCode);
        wikipediaURL += global.selectedTextString;
        var wikipediaDomain = global.config.runtime.wikipediaLanguageCode + NO_MATCH_FOUND_WIKI_ZONE;
        global.dictionaryData.definitionText = NO_MATCH_FOUND_TEXT;

        setAnnotationBubbleTextAndAudio();
        var annotationDefinition = document.getElementById('annotation-definition');
        var newAnchorElement = createAnchorElement(wikipediaDomain, wikipediaURL);
        annotationDefinition.insertBefore(newAnchorElement, null);
        setAnnotationBubblePosition();
    }

    function isStringAlpha(character) {
        var code = character.charCodeAt(0);
        // A-Z or a-z
        return (code >=65 && code <= 90) || (code >=97 && code <= 122);
    }

    function doesStringContainAlpha(str) {
        var c='', i=0;
        while (c=str[i++]) {
            if (isCharacterAlpha(c)) return true;
        }
        return false;
    }

    function isCharacterAlpha(character) {
        var code = character.charCodeAt(0);
        // A-Z or a-z
        return (code >=65 && code <= 90) || (code >=97 && code <= 122);
    }

    // Check if Wikipedia tag {{Lowercase title}} might be present.
    // Required for: eBay, iPhone, etc.
    function areFirstTwoLettersUppercase(title) {

        if (title.length<3) return false;

        // If the first and second character of the Wikipedia title are in
        // uppercase, and all the others are in lowercase, then the first
        // letter could be lowercase (e.g. eBay, iPhone, etc).
        // This is not allowed on Wikipedia but corrected with the tag
        // {{Lowercase title}}. A Wikipedia API call returning the title of
        // a page however won't take this tag into account.
        // See also: http://www.adherecreative.com/blog/bid/181249/The-Case-for-Lower-Case-A-Rebranding-Conundrum
        var c='', i=0;
        while (c=title[i++]) {

            if ( i>3 && c===" " ) return true;

            // IP<3 hone>3
            if ( c!==( i<3 ? c.toUpperCase() : c.toLowerCase() ) || !isCharacterAlpha(c) )
                return false;
        }
        return true;
    }

    self.port.on("wikipediaParsedPageDisplayTitleListener", function(response) {

        if (global.mustCancelOperations === true) return;
        response = JSON.parse(response);
        global.dictionaryData.title = response.parse.displaytitle;

        showAnnotationBubble();
        getPronunciation();
        getRandomExampleIfEnabled();
    });

    self.port.on("wikipediaExtractListener", function(definitionResponse) {

        if (global.mustCancelOperations === true) return;
        definitionResponse = JSON.parse(definitionResponse);

        if (!isEmpty(definitionResponse)) {

            var pageKey = Object.keys(definitionResponse.query.pages)[0];

            if (pageKey==="-1") {

                // If no suggestion has been tried, search for suggestion
                if (global.suggestedTextString==="") {
                    self.port.emit("sendGetRequest", {
                        type         : "wikipediaSuggestion",
                        searchString : global.selectedTextString,
                        languageCode : global.config.runtime.wikipediaLanguageCode,
                        onComplete   : "wikipediaSuggestionListener"
                    });
                }
                else {
                    // Reset suggestion. Otherwise infinite loop.
                    global.suggestedTextString = "";
                    showNoDefinitionFound();
                }
            }
            else {
                // Reset suggestion. Otherwise infinite loop.
                global.suggestedTextString = "";

                var page = definitionResponse.query.pages[pageKey];
                var title = page.title;

                global.dictionaryData.title = title;
                global.dictionaryData.definitionText = filterDefinitionText(page.extract);
                global.dictionaryData.source = "wikipedia";

                var wikipediaURL = SEARCH_URL_WIKIPEDIA.replace(/{LANGUAGECODE}/, global.config.runtime.wikipediaLanguageCode);
                wikipediaURL += global.dictionaryData.title;
                global.dictionaryData.attributionURL  = wikipediaURL;
                global.dictionaryData.attributionText = wikipediaURL.replace(/https?:\/\//gi,"");

                // Check if title has first two letters capitalized.
                // E.g. EBay, IPhone, etc.
                if (title.length>2 && areFirstTwoLettersUppercase(title)) {

                    // Fetch the actual display title from Wikipedia
                    self.port.emit("sendGetRequest", {
                        type         : "wikipediaParsedPageDisplayTitle",
                        searchString : title,
                        languageCode : global.config.runtime.wikipediaLanguageCode,
                        onComplete   : "wikipediaParsedPageDisplayTitleListener"
                    });
                }
                else {
                    showAnnotationBubble();
                    getPronunciation();
                    getRandomExampleIfEnabled();
                }
            }
        }
    });

    self.port.on("definitionListener", function(definitionResponse) {

        if (global.mustCancelOperations === true) return;
        definitionResponse = JSON.parse(definitionResponse);

        if (!isEmpty(definitionResponse)) {

            // Reset suggestion
            global.suggestedTextString = "";

            var dictionaryData = global.dictionaryData;
            dictionaryData.title = definitionResponse[0].word;
            dictionaryData.definitionText = filterDefinitionText(definitionResponse[0].text);
            dictionaryData.source = "wordnik";

            switch (definitionResponse[0].sourceDictionary) {

                case "ahd-legacy":
                    dictionaryData.attributionText = FULL_TITLE_AHD;
                    dictionaryData.attributionURL  = SEARCH_URL_AHD + global.dictionaryData.title;
                    break;

               case "wiktionary":
                    dictionaryData.attributionText = FULL_TITLE_WIKTIONARY;
                    dictionaryData.attributionURL  = SEARCH_URL_WIKTIONARY + global.dictionaryData.title;
                    break;

                case "gcide":
                    dictionaryData.attributionText = FULL_TITLE_GCIDE;
                    dictionaryData.attributionURL  = SEARCH_URL_GCIDE + global.dictionaryData.title;
                    break;
 
                case "century":
                    dictionaryData.attributionText = FULL_TITLE_CENTURY;
                    dictionaryData.attributionURL  = SEARCH_URL_CENTURY + global.dictionaryData.title;
                    break;
 
                case "wordnet":
                    dictionaryData.attributionText = FULL_TITLE_WORDNET;
                    dictionaryData.attributionURL  = SEARCH_URL_WORDNET + global.dictionaryData.title;
                    break;
            }

            showAnnotationBubble();
            getPronunciation();

            // After the size of the definition bubble is known,
            // position the example bubble relative to it.
            getRandomExampleIfEnabled();
        }
        else {
            sendGetRequestWikipediaExtract();
        }
    });

    function closeTextBubbles() {
        if (global.isTemplateLoaded) {
            var exampleContainer = document.getElementById('axon-example-container');
            var annotationContainer = document.getElementById('axon-annotation-container');
            var styleContainer = document.getElementById('axon-style-container');

            if (exampleContainer!==null)
                exampleContainer.parentNode.removeChild(exampleContainer);

            if (annotationContainer!==null)
                annotationContainer.parentNode.removeChild(annotationContainer);

            if (styleContainer!==null)
                styleContainer.parentNode.removeChild(styleContainer);

            global.isTemplateLoaded = false;
        }
    }

    function closeTextBubblesAndCancelOperations() {
        closeTextBubbles();
        global.mustCancelOperations = true;
    }

    function insertTextIntoElement(text, intoElement) {
        var newTextNode = document.createTextNode(text);
        emptyElement(intoElement);
        intoElement.insertBefore(newTextNode, null);
    }

    function parseHTMLAndInsertIntoElement(dataString, intoElement, mustEmptyFirst) {

        if (typeof mustEmptyFirst!=='undefined' && mustEmptyFirst)
            emptyElement(intoElement);

        var parser = new DOMParser();
        // Parse HTML template to DOM document.
        var doc = parser.parseFromString(dataString, "text/html");
        var childNodes = doc.body.childNodes;

        while(childNodes.length>0) {
            intoElement.insertBefore(childNodes[0], null);
        }
    }

    function loadTemplate(data) {

        var newStyleElement = document.createElement('style');
        newStyleElement.id = "axon-style-container";
        parseHTMLAndInsertIntoElement(data.htmlTemplateCss, newStyleElement);
        document.getElementsByTagName('head')[0].appendChild(newStyleElement);

        var bodyElement = document.getElementsByTagName('body')[0];
        parseHTMLAndInsertIntoElement(data.htmlTemplate, bodyElement);

        document.getElementById('annotation-audio-icon').addEventListener('click', function(e) {
            var audio = document.createElement("audio");
            audio.src = this.firstChild.innerHTML;
            audio.play();
        });

        document.getElementById('annotation-audio-icon').addEventListener('dblclick', function(e) {
            e.stopPropagation();
            e.preventDefault();
            return false;
        });

        document.getElementById('annotation-definition').addEventListener("click", function(e) {
            e.stopPropagation();
        });

        document.getElementById('annotation-main').addEventListener("click", function(e) {
            e.stopPropagation();
        });

        document.getElementById('example-main').addEventListener("click", function(e) {
            e.stopPropagation();
        });

        document.getElementById("annotation-close").addEventListener("click", function(e) {
            if (e.which===1) { // left mouse button
                closeTextBubblesAndCancelOperations();
            }
        });

        document.getElementById("example-close").addEventListener("click", function(e) {
            if (e.which===1) { // left mouse button
                document.getElementById('axon-example-container').className = "displayNone";
            }
        });
    }

    /* Find position of DOM element (http://www.quirksmode.org/js/getPositionOfDomElement.html). */
    function getPositionOfDomElement(domElement) {

        var curleft = 0, curtop = 0;

        if (domElement.offsetParent) {

            do {
                curleft += domElement.offsetLeft;
                curtop += domElement.offsetTop;
            } while (domElement = domElement.offsetParent);

            return {"top": curtop, "left": curleft};
        }
    }

    function getUniqueNumber() {
        var i, uniqueNumber = new Date().getTime().toString(32);
        for (i = 0; i < 12; i++) {
            uniqueNumber += Math.floor(Math.random() * 65535).toString(32);
        }
        return uniqueNumber;
    }

    function getSelectedTextPosition(Range) {

        var id = getUniqueNumber();
        var containerID = "selectedTextContainer-"+id;

        try {
            var rect = Range.getBoundingClientRect();
            var selectionBackup = Range.cloneContents();
            var newSpanElement = document.createElement('span');
            newSpanElement.id = containerID;

            // Following statement sometimes fails to enclose <i>word</i>
            Range.surroundContents(newSpanElement);
        }
        catch(error) {
            return null;
        }

        var containerElement = document.getElementById(containerID);
        var pos = getPositionOfDomElement(containerElement);

        var i=3;
        var tmpNode = containerElement.parentNode;
        // The prefix 'is' should be used for boolean variables and methods. 
        // (Java Programming Style Guidelines - http://geosoft.no/development/javastyle.html)
        var isInsideBubble = false; // Selected text is inside the dictionary speech bubble.

        while (i-->0) {
            tmpNode = tmpNode.parentNode;
            if (tmpNode.id==="annotation-main" || tmpNode.id==="example-main")
                isInsideBubble = true;
        }

        // Insert the original HTML text before the selected text container
        containerElement.parentNode.insertBefore(selectionBackup, containerElement);

        // Remove the selected text container to restore the document to its original state
        containerElement.parentNode.removeChild(containerElement);

        var data = {
            "top"            : pos.top,
            "right"          : pos.left + rect.width,
            "bottom"         : pos.top + rect.height,
            "left"           : pos.left,
            "leftCenter"     : pos.left + rect.width/2,
            "isInsideBubble" : isInsideBubble
        };

        data.equals = function(objectB) {
            var _this = this;
            var objectsAreEqual = true;
            Object.keys(this).forEach(function(key) {
                if (typeof(_this[key])!=='function')
                    if (_this[key]!==objectB[key]) objectsAreEqual=false;
            });
            return objectsAreEqual;
        }
        return data;
    }

    function filterSelectedText(text) {

        // Remove heading and trailing spaces
        text = text.replace(/^\s+|\s+$/g, "");

        // Remove punctuation
        text = text.replace(/[’'!"#$%\\'()\*+,\-\.\/:;<=>?@\[\\\]\^_`{|}~']/g,"");

        // If multiple words were selected in one Range use the first
        //text = text.replace(/^([A-z]*)(\s+|$).*/,"$1");

        // Change the text to lower case and return it
        return text;
    }

    function sendGetRequestWikipediaExtract() {
        self.port.emit("sendGetRequest", {
            type         : "wikipediaExtract",
            searchString : global.suggestedTextString || global.selectedTextString,
            languageCode : global.config.runtime.wikipediaLanguageCode,
            onComplete   : "wikipediaExtractListener"
        });
    }

    function getWordnikOrWikipediaEntry() {

        if (global.config.runtime.mustSearchWikipediaOnly) {
            sendGetRequestWikipediaExtract();
        }
        else {
            self.port.emit("sendGetRequest", {
                type         : "wordnikDefinitions",
                searchString : global.suggestedTextString || global.selectedTextString,
                onComplete   : "definitionListener"
            });
        }
    }


    /* Initialize dictionaryData. Holds data fetched from external resources (Wordnik/Wikipedia). */
    function initializeDictionaryData() {
        global.dictionaryData.title           = "";
        global.dictionaryData.definitionText  = "";
        global.dictionaryData.exampleTitle    = "";
        global.dictionaryData.exampleText     = "";
        global.dictionaryData.exampleURL      = "";
        global.dictionaryData.audioFileURL    = "";
        global.dictionaryData.source          = "";
        global.dictionaryData.attributionText = "";
        global.dictionaryData.attributionURL  = "";
    }

    /* 
     * configAndTemplateListener receives template.html and css from the add-on data
     * folder, inserts the template into the body of the current document, and calls
     * the first worker listener. The worker listeners fetch data from the Wordnik
     * API and other external resources, insert the fetched data into the speech
     * bubble template, calculate dimensions and position the template.
     */
    self.port.on("setConfiguration", function(data) {
        var runtime = global.config.runtime;
        global.config = data;
        global.config.runtime = runtime;
    });
 
    function wasHotkeyPressed(hotkey) {
        return (global.modifierKeyPressedString===hotkey);
    }

    function getModifierKeyFromEvent(e) {
        var keyPressed = "none";
        Object.keys(MODIFIER_KEYS).forEach(function(key) {
            if (e[MODIFIER_KEYS[key]]) keyPressed = key;
        });
        return keyPressed;
    }

    var htmlElement = document.getElementsByTagName('html')[0];
    if (typeof htmlElement!=="undefined") {
        htmlElement.addEventListener("keydown", function(e) {

            if (global.isTemplateLoaded) {

                e.stopPropagation();
                // ESCAPE key pressed
                if (e.keyCode == 27) {
                    closeTextBubblesAndCancelOperations();
                }
            }
        });
    }

    function handleSelection(e) {

        // Enable closeTextBubblesAndCancelOperations() on window click
        global.ignoreCancellationClick = false;

        global.modifierKeyPressedString = getModifierKeyFromEvent(e);

        // Either Dblclick or Mouseup
        if (e.type !== global.config.activateAxonWhenI) {
            return;
        } 

        // Either 'Disable hotkey' was selected or one of the hotkeys
        // has to have been pressed.
        if ('none' !== global.config.activateAxonWhileHoldingDown && 
            !wasHotkeyPressed(global.config.activateAxonWhileHoldingDown) &&
            !wasHotkeyPressed(global.config.secondWikipediaHotkey))
        {
            return;
        }

        var Selection = window.getSelection();
        if (Selection.rangeCount===0) return;

        var Range = null;
        if (Selection.rangeCount>1)
           // If multiple words selected use the last one
           Range = Selection.getRangeAt(Selection.rangeCount-1);
        else
           Range = Selection.getRangeAt(0);

        var selectedTextString = Range.toString();
        global.selectedTextString = filterSelectedText(selectedTextString);
        if (global.selectedTextString.length > 2000) return;
        if (global.selectedTextString.length===0) return;

        var selectedTextPosition = getSelectedTextPosition(Range);
        if (selectedTextPosition===null) return;

        // If the same text is selected again and the template is still active
        // then cancel.
        if (global.selectedTextPosition!==null && selectedTextPosition.equals(global.selectedTextPosition)) {
            if (global.isTemplateLoaded) {
                closeTextBubblesAndCancelOperations();
                return;
            }
        }

        // Will be switched off by mouseup listener calling this function
        // before click event listener is called.
        global.ignoreCancellationClick = true;

        // If a text inside the dictionary bubble was selected then
        // keep the old selected text position.
        if (selectedTextPosition.isInsideBubble) {
            selectedTextPosition = global.selectedTextPosition;
            // Hide example text bubble
            document.getElementById('axon-example-container').className = "displayNone";
        }
        else {
            // If present close the speech bubbles from previous selection
            closeTextBubbles();
        }

        global.mustCancelOperations = false;
        global.selectedTextPosition = selectedTextPosition;

        // Insert template.html and template.css into body of document
        if (global.isTemplateLoaded === false) {
            loadTemplate(global.config);
            global.isTemplateLoaded = true;
        }

        /* Wikipedia */
        global.config.runtime.wikipediaLanguageCode   = global.config.mainWikipediaLanguageCode;
        global.config.runtime.mustSearchWikipediaOnly = global.config.isWikipediaOnlyEnabled;

        initializeDictionaryData();
        global.dictionaryData.definitionText = START_OF_SEARCH_TEXT;
        showAnnotationBubble();

        if (wasHotkeyPressed(global.config.secondWikipediaHotkey)) {
            global.config.runtime.wikipediaLanguageCode = global.config.secondWikipediaLanguageCode;
            // If the second Wikipedia hotkey was pressed prevent searching the Dictionary
            global.config.runtime.mustSearchWikipediaOnly = true;
        }
        getWordnikOrWikipediaEntry();
    }

    window.addEventListener("dblclick", function(e) {
        handleSelection(e);
    }, true);

    window.addEventListener("mouseup", function(e) {
        if (e.which!==1) return; // if not left mouse button
        if (global.mustIgnoreMouseUp){ // enables links inside speech bubble
            global.mustIgnoreMouseUp = false;
            return;
        }
        handleSelection(e);
    }, true);

    window.addEventListener("click", function(e) {
        if (e.which===1 && 
            global.isTemplateLoaded && 
            !global.ignoreCancellationClick)
        {
            closeTextBubblesAndCancelOperations();
        }
    });

})();
