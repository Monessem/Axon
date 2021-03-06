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
 
    var global                           = {};      // used by DOM and Worker listeners
    global.dictionaryData                = {};      // dictionaryData variables are initialized in domListeners.js templateListener
    global.config                        = {};      // container for add-on configuration parameters
    global.config.runtime                = {};      // runtime configuration parameters
    global.selectedTextPosition          = null;    // bounding dimensions of selected text
    global.originalSelectedTextString    = "";      // unfiltered selected text
    global.selectedTextString            = "";      // filtered selected text
    global.suggestedTextString           = "";      // Wikipedia suggested correction to selectedTextString
    global.isTextBubbleAboveSelectedText = true;    // whereabouts of definition speech bubble to correctly position example text
    global.isTemplateLoaded              = false;   // prevents loading template multiple times
    global.mustCancelOperations          = false;   // cancel calls in process after esc, close button, or clicking next to the speech bubbles
    global.hasAxonLoadedGoogleMaps       = false;   // flag indicating if Axon has loaded Google Maps
    global.isAxonGoogleMapsFirstTime     = true;    // flag indicating whether Axon will be starting Google Maps for the first time
    global.modifierKeyPressedString      = "";      // the modifier key held down during double-click (see MODIFIER_KEYS)

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

    // Wordnik, Wikipedia and Google Maps URLs
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
    const UNIQUE_STRING                  = getUniqueString();

    // Function from jQuery JavaScript Library v1.11.2
    function isEmpty( obj ) {
        for (let name in obj ) {
            return false;
        }
        return true;
    }

    function emptyElement(element) {
        while ( element.firstChild ) {
            element.removeChild( element.firstChild );
        }
    }

    function removeElementById(elementId) {
        let element = document.getElementById(elementId);
        if (element!=null && element.parentNode!==null)
            element.parentNode.removeChild(element);
    }

    function getUniqueString() {
        var i, uniqueString = new Date().getTime().toString(32);
        for (i = 0; i < 12; i++) {
            uniqueString += Math.floor(Math.random() * 65535).toString(32);
        }
        return uniqueString;
    }

    function setAnnotationBubbleTextAndAudio() {

        var annotationMore = document.getElementById('annotation-more');
        var annotationAttribution = document.getElementById('annotation-attribution');

        // Remove class displayNone
        document.getElementById('axon-annotation-container').className = "";

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

    function showExampleBubble(mayTryAgain) {

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
                if ((typeof(mayTryAgain)==="undefined" || mayTryAgain===true) && 
                    window.scrollY > (global.selectedTextPosition.top + mainOffset))
                {
                    setAnnotationBubblePosition(true/*force direction down*/);
                    showExampleBubble(false);
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
            setAnnotationBubbleTextAndAudio();
        }
    });

    self.port.on("wiktionaryAudioListener", function(response) {

        if (global.mustCancelOperations === true) return;
        response = JSON.parse(response);

        var pageKey = response!==null && Object.keys(response.query.pages)[0] || -1;

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

        if (!isEmpty(audioResponse)) {

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
            setAnnotationBubbleTextAndAudio();
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

        // Wikipedia extracts sometimes return with empty paragraphs
        // probably left over after removal of hatnotes.
        text = text.replace(/<p><br \/><\/p>/gi, "");

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

    function getGoogleMapsScriptElements(callback) {

        var allScriptTags = document.getElementsByTagName("script");
        // Fast loop: http://jsperf.com/for-vs-foreach/32
        for (let i=allScriptTags.length-1; i>=0; --i) {
            var isGoogleMapsScript = ["maps.googleapis.com", "maps.gstatic.com", "maps.google.com"].some(
                function(URL) {
                    if (allScriptTags[i]!==null && allScriptTags[i].src!==null) {
                        return allScriptTags[i].src.indexOf(URL)!==-1;
                    }
                }
            );
            if (isGoogleMapsScript) {
                if (callback(allScriptTags[i])===false) break;
            }
        }
    }

    function removeGoogleMapScripts() {
        getGoogleMapsScriptElements(function(element) {
            element.parentNode.removeChild(element);
            return true; // continue
        });
    }

    function hasAxonLoadedGoogleMaps() {

        if (global.isAxonGoogleMapsFirstTime===false) {
            var indicatorDiv = document.getElementById(UNIQUE_STRING);
            if (indicatorDiv!==null) {
                var indicator = JSON.parse(indicatorDiv.innerHTML);
                global.hasAxonLoadedGoogleMaps = !indicator.isGoogleMapsInUseByWebsite;
            }
        }
        return global.hasAxonLoadedGoogleMaps;
    }

    function unloadGoogleMaps() {

        // What is the proper way to destroy a map instance?
        // http://stackoverflow.com/questions/10485582/what-is-the-proper-way-to-destroy-a-map-instance
        // https://www.youtube.com/watch?v=rUYs765QX-8&feature=plcp 12:50

        removeGoogleMapScripts();

        var googleMapsIFrame = document.getElementsByName("gm-master")[0];
        if (typeof(googleMapsIFrame)!=='undefined' &&
            googleMapsIFrame.src.indexOf("www.google.com")!==-1)
        {
            googleMapsIFrame.parentNode.removeChild(googleMapsIFrame);
        }

        removeElementById("axonStartGoogleMapsScript");
        removeElementById("axonGoogleMapsInitializationScript");

        // Sometimes multiple axon-map-canvas divs in container
        // caused by fast successive mouse clicks.
        var canvasContainer = document.getElementById('axon-map-canvas-container');
        emptyElement(canvasContainer);
    }

    self.port.on("googleMapsGeocodeListener", function(response) {

        if (global.mustCancelOperations === true) return;
        var response = JSON.parse(response);

        if (!isEmpty(response) && response.results.length>0) {

            let mapResult = response.results[0];
            let mapAddress = mapResult.address_components;
            let mapLocation = mapResult.geometry.location;
            if (mapAddress.length<1) return;
            var addressLongName = mapAddress[0].long_name;
            var showLocationInGoogleMaps = false;

            switch (global.config.startGoogleMapsCondition) {

                // The selected text is a state, country, municipality, community, large civil entity, natural feature or point of interest"
                case "countryCityNaturalFeaturePOI":
                    if (mapAddress[0].types.indexOf("point_of_interest")!==-1 ||
                       (typeof(mapAddress[1])!=='undefined' &&
                        mapAddress[1].types.some(function(element) {
                            // a large first-order civil entity below a locality (e.g. Yosemite)
                            return element.indexOf("sublocality_level_1")!==-1;
                        })))
                    {
                        showLocationInGoogleMaps = true;
                    }
                    //nobreak

                // The selected text is a country, state, municipality, community (unincorporated area), or natural feature
                case "countryCityNaturalFeature": 
                    if (// Any administrative area below the country
                        mapAddress[0].types.some(function(element) { return element.indexOf("administrative_area_level")!==-1; }) ||
                        // Borough (e.g. Manhattan)
                        mapAddress[0].types.indexOf("sublocality_level_1")!==-1 ||
                        // Municipality / community
                        ["locality","political"].every(function(element) { return mapAddress[0].types.indexOf(element)!==-1;}) &&
                        typeof(mapAddress[1])!=='undefined' &&
                        mapAddress[1].types.some(function(element) { 
                            // an administrative area (civil entity below country level)
                            return element.indexOf("administrative_area_level")!==-1 || element.indexOf("country")!==-1 //e.g. Istanbul
                        }))
                    {
                        showLocationInGoogleMaps = true;
                    }
                    //nobreak

                case "countryNaturalFeature":
                    // The selected text is a natural feature (includes continents) or a country 
                    if (mapAddress[0].types.indexOf("natural_feature")!==-1 || 
                        mapAddress[0].types.indexOf("country")!==-1 ||
                        // State
                        mapAddress[0].types.indexOf("administrative_area_level_1")!==-1)
                    {
                        showLocationInGoogleMaps = true;
                    }
                    break;

                case "any":
                    // Exclude buildings and routes
                    // See also: https://developers.google.com/maps/documentation/geocoding/
                    showLocationInGoogleMaps = ['premise','subpremise','route'].every(function(element) {
                        return (mapAddress[0].types.indexOf(element)===-1);
                    });
                    break;
            }

            if (showLocationInGoogleMaps) {

                var newScriptElement = document.createElement('script');
                newScriptElement.id = "axonGoogleMapsInitializationScript";

                var data = {};
                data.coordinates     = mapLocation;
                data.zoomLevelBubble = global.config.axonGoogleMapsInExampleBubbleZoomLevel;
                data.zoomLevelMaps   = global.config.axonGoogleMapsOpenInNewTabZoomLevel;
                data.addressLongName = addressLongName;
                data.uniqueString    = UNIQUE_STRING;
                data.isFirstTime     = global.isAxonGoogleMapsFirstTime;

                if (global.isAxonGoogleMapsFirstTime===true) {
                    global.isAxonGoogleMapsFirstTime = false;
                }

                var js = "window.axonData="+JSON.stringify(data)+";"+global.config.htmlGmapJS;
                insertTextIntoElement(js, newScriptElement);
                document.getElementsByTagName('head')[0].appendChild(newScriptElement);

                showExampleBubble();
            }

        }
    });

    function getGoogleMapIfEnabled() {

        if (global.config.startGoogleMapsCondition!=="disable")
        {
            self.port.emit("sendGetRequest", {
                type         : "googleMapsGeocode",
                searchString : global.dictionaryData.title,
                onComplete   : "googleMapsGeocodeListener"
            });
        }
    }

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

            // IP<3 hone>=3
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
        getGoogleMapIfEnabled();
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
                    getGoogleMapIfEnabled();
                    getRandomExampleIfEnabled();
                }
            }
        }
    });

    self.port.on("wordnikDefinitionsListener", function(definitionResponse) {

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
            getGoogleMapIfEnabled();
            getRandomExampleIfEnabled();
        }
        else {
            sendGetRequestWikipediaExtract();
        }
    });

    function closeTextBubbles() {

        if (global.isTemplateLoaded) {

            // Try to unload Google Maps if it was not loaded
            // by the website itself.
            if (hasAxonLoadedGoogleMaps())
                unloadGoogleMaps();

            removeElementById('axon-example-container');
            removeElementById('axon-annotation-container');
            removeElementById('axon-style-container');
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

    function getDimensions(rect) {
        var data = {
            "top"            : window.scrollY + rect.top,
            "right"          : rect.left + rect.width,
            "bottom"         : window.scrollY + rect.top + rect.height,
            "left"           : rect.left,
            "leftCenter"     : rect.left + rect.width/2
        };
        return data;
    }

    function isRectAInsideRectB(rectA, rectB) {
        var a = getDimensions(rectA);
        var b = getDimensions(rectB);
        // if a is inside b return true
        if (a.top >= b.top && a.bottom <= b.bottom && a.left >= b.left && a.right <= b.right)
            return true;
        else
            return false;
    }

    function isRectInsideElement(boundingRect, element) {

        if (element!==null && boundingRect!==null) {
            var rectElement = element.getBoundingClientRect();
            return isRectAInsideRectB(boundingRect, rectElement);
        }
        return false;
    }

    function getSelectedTextPosition(Range) {

        var rectSelection = Range.getBoundingClientRect();

        // The prefix 'is' should be used for boolean variables and methods. 
        // (Java Programming Style Guidelines - http://geosoft.no/development/javastyle.html)
        var isInsideAnAxonBubble = isRectInsideElement(rectSelection, document.getElementById("annotation-main"));

        if (isInsideAnAxonBubble===false)
            isInsideAnAxonBubble = isRectInsideElement(rectSelection, document.getElementById("example-main"));

        var selectionDimensions = getDimensions(rectSelection);
        selectionDimensions.isInsideAnAxonBubble = isInsideAnAxonBubble;

        selectionDimensions.equals = function(objectB) {
            let _this = this;
            let keys = Object.keys(this);
            for (let i=0, len = keys.length; i<len; ++i) {
                let key = keys[i];
                if (typeof(_this[key])!=='function')
                    if (_this[key]!==objectB[key]) return false;
            }
            return true;
        }
        return selectionDimensions;
    }

    function filterSelectedText(text) {

        // Remove heading and trailing spaces
        text = text.replace(/^\s+|\s+$/g, "");

        // Remove punctuation
        text = text.replace(/[!"#$%\\()\*+,\.\/:;<=>?@\[\\\]\^_`{|}~]/g,"");

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
                onComplete   : "wordnikDefinitionsListener"
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

    function isMouseClickInsideGoogleMap(e) {

        var isMouseClickInsideGoogleMap = false;
        var axonMapCanvasElement = document.getElementById("axon-map-canvas");

        if (axonMapCanvasElement!==null) {

            let x = e.clientX;
            let y = e.clientY;
            let canvasRect = axonMapCanvasElement.getBoundingClientRect();

            let c = {
                top: canvasRect.top,
                left: canvasRect.left,
                right: canvasRect.left + canvasRect.width,
                bottom: canvasRect.top + canvasRect.height
            }

            isMouseClickInsideGoogleMap = (y >= c.top && y <= c.bottom && x >= c.left && x <= c.right);
        }
        return isMouseClickInsideGoogleMap;
    }

    function wasHotkeyPressed(hotkey) {
        return (global.modifierKeyPressedString===hotkey);
    }

    function getModifierKeyFromEvent(e) {
        var keys = Object.keys(MODIFIER_KEYS);
        for (var i=0, len = keys.length; i<len; ++i) {
            if (e[MODIFIER_KEYS[keys[i]]]===true) return keys[i];
        }
        return "disable";
    }

    function handleSelection(e) {

        // Enable closeTextBubblesAndCancelOperations() on window click
        global.ignoreCancellationClick = false;

        // Get modifier key that was pressed to compare against hotkey settings
        global.modifierKeyPressedString = getModifierKeyFromEvent(e);

        // Either Dblclick or Mouseup
        if (e.type !== global.config.activateAxonWhenI) {
            return;
        } 

        // Either 'Disable hotkey' was selected or one of the hotkeys
        // has to have been pressed, otherwise return.
        if ('disable' !== global.config.activateAxonWhileHoldingDown && 
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
        // then close bubbles.
        if (global.selectedTextPosition!==null && 
            global.isTemplateLoaded && 
            selectedTextPosition.equals(global.selectedTextPosition)) 
        {
            closeTextBubblesAndCancelOperations();
        }

        // Will be switched off by mouseup listener calling this function
        // before click event listener is called.
        global.ignoreCancellationClick = true;

        // If a text inside the dictionary bubble was selected then
        // keep the old selected text position.
        if (selectedTextPosition.isInsideAnAxonBubble) {
            selectedTextPosition = global.selectedTextPosition;
        }
        // If present close the speech bubbles from previous selection
        closeTextBubbles();

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

    window.addEventListener("dblclick", function(e) {
        if (isMouseClickInsideGoogleMap(e)) return;
        handleSelection(e);
    }, true);

    window.addEventListener("mouseup", function(e) {
        if (isMouseClickInsideGoogleMap(e)) return;
        if (e.which!==1) return; // if not left mouse button
        if (global.mustIgnoreMouseUp){ // enables links inside speech bubble
            global.mustIgnoreMouseUp = false;
            return;
        }
        handleSelection(e);
    }, true);

    window.addEventListener("click", function(e) {
        if (isMouseClickInsideGoogleMap(e)) return;
        if (e.which===1 && 
            global.isTemplateLoaded && 
            !global.ignoreCancellationClick)
        {
            closeTextBubblesAndCancelOperations();
        }
    });

})();
