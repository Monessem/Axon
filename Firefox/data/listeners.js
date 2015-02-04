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
    global.selectedTextPosition          = null;  // bounding dimensions of selected text
    global.originalSelectedTextString    = "";    // unfiltered selected text
    global.selectedTextString            = "";    // filtered selected text
    global.suggestedTextString           = "";    // Wikipedia suggested correction to selectedTextString
    global.isTextBubbleAboveSelectedText = true;  // whereabouts of definition speech bubble to correctly position example text
    global.isTemplateLoaded              = false; // prevents loading template multiple times
    global.mustCancelOperations          = false; // cancel calls in process after esc, close button, or clicking next to the speech bubbles
    global.modifierKeyPressedString      = "";    // the modifier key held down during double-click

    const WORDNIK_WORD_URL              = "https://www.wordnik.com/words/";
    const WIKIPEDIA_WIKI_URL            = "https://{LANGUAGECODE}.wikipedia.org/wiki/";
    const WIKIPEDIA_SPECIAL_SEARCH_URL  = "https://{LANGUAGECODE}.wikipedia.org/wiki/Special:Search/";
    const GOOGLE_DEFINE_URL             = "https://www.google.com/search?hl=en&q=define+"
    const GOOGLE_NORMAL_URL             = "https://www.google.com/search?q="
    const START_OF_SEARCH_TEXT          = "Searching...";
    const NO_DEFINITION_FOUND_TEXT      = "No definition found on ";
    const NO_DEFINITION_FOUND_WIKI_ZONE = ".wikipedia.org";
    const ENGLISH_LANGUAGE_CODE         = "en";
    const MODIFIER_KEYS                 = {"ctrl": "ctrlKey", "shift": "shiftKey", "alt": "altKey", "cmd": "metaKey"};

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
            //FIXME: non html
            parseHTMLAndInsertIntoElement(global.dictionaryData.title, annotationTitle, true);

            if (global.dictionaryData.source === "wikipedia") {
                annotationAttribution.className = "";
                var wikipediaURL = WIKIPEDIA_WIKI_URL.replace(/{LANGUAGECODE}/, global.config.wikipediaLanguageCode);
                wikipediaURL += global.dictionaryData.title;
                annotationAttribution.firstChild.setAttribute('href', wikipediaURL);
                //FIXME: non html
                parseHTMLAndInsertIntoElement(wikipediaURL.replace(/https?:\/\//gi,""), annotationAttribution.firstChild, true);

                annotationMore.className = "";
                /* Google 'define' keyword only works for English */
                var googleURL = global.config.wikipediaLanguageCode === ENGLISH_LANGUAGE_CODE ? GOOGLE_DEFINE_URL : GOOGLE_NORMAL_URL;
                annotationMore.firstChild.setAttribute('href', googleURL + global.dictionaryData.title);
                annotationMore.style.marginTop = "10px";
            }
            else {
                annotationMore.className = "";
                annotationMore.firstChild.setAttribute('href', WORDNIK_WORD_URL + global.dictionaryData.title);
                annotationMore.style.marginTop = "8px";
            }
        }

        var annotationDefinition = document.getElementById('annotation-definition');
        parseHTMLAndInsertIntoElement(global.dictionaryData.definitionText, annotationDefinition, true);

        if (global.dictionaryData.audioFileURL==="") {
            document.getElementById('annotation-audio-icon').className = "displayNone";
        }
        else {
            document.getElementById('annotation-audio-icon').className = "";
            //FIXME: non html
            parseHTMLAndInsertIntoElement(global.dictionaryData.audioFileURL, document.getElementById('annotation-audio-icon').firstChild, true);
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

            document.getElementById('annotation-tail-main').style.left = (global.selectedTextPosition.leftCenter-14)+"px";
            document.getElementById('annotation-main').style.left       = (global.selectedTextPosition.leftCenter-150)+"px";

            if (forceDirectionDown===false || typeof(forceDirectionDown)==='undefined' &&
                    // Check if there is enough room above the selected text for the speech bubble
                    window.scrollY < (global.selectedTextPosition.top - bubbleHeight - 15))
            {
                global.isTextBubbleAboveSelectedText = true;
                setInnerOuterTailDirection("annotation-tail", "up", "down");
                document.getElementById('annotation-tail-main').style.top  = (global.selectedTextPosition.top-14)+"px";
                document.getElementById('annotation-main').style.top        = (global.selectedTextPosition.top-bubbleHeight-13)+"px";
            }
            else {
                global.isTextBubbleAboveSelectedText = false;
                setInnerOuterTailDirection("annotation-tail", "down", "up");
                document.getElementById('annotation-tail-main').style.top  = (global.selectedTextPosition.bottom)+"px";
                document.getElementById('annotation-main').style.top        = (global.selectedTextPosition.bottom+12)+"px";
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
        // FIXME: non html
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
                mainOffset = +(annotationBubbleHeight-exampleBubbleHeight)/2+28;
                tailOffset = +annotationBubbleHeight/2+15;
            }

            document.getElementById('example-tail-main').style.top  = (global.selectedTextPosition.top+tailOffset)+"px";
            document.getElementById('example-main').style.top        = (global.selectedTextPosition.top+mainOffset)+"px";

            // Check if there is room on the right
            if (window.innerWidth > global.selectedTextPosition.leftCenter+475 ) {
                canExampleFitNextToAnnotation = true;
                setInnerOuterTailDirection("example-tail", "right", "left");
                document.getElementById('example-tail-main').style.left = (global.selectedTextPosition.leftCenter+150)+"px";
                document.getElementById('example-main').style.left       = (global.selectedTextPosition.leftCenter+162)+"px";
            }
            else {
                // Check if there is room on the left
                if (global.selectedTextPosition.leftCenter>465 ) {
                    canExampleFitNextToAnnotation = true;
                    setInnerOuterTailDirection("example-tail", "left", "right");
                    document.getElementById('example-tail-main').style.left = (global.selectedTextPosition.leftCenter-150-14)+"px";
                    document.getElementById('example-main').style.left       = (global.selectedTextPosition.leftCenter-462)+"px";
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

            global.dictionaryData.exampleTitle = toLowerCaseIfNotAnAbbreviation(randomExample.title);
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
            languageCode = global.config.wikipediaLanguageCode;
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
                                keyword      : fileNameWithPrefix,
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
                keyword      : global.dictionaryData.title,
                languageCode : getLanguageCode(),
                onComplete   : "wiktionaryAudioListener"
            });
        }
        else {
            showAnnotationBubble();
        }
    });

    function filterDefinitionText(text) {

        // Definition not allowed to end in ', especially:'
        text = text.replace(/^(.*),\sespecially:$/g, "$1.");

        // Wikipedia definitions start with bold. Remove bold tags
        // because the title above is already bold.
        text = text.replace(/<b>[^A-Za-z]*([A-Za-z ]+)[^A-Za-z]*<\/b>/gi, "$1");

        // Abbreviate to 300 characters and add ellipsis
        if (text.length > 300) {
            text = text.substring(0,300);
            text = text.replace(/\S+?\s?$/, " ...");
        }
        return text;
    }

    self.port.on("errorListener", function(response) {
        var errorContainer = JSON.parse(response);
        initializeDictionaryData();
        global.dictionaryData.definitionText = "<b>"+errorContainer.title+"</b><div style='margin:5px 0;'></div>";
        global.dictionaryData.definitionText += errorContainer.error;
        showAnnotationBubble();
        global.mustCancelOperations = true;
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
            else getWordnikOrWikipediaEntry();
        }
    });

    function getRandomExampleIfEnabled() {

        if (global.config.isRandomExampleEnabled) {

            self.port.emit("sendGetRequest", {
                type       : "wordnikExamples",
                keyword    : global.selectedTextString,
                onComplete : "wordnikExamplesListener"
            });
        }
    }

    function getPronunciation() {

        if (getLanguageCode() === ENGLISH_LANGUAGE_CODE) {
            self.port.emit("sendGetRequest", {
                type       : "wordnikAudio",
                keyword    : global.dictionaryData.title,
                onComplete : "wordnikAudioListener"
            });
        }
        else { 
            self.port.emit("sendGetRequest", {
                type         : "wiktionaryAudio",
                keyword      : global.dictionaryData.title,
                languageCode : global.config.wikipediaLanguageCode,
                onComplete   : "wiktionaryAudioListener"
            });
        }
    }

    function showNoDefinitionFound() {
        var wikipediaURL = WIKIPEDIA_SPECIAL_SEARCH_URL.replace(/{LANGUAGECODE}/, global.config.wikipediaLanguageCode);
        wikipediaURL += global.selectedTextString;
        var wikipediaDomain = global.config.wikipediaLanguageCode + NO_DEFINITION_FOUND_WIKI_ZONE;
        global.dictionaryData.definitionText = NO_DEFINITION_FOUND_TEXT + "<a href='"+wikipediaURL+"' target='_blank'>"+wikipediaDomain+"</a>";
        showAnnotationBubble();
    }

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
                        keyword      : global.selectedTextString,
                        languageCode : global.config.wikipediaLanguageCode,
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
                global.dictionaryData.title = toLowerCaseIfNotAnAbbreviation(page.title);
                global.dictionaryData.definitionText = filterDefinitionText(page.extract);
                global.dictionaryData.source = "wikipedia";

                showAnnotationBubble();
                getPronunciation();
                getRandomExampleIfEnabled();
            }
        }
    });

    function toLowerCaseIfNotAnAbbreviation(string) {
        if (string===string.toUpperCase())
            return string;
        return string.toLowerCase();
    }

    self.port.on("definitionListener", function(definitionResponse) {

        if (global.mustCancelOperations === true) return;
        definitionResponse = JSON.parse(definitionResponse);

        if (!isEmpty(definitionResponse)) {

            // Reset suggestion
            global.suggestedTextString = "";

            global.dictionaryData.title = toLowerCaseIfNotAnAbbreviation(definitionResponse[0].word);
            global.dictionaryData.definitionText = filterDefinitionText(definitionResponse[0].text);
            global.dictionaryData.source = "wordnik";

            showAnnotationBubble();
            getPronunciation();

            // After the size of the definition bubble is known,
            // position the example bubble relative to it.
            getRandomExampleIfEnabled();
        }
        else {

            self.port.emit("sendGetRequest", {
                type         : "wikipediaExtract",
                keyword      : global.suggestedTextString || global.selectedTextString,
                languageCode : global.config.wikipediaLanguageCode,
                onComplete   : "wikipediaExtractListener"
            });
        }
    });

    function closeTextBubblesAndCancelOperations() {

        global.mustCancelOperations = true;

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

        return {
            "top"            : pos.top,
            "right"          : pos.left + rect.width,
            "bottom"         : pos.top + rect.height,
            "left"           : pos.left,
            "leftCenter"     : pos.left + rect.width/2,
            "isInsideBubble" : isInsideBubble
        };
    }

    function filterSelectedText(text) {

        // Remove heading and trailing spaces
        text = text.replace(/^\s+|\s+$/g, "");

        // Remove punctuation
        text = text.replace(/['!"#$%&\\'()\*+,\-\.\/:;<=>?@\[\\\]\^_`{|}~']/g,"");

        // If multiple words were selected in one Range use the first
        text = text.replace(/^([A-z]*)(\s+|$).*/,"$1");

        // Change the text to lower case and return it
        return toLowerCaseIfNotAnAbbreviation(text);
    }

    function getWordnikOrWikipediaEntry() {

        if (global.config.isWikipediaOnlyEnabled) {

            self.port.emit("sendGetRequest", {
                type         : "wikipediaExtract",
                keyword      : global.suggestedTextString || global.selectedTextString,
                languageCode : global.config.wikipediaLanguageCode,
                onComplete   : "wikipediaExtractListener"
            });
        }
        else {
            self.port.emit("sendGetRequest", {
                type       : "wordnikDefinitions",
                keyword    : global.suggestedTextString || global.selectedTextString,
                onComplete : "definitionListener"
            });
        }
    }

    /* Initialize dictionaryData. Holds data fetched from external resources (Wordnik/Wikipedia). */
    function initializeDictionaryData() {
        global.dictionaryData.title          = "";
        global.dictionaryData.definitionText = "";
        global.dictionaryData.exampleTitle   = "";
        global.dictionaryData.exampleText    = "";
        global.dictionaryData.exampleURL     = "";
        global.dictionaryData.audioFileURL   = "";
        global.dictionaryData.source         = "";
    }

    /* 
     * configAndTemplateListener receives template.html and css from the add-on data
     * folder, inserts the template into the body of the current document, and calls
     * the first worker listener. The worker listeners fetch data from the Wordnik
     * API and other external resources, insert the fetched data into the speech
     * bubble template, calculate dimensions and position the template.
     */
    self.port.on("configAndTemplateListener", function(data) {

        if (global.isTemplateLoaded === false) {
            loadTemplate(data);
            global.isTemplateLoaded = true;
        }

        /* Wikipedia */
        global.config.wikipediaLanguageCode = wasHotkeyPressed(data.hotkey) ? data.immediateLookupWikipediaLanguageCode : data.mainWikipediaLanguageCode;
        global.config.isWikipediaOnlyEnabled = data.isWikipediaOnlyEnabled || wasHotkeyPressed(data.hotkey);

        /* Show a random example next to every word */
        global.config.isRandomExampleEnabled = data.isRandomExampleEnabled;

        initializeDictionaryData();
        global.dictionaryData.definitionText = START_OF_SEARCH_TEXT;
        showAnnotationBubble();
        getWordnikOrWikipediaEntry();
    });

    function wasHotkeyPressed(hotkey) {
        return (global.modifierKeyPressedString===hotkey);
    }

    function getModifierKeyFromDoubleClickEvent(e) {
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

    window.addEventListener("click", function(e) {
        if (e.which===1) { // left mouse button
            closeTextBubblesAndCancelOperations();
        }
    });

    window.addEventListener("dblclick", function(e) {

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

         // If a text inside the dictionary bubble was selected then
         // keep the old selected text position.
         if (selectedTextPosition.isInsideBubble) {
             selectedTextPosition = global.selectedTextPosition;
             // Hide example text bubble
             document.getElementById('axon-example-container').className = "displayNone";
         }

         global.mustCancelOperations = false;
         global.selectedTextPosition = selectedTextPosition;
         global.modifierKeyPressedString = getModifierKeyFromDoubleClickEvent(e);

         /* Request templates from add-on data folder */
         self.port.emit("getConfigurationAndTemplate", {
             onComplete    : "configAndTemplateListener"
         });
    }, true);

})();
